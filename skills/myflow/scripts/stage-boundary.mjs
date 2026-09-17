#!/usr/bin/env node

/**
 * MyFlow stage-boundary command.
 *
 * One command records everything a stage does at its boundary: the lifecycle events,
 * the private stage feedback, and the artifact sync. Stage skills call it and supply
 * facts they already know — the workstream, the stage, the activity, the artifact, the
 * developer's answer. They never invent an idempotency key and never choose an event
 * order, because both are derived here.
 *
 * Usage:
 *   stage-boundary.mjs enter  --stage <S> --activity <a> --workstream <id>
 *                            [--label <activity label>] [--feedback <answer> [--note <sentence>]]
 *   stage-boundary.mjs accept --stage <S> --activity <a> --workstream <id> --artifact <path>
 *   stage-boundary.mjs exit   --stage <S> --activity <a> --workstream <id>
 *                             --feedback <smooth|some-friction|rough|skipped|pending>
 *                            [--note <sentence>] [--terminal-reason <reason>]
 *   stage-boundary.mjs return --stage <S> --activity <a> --workstream <id>
 *                            [--event <opened|rerouted|owner-ready|resumed|closed>] ...
 *
 * Every invocation writes one JSON object to stdout. Rerunning an invocation is safe:
 * the derived keys make each event a duplicate rather than a second record.
 *
 * `lifecycle-journal.mjs` remains the low-level interface for the events this command
 * does not own (blocks, verification results, and hand-made corrections).
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWorkstreamRoot, sync } from "./lib/artifact-store.mjs";
import { detectExecutionRef } from "./lib/host-detection.mjs";
import {
  ACTIVITY_BY_STAGE,
  CANONICAL_STAGES,
  CHANGE_KINDS,
  TERMINAL_REASONS,
  TRIGGER_SOURCES,
  digest,
  lifecycleEventId,
} from "./lib/lifecycle-contract.mjs";
import { reduceLifecycle } from "./lib/lifecycle-reducer.mjs";
import { appendLifecycleEvent, readLifecycleJournal } from "./lib/lifecycle-store.mjs";
import { resolveRepositoryContext } from "./lib/repository-context.mjs";
import { SKILL_BY_STAGE, recordStageFeedback } from "./record-stage-feedback.mjs";

export const STAGE_BOUNDARY_SCHEMA_VERSION = "myflow-stage-boundary/v1";

/** The developer's four answers, plus the two coverage answers a skill may record without asking. */
export const FEEDBACK_ANSWERS = Object.freeze(["smooth", "some-friction", "rough", "skipped", "pending"]);
const RATINGS = Object.freeze(["smooth", "some-friction", "rough"]);
const RETURN_EVENTS = Object.freeze(["opened", "rerouted", "owner-ready", "resumed", "closed"]);
const HOST_CAPABILITIES = Object.freeze(["structured", "plain-text", "none"]);

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const KEY_LIMIT = 128;
const scriptPath = fileURLToPath(import.meta.url);

/**
 * Events that belong to the stage attempt rather than to one activity inside it. Their
 * keys must not vary with the activity, or the same attempt would be opened twice when
 * a second activity enters it — Plan's `design` then `planning`, for instance.
 */
const STAGE_SCOPED_KINDS = new Set(["workstream.created", "stage.entered", "stage.completed", "workstream.closed"]);

/**
 * The skill that records an event. Stage and skill are one-to-one except in Plan,
 * where `design` and `planning` are owned by different skills.
 */
export function sourceSkill(canonicalStage, owningActivity) {
  if (canonicalStage === "Plan" && owningActivity === "design") return "design";
  return SKILL_BY_STAGE[canonicalStage];
}

function sanitize(part) {
  return String(part).replace(/[^A-Za-z0-9._-]+/g, "-");
}

/**
 * Derive the idempotency key for one boundary action.
 *
 * The key is a pure function of the workstream, the canonical stage, the stage attempt,
 * the owning activity, and the action. `detail` distinguishes two actions of the same
 * kind inside one attempt, such as two accepted artifacts; it is hashed so a long path
 * cannot push the key past the length the private store accepts.
 */
