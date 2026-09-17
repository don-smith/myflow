import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recordStageFeedback } from "../skills/myflow/scripts/record-stage-feedback.mjs";
import {
  appendLifecycleEvent,
  validateLifecycleJournal,
} from "../skills/myflow/scripts/lib/lifecycle-store.mjs";
import { resolveRepositoryContext } from "../skills/myflow/scripts/lib/repository-context.mjs";

const repositoryRoot = process.cwd();

async function stateRoot() {
  return mkdtemp(join(tmpdir(), "myflow-stage-feedback-"));
}

async function records(path) {
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function options(root, suffix, overrides = {}) {
  return {
    repositoryRoot,
    workstreamRoot: root,
    workstreamId: "feedback-test",
    attemptId: `attempt_${suffix}`,
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    status: "recorded",
    rating: "smooth",
    hostCapability: "structured",
    source: "scope",
    idempotencyKey: `feedback-${suffix}`,
    ...overrides,
  };
}

test("records each accepted rating and an optional one-sentence note privately", async () => {
  const root = await stateRoot();
  const cases = [
    ["smooth", undefined],
    ["some-friction", "The handoff needed one correction."],
    ["rough", "The stage repeated work."],
  ];

  for (const [index, [rating, note]] of cases.entries()) {
    const receipt = await recordStageFeedback(options(root, index, { rating, ...(note ? { note } : {}) }));
    assert.equal(receipt.status, "recorded");
    assert.match(receipt.privateRef, /^feedback\/events\.jsonl#feedback_/);
    assert.deepEqual(Object.keys(receipt.journalFields).sort(), ["feedbackStatus", "privateRef"]);
    assert.equal(receipt.journalFields.feedbackStatus, "recorded");
    assert.equal("rating" in receipt.journalFields, false);
    assert.equal("note" in receipt.journalFields, false);
  }

  const saved = await records(join(root, "feedback-test", "feedback", "events.jsonl"));
  assert.deepEqual(saved.map(({ rating }) => rating), cases.map(([rating]) => rating));
  assert.deepEqual(saved.map(({ note }) => note), cases.map(([, note]) => note));
  assert.equal((await stat(join(root, "feedback-test", "feedback", "events.jsonl"))).mode & 0o777, 0o600);
});

test("keeps skipped and pending autonomous Implement feedback distinct", async () => {
  const root = await stateRoot();
  const skipped = await recordStageFeedback(options(root, "skip", {
    status: "skipped",
    rating: undefined,
  }));
  const pending = await recordStageFeedback(options(root, "pending", {
    canonicalStage: "Implement",
    source: "implement",
    status: "pending",
    rating: undefined,
    hostCapability: "none",
  }));

  assert.equal(skipped.journalFields.feedbackStatus, "skipped");
  assert.equal(pending.journalFields.feedbackStatus, "pending");
  const saved = await records(join(root, "feedback-test", "feedback", "events.jsonl"));
  assert.equal(saved[0].rating, undefined);
  assert.equal(saved[1].rating, undefined);
  assert.equal(saved[1].context.hostCapability, "none");
});

test("captures plain-text fallback and versioned attempt context", async () => {
  const root = await stateRoot();
  const receipt = await recordStageFeedback(options(root, "plain", {
    canonicalStage: "Verify",
    source: "verify",
    hostCapability: "plain-text",
    rating: "some-friction",
  }));
  const [saved] = await records(receipt.path);

  assert.equal(saved.context.hostCapability, "plain-text");
  assert.equal(saved.context.lifecycleSchemaVersion, "myflow-lifecycle/v1");
  assert.match(saved.context.myflowVersion, /^\d+\.\d+\.\d+/);
  assert.match(saved.context.governingSkill.digest, /^[a-f0-9]{64}$/);
  assert.equal(saved.context.governingSkill.name, "verify");
  assert.match(saved.context.myflowGitCommit, /^[a-f0-9]{40}$|^unavailable$/);
});

test("resolves feedback into the configured home store's workstream, never the checkout", async () => {
  const home = await stateRoot();
  await mkdir(join(home, "config"), { recursive: true });
  await writeFile(join(home, "config", "myflow.json"), JSON.stringify({ artifacts: { location: "home", remote: "none" } }));
  const receipt = await recordStageFeedback(options(undefined, "private-path", {
    workstreamRoot: undefined,
    env: { ...process.env, MYFLOW_HOME: home },
  }));

  assert.equal(receipt.path.startsWith(join(home, "repositories")), true);
  assert.match(receipt.path, /workstreams\/feedback-test\/feedback\/events\.jsonl$/);
  assert.equal(receipt.path.startsWith(repositoryRoot), false);
});

test("retries the same private feedback write idempotently", async () => {
  const root = await stateRoot();
  const first = await recordStageFeedback(options(root, "retry", { recordedAt: "2026-01-01T00:00:00.000Z" }));
  const retry = await recordStageFeedback(options(root, "retry", { recordedAt: "2026-01-01T00:01:00.000Z" }));

  assert.equal(first.recordId, retry.recordId);
  assert.equal(retry.duplicate, true);
  assert.equal((await records(first.path)).length, 1);
});

test("allows pending feedback to resolve once and rejects a second response", async () => {
  const root = await stateRoot();
  await recordStageFeedback(options(root, "deferred", {
    canonicalStage: "Implement",
    source: "implement",
    status: "pending",
    rating: undefined,
    hostCapability: "none",
  }));
  const recorded = await recordStageFeedback(options(root, "deferred", {
    canonicalStage: "Implement",
    source: "verify",
    rating: "rough",
    hostCapability: "structured",
    idempotencyKey: "feedback-deferred-recorded",
  }));
  assert.equal(recorded.status, "recorded");

  await assert.rejects(
    recordStageFeedback(options(root, "deferred", {
      canonicalStage: "Implement",
      source: "verify",
      rating: "smooth",
      idempotencyKey: "feedback-deferred-second",
    })),
    /already has a final feedback response/,
  );
});

test("a private write failure does not prevent the lifecycle transition", async () => {
  const root = await stateRoot();
  const journalPath = join(root, "lifecycle", "events.jsonl");
  const repository = resolveRepositoryContext(repositoryRoot).identity;
  let sequence = 0;
  const append = (kind, values) => appendLifecycleEvent({
    journalPath,
    repositoryRoot,
    repository,
    workstreamId: "feedback-failure",
    kind,
    source: "test",
    idempotencyKey: `event-${sequence += 1}`,
    ...values,
  });
  await append("workstream.created", { canonicalStage: "Scope", owningActivity: "scope" });
  await append("stage.entered", { canonicalStage: "Scope", owningActivity: "scope" });
  const invalidStateRoot = join(root, "not-a-directory");
  await writeFile(invalidStateRoot, "file");

  await assert.rejects(recordStageFeedback(options(invalidStateRoot, "write-failure")));
  await append("stage.completed", {
    canonicalStage: "Scope",
    owningActivity: "scope",
    terminalReason: "advanced",
  });

  const result = await validateLifecycleJournal(journalPath);
  assert.equal(result.valid, true);
  assert.equal(result.state.attempts[0].status, "advanced");
  assert.equal(result.state.feedback.length, 0);
});

test("validates the four-choice contract and keeps private text out of journal fields", async () => {
  const root = await stateRoot();
  await assert.rejects(recordStageFeedback(options(root, "bad", { rating: "fine" })), /rating/);
  await assert.rejects(
    recordStageFeedback(options(root, "skip-note", { status: "skipped", rating: undefined, note: "private" })),
    /note/,
  );

  const receipt = await recordStageFeedback(options(root, "private", {
    rating: "rough",
    note: "A private sentence.",
  }));
  assert.equal(JSON.stringify(receipt.journalFields).includes("rough"), false);
  assert.equal(JSON.stringify(receipt.journalFields).includes("private sentence"), false);
});
