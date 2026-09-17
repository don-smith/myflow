#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LIFECYCLE_SCHEMA_VERSION, canonicalJson } from "../../myflow/scripts/lib/lifecycle-contract.mjs";
import { resolveWorkstreamRoot } from "../../myflow/scripts/lib/artifact-store.mjs";
import { resolveRepositoryContext } from "../../myflow/scripts/lib/repository-context.mjs";
import { appendPrivateRecord } from "./lib/private-store.mjs";

export const STAGE_FEEDBACK_SCHEMA_VERSION = "myflow-stage-feedback/v1";
export const STAGE_FEEDBACK_RATINGS = Object.freeze(["smooth", "some-friction", "rough"]);
export const STAGE_FEEDBACK_STATUSES = Object.freeze(["recorded", "skipped", "pending"]);
export const HOST_CAPABILITIES = Object.freeze(["structured", "plain-text", "none"]);

const SKILL_BY_STAGE = Object.freeze({
  Scope: "scope",
  Plan: "plan",
  Implement: "implement",
  Verify: "validate",
  Close: "close",
});
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const scriptPath = fileURLToPath(import.meta.url);
const defaultPackageRoot = resolve(dirname(scriptPath), "../../..");

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
}

function safeValue(value, name) {
  requiredString(value, name);
  if (!SAFE_VALUE.test(value)) throw new Error(`${name} must be filesystem-safe`);
}

function hash(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

async function packageContext(packageRoot, canonicalStage) {
  const skillName = SKILL_BY_STAGE[canonicalStage];
  if (!skillName) throw new Error("canonicalStage must be Scope, Plan, Implement, Verify, or Close");
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const skill = await readFile(join(packageRoot, "skills", skillName, "SKILL.md"));
  let gitCommit = "unavailable";
  try {
    gitCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Installed packages need not retain Git metadata.
  }
  return {
    myflowVersion: String(packageJson.version ?? "unknown"),
    myflowGitCommit: gitCommit,
    governingSkill: { name: skillName, digest: hash(skill) },
    lifecycleSchemaVersion: LIFECYCLE_SCHEMA_VERSION,
  };
}

function validateFeedback(options) {
  for (const [value, name] of [
    [options.workstreamId, "workstreamId"],
    [options.attemptId, "attemptId"],
    [options.idempotencyKey, "idempotencyKey"],
  ]) safeValue(value, name);
  requiredString(options.source, "source");
  if (!Number.isInteger(options.attemptOrdinal) || options.attemptOrdinal < 1) {
    throw new Error("attemptOrdinal must be a positive integer");
  }
  if (!STAGE_FEEDBACK_STATUSES.includes(options.status)) {
    throw new Error(`status must be one of ${STAGE_FEEDBACK_STATUSES.join(", ")}`);
  }
  if (!HOST_CAPABILITIES.includes(options.hostCapability)) {
    throw new Error(`hostCapability must be one of ${HOST_CAPABILITIES.join(", ")}`);
  }
  if (options.status === "recorded" && !STAGE_FEEDBACK_RATINGS.includes(options.rating)) {
    throw new Error(`recorded feedback requires a rating of ${STAGE_FEEDBACK_RATINGS.join(", ")}`);
  }
  if (options.status !== "recorded" && options.rating !== undefined) {
    throw new Error(`${options.status} feedback must not include a rating`);
  }
  if (options.note !== undefined) {
    if (!["some-friction", "rough"].includes(options.rating)) {
      throw new Error("a note is allowed only for some-friction or rough feedback");
    }
    if (typeof options.note !== "string" || !options.note.trim() || options.note.includes("\n")) {
      throw new Error("note must be one non-empty sentence");
    }
    if (options.note.length > 500) throw new Error("note must not exceed 500 characters");
  }
}

export async function recordStageFeedback(options) {
  validateFeedback(options);
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const repository = resolveRepositoryContext(repositoryRoot).identity;
  // Feedback lives with the workstream (`<workstreamRoot>/<id>/feedback/`) in
  // every store mode, so it syncs with the rest of the workstream.
  const workstreamRoot = resolve(
    options.workstreamRoot ??
      resolveWorkstreamRoot(repositoryRoot, { env: options.env, invokedPath: options.invokedPath }).workstreamRoot,
  );
  const context = await packageContext(resolve(options.packageRoot ?? defaultPackageRoot), options.canonicalStage);
  context.hostCapability = options.hostCapability;
  const recordId = `feedback_${hash({
    repository,
    workstreamId: options.workstreamId,
    attemptId: options.attemptId,
    idempotencyKey: options.idempotencyKey,
  }).slice(0, 32)}`;
  const record = {
    schemaVersion: STAGE_FEEDBACK_SCHEMA_VERSION,
    recordId,
    recordedAt: options.recordedAt ?? new Date().toISOString(),
    repository,
    workstreamId: options.workstreamId,
    attemptId: options.attemptId,
    attemptOrdinal: options.attemptOrdinal,
    canonicalStage: options.canonicalStage,
    status: options.status,
    source: options.source,
    ...(options.rating ? { rating: options.rating } : {}),
    ...(options.note ? { note: options.note.trim() } : {}),
    context,
  };
  const stored = await appendPrivateRecord({
    repositoryRoot,
    stateRoot: workstreamRoot,
    workstreamId: options.workstreamId,
    category: "feedback",
    record,
    validateExisting(existing) {
      const final = existing.find(
        (candidate) => candidate.attemptId === record.attemptId && candidate.status !== "pending",
      );
      if (final) throw new Error(`attempt ${record.attemptId} already has a final feedback response`);
      const pending = existing.find(
        (candidate) => candidate.attemptId === record.attemptId && candidate.status === "pending",
      );
      if (record.status === "pending" && pending) {
        throw new Error(`attempt ${record.attemptId} already has pending feedback`);
      }
    },
  });
  const journalFields = { feedbackStatus: record.status, privateRef: stored.privateRef };
  return {
    schemaVersion: STAGE_FEEDBACK_SCHEMA_VERSION,
    recordId,
    status: record.status,
    path: stored.path,
    privateRef: stored.privateRef,
    duplicate: stored.duplicate,
    journalFields,
  };
}

const OPTION_NAMES = new Map([
  ["--repository-root", "repositoryRoot"],
  ["--workstream-root", "workstreamRoot"],
  ["--workstream-id", "workstreamId"],
  ["--attempt-id", "attemptId"],
  ["--attempt-ordinal", "attemptOrdinal"],
  ["--stage", "canonicalStage"],
  ["--status", "status"],
  ["--rating", "rating"],
  ["--note", "note"],
  ["--host-capability", "hostCapability"],
  ["--source", "source"],
  ["--idempotency-key", "idempotencyKey"],
]);

const usage = `usage: record-stage-feedback.mjs --workstream-id <id> --attempt-id <id> --attempt-ordinal <n> --stage <stage> --status <recorded|skipped|pending> --host-capability <structured|plain-text|none> --source <skill> --idempotency-key <key> [--workstream-root <path>] [--rating <smooth|some-friction|rough>] [--note <sentence>]`;

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    const name = OPTION_NAMES.get(flag);
    if (!name || value === undefined) throw new Error(usage);
    options[name] = name === "attemptOrdinal" ? Number(value) : value;
  }
  return options;
}

async function main() {
  try {
    const receipt = await recordStageFeedback({ ...parseArguments(process.argv.slice(2)), invokedPath: process.argv[1] });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.message === usage ? 2 : 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();