export function stageBoundaryKey({ workstreamId, canonicalStage, attemptOrdinal, owningActivity, action, detail }) {
  const parts = [workstreamId, canonicalStage, `a${attemptOrdinal}`, owningActivity, action];
  if (detail !== undefined) parts.push(digest(detail).slice(0, 12));
  const key = parts.map((part) => sanitize(String(part).toLowerCase())).join(".");
  if (key.length <= KEY_LIMIT) return key;
  return `${key.slice(0, KEY_LIMIT - 13)}.${digest(key).slice(0, 12)}`;
}

function usageError(message) {
  const error = new Error(message);
  error.code = "USAGE";
  return error;
}

function assertStageAndActivity(canonicalStage, owningActivity) {
  if (!CANONICAL_STAGES.includes(canonicalStage)) {
    throw usageError(`--stage must be one of ${CANONICAL_STAGES.join(", ")}`);
  }
  if (!ACTIVITY_BY_STAGE[canonicalStage].includes(owningActivity)) {
    throw usageError(`--activity for ${canonicalStage} must be one of ${ACTIVITY_BY_STAGE[canonicalStage].join(", ")}`);
  }
}

async function loadState(journalPath) {
  const { events } = await readLifecycleJournal(journalPath);
  return reduceLifecycle(events);
}

/**
 * The ordinal of the attempt this command acts on: the open attempt for the stage when
 * there is one, otherwise the ordinal the next `stage.entered` will take.
 */
function attemptOrdinalFor(state, canonicalStage) {
  const open = state.attempts.find(
    ({ attemptId, canonicalStage: stage }) => attemptId === state.currentAttemptId && stage === canonicalStage,
  );
  if (open) return open.ordinal;
  return state.attempts.filter(({ canonicalStage: stage }) => stage === canonicalStage).length + 1;
}

/**
 * The attempt a non-entry subcommand acts on: the open one when the stage is still open,
 * otherwise the stage's most recent attempt. Falling back to the completed attempt is what
 * makes a rerun idempotent — the keys derive from the same ordinal, so every event the
 * second run builds is recognised as one already in the journal.
 */
function attemptFor(state, canonicalStage) {
  const open = state.attempts.find(({ attemptId }) => attemptId === state.currentAttemptId);
  if (open) {
    if (open.canonicalStage !== canonicalStage) {
      throw new Error(`the open stage attempt is ${open.canonicalStage}, not ${canonicalStage}`);
    }
    return open;
  }
  const last = state.attempts.filter(({ canonicalStage: stage }) => stage === canonicalStage).at(-1);
  if (!last) throw new Error(`no ${canonicalStage} stage attempt; run enter --stage ${canonicalStage} first`);
  return last;
}

/**
 * Complete the activity that is currently open, if any. Its key is derived from its own
 * activity ID, so the completion is stable however many activities of the same name the
 * attempt has held — Implement runs one `phase` activity per plan phase.
 */
async function completeOpenActivity(context, state) {
  const activity = state.activities.find(({ activityId }) => activityId === state.currentActivityId);
  if (!activity) return false;
  await record(context, {
    kind: "activity.completed",
    canonicalStage: activity.canonicalStage,
    owningActivity: activity.owningActivity,
    action: "activity-completed",
    detail: activity.activityId,
  });
  return true;
}

/** The latest attempt whose feedback is still pending, with no later final answer. */
function pendingFeedbackAttempt(state) {
  const latest = new Map();
  for (const entry of state.feedback) {
    if (entry.status === "requested") continue;
    latest.set(entry.attemptId, entry.status);
  }
  for (const [attemptId, status] of [...latest].reverse()) {
    if (status !== "pending") continue;
    const attempt = state.attempts.find((candidate) => candidate.attemptId === attemptId);
    if (attempt) {
      return {
        attemptId,
        attemptOrdinal: attempt.ordinal,
        canonicalStage: attempt.canonicalStage,
        owningActivity: attempt.openingActivity,
      };
    }
  }
  return undefined;
}

async function boundaryContext(options) {
  const workstreamId = options.workstreamId;
  if (!SAFE_ID.test(workstreamId ?? "")) throw usageError("--workstream must be a filesystem-safe workstream ID");
  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  const environment = options.env ?? process.env;
  const invokedPath = options.invokedPath;
  const resolved = resolveWorkstreamRoot(repositoryRoot, { env: environment, invokedPath });
  const workstreamDirectory = join(resolved.workstreamRoot, workstreamId);
  return {
    workstreamId,
    repositoryRoot,
    environment,
    invokedPath,
    packageRoot: options.packageRoot,
    resolved,
    workstreamDirectory,
    journalPath: join(workstreamDirectory, "lifecycle", "events.jsonl"),
    repository: resolveRepositoryContext(repositoryRoot).identity,
    executionRef: detectExecutionRef(environment),
    receipts: [],
  };
}

function keyFor(context, { kind, canonicalStage, owningActivity, attemptOrdinal, action, detail }) {
  return stageBoundaryKey({
    workstreamId: context.workstreamId,
    canonicalStage,
    attemptOrdinal,
    owningActivity: STAGE_SCOPED_KINDS.has(kind) ? "stage" : owningActivity,
    action,
    detail,
  });
}

/** The activity ID `activity.entered` with this key would create, so a rerun recognises its own activity. */
function prospectiveActivityId(context, { canonicalStage, owningActivity, idempotencyKey }) {
  const eventId = lifecycleEventId({
    repository: context.repository,
    workstreamId: context.workstreamId,
    kind: "activity.entered",
    source: sourceSkill(canonicalStage, owningActivity),
    idempotencyKey,
  });
  return `activity_${eventId.slice(4)}`;
}

/** Append one lifecycle event and record its receipt on the context. */
async function record(context, { kind, canonicalStage, owningActivity, action, detail, ...fields }) {
  const state = await loadState(context.journalPath);
  const attemptOrdinal = fields.attemptOrdinal ?? attemptOrdinalFor(state, canonicalStage);
  delete fields.attemptOrdinal;
  const idempotencyKey = keyFor(context, { kind, canonicalStage, owningActivity, attemptOrdinal, action, detail });
  const result = await appendLifecycleEvent({
    ...fields,
    journalPath: context.journalPath,
    repositoryRoot: context.repositoryRoot,
    artifactRoots: [context.workstreamDirectory],
    repository: context.repository,
    workstreamId: context.workstreamId,
    kind,
    canonicalStage,
    owningActivity,
    source: sourceSkill(canonicalStage, owningActivity),
    idempotencyKey,
    ...(context.executionRef ? { executionRef: context.executionRef } : {}),
  });
  context.receipts.push({
    kind,
    eventId: result.event.eventId,
    idempotencyKey,
    attemptId: result.event.attemptId,
    attemptOrdinal: result.event.attemptOrdinal,
    duplicate: result.duplicate,
  });
  return result.event;
}

/**
 * Sync the workstream to the configured store. Never throws: a boundary is recorded
 * locally whether or not the remote is reachable, and `myflow artifacts status` reports
 * what is still unsynced.
 */
async function syncWorkstream(context) {
  try {
    const result = await sync({
      cwd: context.repositoryRoot,
      env: context.environment,
      invokedPath: context.invokedPath,
      workstream: context.workstreamId,
    });
    return { ok: result.ok, storeMode: result.storeMode, ...(result.skipped ? { skipped: result.skipped } : {}), results: result.results };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Record one attempt's feedback: the request when a question was shown, the private
 * rating and note, and the journal's coverage status. Failure is reported, never thrown:
 * the pulse must not block a stage transition.
 */
async function recordFeedback(context, { attempt, answer, note, hostCapability }) {
  if (!FEEDBACK_ANSWERS.includes(answer)) throw usageError(`--feedback must be one of ${FEEDBACK_ANSWERS.join(", ")}`);
  if (hostCapability !== undefined && !HOST_CAPABILITIES.includes(hostCapability)) {
    throw usageError(`--host-capability must be one of ${HOST_CAPABILITIES.join(", ")}`);
  }
  if (note !== undefined && !["some-friction", "rough"].includes(answer)) {
    throw usageError("--note belongs to some-friction or rough feedback only");
  }
  const shown = answer !== "pending";
  const status = answer === "pending" ? "pending" : answer === "skipped" ? "skipped" : "recorded";
  const rating = RATINGS.includes(answer) ? answer : undefined;
  // A deferred `pending` and the answer that later replaces it are two records of one
  // attempt, so the coverage status is part of the action the keys are derived from.
  const suffix = status === "pending" ? "-pending" : "";
  const keyFields = {
    workstreamId: context.workstreamId,
    canonicalStage: attempt.canonicalStage,
    attemptOrdinal: attempt.attemptOrdinal,
    owningActivity: attempt.owningActivity,
  };

  const state = await loadState(context.journalPath);
  const finalized = state.feedback.some(
    (entry) => entry.attemptId === attempt.attemptId && ["recorded", "skipped"].includes(entry.status),
  );
  if (finalized) return { ok: true, status: "already-final", attemptId: attempt.attemptId };

  try {
    if (shown) {
      await record(context, {
        kind: "feedback.requested",
        canonicalStage: attempt.canonicalStage,
        owningActivity: attempt.owningActivity,
        attemptOrdinal: attempt.attemptOrdinal,
        action: "feedback-requested",
        targetAttemptId: attempt.attemptId,
      });
    }
    const receipt = await recordStageFeedback({
      repositoryRoot: context.repositoryRoot,
      workstreamRoot: context.resolved.workstreamRoot,
      ...(context.packageRoot ? { packageRoot: context.packageRoot } : {}),
      workstreamId: context.workstreamId,
      attemptId: attempt.attemptId,
      attemptOrdinal: attempt.attemptOrdinal,
      canonicalStage: attempt.canonicalStage,
      status,
      ...(rating ? { rating } : {}),
      ...(note ? { note } : {}),
      hostCapability: hostCapability ?? (shown ? "plain-text" : "none"),
      source: sourceSkill(attempt.canonicalStage, attempt.owningActivity),
      idempotencyKey: stageBoundaryKey({ ...keyFields, action: `feedback${suffix}` }),
    });
    await record(context, {
      kind: "feedback.recorded",
      canonicalStage: attempt.canonicalStage,
      owningActivity: attempt.owningActivity,
      attemptOrdinal: attempt.attemptOrdinal,
      action: `feedback-recorded${suffix}`,
      targetAttemptId: attempt.attemptId,
      feedbackStatus: receipt.status,
      privateRef: receipt.privateRef,
    });
    return { ok: true, status: receipt.status, attemptId: attempt.attemptId, privateRef: receipt.privateRef };
  } catch (error) {
    return { ok: false, status: "failed", attemptId: attempt.attemptId, error: error.message };
  }
}

async function enter(context, options) {
  const { canonicalStage, owningActivity } = options;
  assertStageAndActivity(canonicalStage, owningActivity);
  let state = await loadState(context.journalPath);

  if (!state.created) {
    if (canonicalStage !== "Scope" || owningActivity !== "scope") {
      throw new Error("the first stage entry of a workstream must be Scope with the scope activity");
    }
    await record(context, {
      kind: "workstream.created",
      canonicalStage: "Scope",
      owningActivity: "scope",
      attemptOrdinal: 1,
      action: "workstream-created",
    });
  }

  await record(context, { kind: "stage.entered", canonicalStage, owningActivity, action: "stage-entered" });

  state = await loadState(context.journalPath);
  const deferred = pendingFeedbackAttempt(state);
  const askable =
    deferred && deferred.canonicalStage === "Implement" && canonicalStage === "Verify" ? deferred : undefined;
  let feedback;
  if (options.feedback !== undefined) {
    if (!askable) throw usageError("--feedback on enter answers a deferred request; none is pending here");
    feedback = await recordFeedback(context, {
      attempt: askable,
      answer: options.feedback,
      note: options.note,
      hostCapability: options.hostCapability,
    });
  }

  state = await loadState(context.journalPath);
  const attemptOrdinal = attemptOrdinalFor(state, canonicalStage);
  const activityKey = keyFor(context, {
    kind: "activity.entered",
    canonicalStage,
    owningActivity,
    attemptOrdinal,
    action: "activity-entered",
    detail: options.label,
  });
  if (
    state.currentActivityId &&
    state.currentActivityId !== prospectiveActivityId(context, { canonicalStage, owningActivity, idempotencyKey: activityKey })
  ) {
    await completeOpenActivity(context, state);
  }
  await record(context, {
    kind: "activity.entered",
    canonicalStage,
    owningActivity,
    action: "activity-entered",
    detail: options.label,
    attemptOrdinal,
  });

  return {
    ...(askable && !feedback ? { pendingFeedback: askable } : {}),
    ...(feedback ? { feedback } : {}),
    sync: await syncWorkstream(context),
  };
}

async function accept(context, options) {
  const { canonicalStage, owningActivity } = options;
  assertStageAndActivity(canonicalStage, owningActivity);
  if (!options.artifactPath) throw usageError("accept requires --artifact <path>");
  const state = await loadState(context.journalPath);
  const attempt = attemptFor(state, canonicalStage);
  await record(context, {
    kind: "artifact.accepted",
    canonicalStage,
    owningActivity,
    action: "artifact-accepted",
    detail: options.artifactPath,
    attemptOrdinal: attempt.ordinal,
    artifactPath: options.artifactPath,
  });
  return {};
}

async function exit(context, options) {
  const { canonicalStage, owningActivity } = options;
  assertStageAndActivity(canonicalStage, owningActivity);
  if (options.feedback === undefined) throw usageError(`exit requires --feedback <${FEEDBACK_ANSWERS.join("|")}>`);
  const terminalReason = options.terminalReason ?? "advanced";
  if (!TERMINAL_REASONS.includes(terminalReason)) {
    throw usageError(`--terminal-reason must be one of ${TERMINAL_REASONS.join(", ")}`);
  }
  const state = await loadState(context.journalPath);
  const attempt = attemptFor(state, canonicalStage);

  const feedback = await recordFeedback(context, {
    attempt: {
      attemptId: attempt.attemptId,
      attemptOrdinal: attempt.ordinal,
      canonicalStage,
      owningActivity,
    },
    answer: options.feedback,
    note: options.note,
    hostCapability: options.hostCapability,
  });

  await completeOpenActivity(context, await loadState(context.journalPath));
  await record(context, {
    kind: "stage.completed",
    canonicalStage,
    owningActivity,
    action: "stage-completed",
    attemptOrdinal: attempt.ordinal,
    terminalReason,
  });
  if (terminalReason === "workstream-closed") {
    await record(context, {
      kind: "workstream.closed",
      canonicalStage,
      owningActivity,
      action: "workstream-closed",
      attemptOrdinal: attempt.ordinal,
    });
  }
  return { feedback, sync: await syncWorkstream(context) };
}

function activeEpisodeId(state) {
  const episode = state.returns.find(({ status }) => status !== "closed");
  if (!episode) throw new Error("no open correction episode; pass --episode-id");
  return episode.episodeId;
}

async function returnEvent(context, options) {
  const { canonicalStage, owningActivity } = options;
  assertStageAndActivity(canonicalStage, owningActivity);
  const event = options.returnEvent ?? "opened";
  if (!RETURN_EVENTS.includes(event)) throw usageError(`--event must be one of ${RETURN_EVENTS.join(", ")}`);
  const state = await loadState(context.journalPath);
  const attemptOrdinal = attemptOrdinalFor(state, canonicalStage);

  if (event === "opened") {
    const detectingStage = options.detectingStage ?? canonicalStage;
    const detectingActivity = options.detectingActivity ?? owningActivity;
    const { owningStage: initialOwningStage, routeActivity: initialOwningActivity } = options;
    if (!initialOwningStage || !initialOwningActivity) {
      throw usageError("return --event opened requires --owning-stage and --owning-activity");
    }
    assertStageAndActivity(detectingStage, detectingActivity);
    assertStageAndActivity(initialOwningStage, initialOwningActivity);
    if (!TRIGGER_SOURCES.includes(options.triggerSource)) {
      throw usageError(`--trigger-source must be one of ${TRIGGER_SOURCES.join(", ")}`);
    }
    if (!CHANGE_KINDS.includes(options.changeKind)) {
      throw usageError(`--change-kind must be one of ${CHANGE_KINDS.join(", ")}`);
    }
    const attempt = attemptFor(state, canonicalStage);
    const detail = `${initialOwningStage}/${initialOwningActivity}/${options.changeKind}`;
    const episodeId = `episode_${digest(
      stageBoundaryKey({
        workstreamId: context.workstreamId,
        canonicalStage,
        attemptOrdinal,
        owningActivity,
        action: "return-opened",
        detail,
      }),
    ).slice(0, 24)}`;
    await record(context, {
      kind: "return.opened",
      canonicalStage,
      owningActivity,
      action: "return-opened",
      detail,
      episodeId,
      detectingStage,
      detectingActivity,
      initialOwningStage,
      initialOwningActivity,
      originAttemptId: attempt.attemptId,
      triggerSource: options.triggerSource,
      changeKind: options.changeKind,
      evidenceRefs: options.evidenceRefs ?? [],
    });
    return { episodeId };
  }

  const episodeId = options.episodeId ?? activeEpisodeId(state);
  if (event === "rerouted") {
    if (!options.owningStage || !options.routeActivity) {
      throw usageError("return --event rerouted requires --owning-stage and --owning-activity");
    }
    assertStageAndActivity(options.owningStage, options.routeActivity);
    if (!CHANGE_KINDS.includes(options.changeKind)) {
      throw usageError(`--change-kind must be one of ${CHANGE_KINDS.join(", ")}`);
    }
    await record(context, {
      kind: "return.rerouted",
      canonicalStage,
      owningActivity,
      action: "return-rerouted",
      detail: `${episodeId}/${options.owningStage}/${options.routeActivity}`,
      episodeId,
      owningStage: options.owningStage,
      routeActivity: options.routeActivity,
      changeKind: options.changeKind,
      evidenceRefs: options.evidenceRefs ?? [],
    });
    return { episodeId };
  }

  await record(context, {
    kind: `return.${event}`,
    canonicalStage,
    owningActivity,
    action: `return-${event}`,
    detail: episodeId,
    episodeId,
  });
  return { episodeId };
}

const COMMANDS = { enter, accept, exit, return: returnEvent };

/**
 * Run one stage-boundary command.
 *
 * @returns {Promise<object>} the JSON receipt: the derived keys, every event appended,
 *   whether each was a duplicate, the feedback result, and the sync result
 */
export async function runStageBoundary(options) {
  const run = COMMANDS[options.command];
  if (!run) throw usageError(`unknown command: ${options.command}`);
  const context = await boundaryContext(options);
  const outcome = await run(context, options);
  return {
    schemaVersion: STAGE_BOUNDARY_SCHEMA_VERSION,
    command: options.command,
    workstreamId: context.workstreamId,
    canonicalStage: options.canonicalStage,
    owningActivity: options.owningActivity,
    journalPath: context.journalPath,
    workstreamRoot: context.resolved.workstreamRoot,
    storeMode: context.resolved.storeMode,
    ...(context.executionRef ? { executionRef: context.executionRef } : {}),
    events: context.receipts,
    ...outcome,
  };
}

const VALUE_FLAGS = new Map([
  ["--repository-root", "repositoryRoot"],
  ["--workstream", "workstreamId"],
  ["--stage", "canonicalStage"],
  ["--activity", "owningActivity"],
  ["--artifact", "artifactPath"],
  ["--label", "label"],
  ["--feedback", "feedback"],
  ["--note", "note"],
  ["--host-capability", "hostCapability"],
  ["--terminal-reason", "terminalReason"],
  ["--event", "returnEvent"],
  ["--episode-id", "episodeId"],
  ["--detecting-stage", "detectingStage"],
  ["--detecting-activity", "detectingActivity"],
  ["--owning-stage", "owningStage"],
  ["--owning-activity", "routeActivity"],
  ["--trigger-source", "triggerSource"],
  ["--change-kind", "changeKind"],
]);

const usage = `usage: stage-boundary.mjs <enter|accept|exit|return> --workstream <id> --stage <stage> --activity <activity> [options]
  enter  [--label <activity label>] [--feedback <answer> [--note <sentence>]]
  accept --artifact <repository-relative path>
  exit   --feedback <${FEEDBACK_ANSWERS.join("|")}> [--note <sentence>] [--terminal-reason <${TERMINAL_REASONS.join("|")}>]
  return [--event <${RETURN_EVENTS.join("|")}>] [--owning-stage <stage> --owning-activity <activity>]
         [--trigger-source <source>] [--change-kind <kind>] [--evidence-ref <ref>]... [--episode-id <id>]`;

export function parseArguments(arguments_) {
  const [command, ...rest] = arguments_;
  if (!COMMANDS[command]) throw usageError(usage);
  const options = { command, evidenceRefs: [] };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (value === undefined) throw usageError(usage);
    if (flag === "--evidence-ref") {
      options.evidenceRefs.push(value);
      continue;
    }
    const name = VALUE_FLAGS.get(flag);
    if (!name) throw usageError(`unknown option: ${flag}`);
    options[name] = value;
  }
  return options;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const receipt = await runStageBoundary({ ...options, invokedPath: process.argv[1] });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.code === "USAGE" ? 2 : 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();
