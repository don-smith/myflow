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
 * Usage: every subcommand takes the same four flags, and each line below adds its own.
 *   stage-boundary.mjs <enter|accept|exit|return|correct|slice>
 *                      --stage <S> --activity <a> --workstream <id> --repository-root <git-root>
 *
 *   enter  [--label <activity label>] [--feedback <answer> [--note <sentence>]]
 *   accept --artifact <path>
 *   exit   --feedback <smooth|some-friction|rough|skipped|pending>
 *         [--note <sentence>] [--terminal-reason <reason>]
 *   return [--event <opened|rerouted|owner-ready|resumed|closed>] ...
 *   correct --action <observe|route|revise|ready|assess|resume|supersede|validate|pass|close|resolve> ...
 *   slice --slice <name> --artifact <evidence> --planning-basis <accepted event ID>
 *         --scope-basis <accepted event ID> --design-basis <accepted event ID>
 *
 * Every invocation writes one JSON object to stdout. Rerunning an invocation is safe:
 * the derived keys make each event a duplicate rather than a second record.
 *
 * `lifecycle-journal.mjs` remains the low-level interface for the events this command
 * does not own (blocks, verification results, and hand-made corrections).
 */

import { readFile } from "node:fs/promises";
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
import { assertRoute, reduceLifecycle } from "./lib/lifecycle-reducer.mjs";
import { appendLifecycleEvent, artifactReference, readLifecycleJournal } from "./lib/lifecycle-store.mjs";
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
  throw new Error(`no open ${canonicalStage} attempt; the ended attempt cannot accept new work (retry an existing receipt or use correct)`);
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
  if (finalized) {
    const saved = (await readFile(join(context.workstreamDirectory, "feedback", "events.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line))
      .find(({ attemptId, status: savedStatus }) => attemptId === attempt.attemptId && savedStatus !== "pending");
    if (answer !== "pending" && (saved?.status !== status || saved?.rating !== rating ||
        saved?.note !== note?.trim())) throw new Error("conflicting feedback retry for terminal attempt");
    return { ok: true, status: "already-final", attemptId: attempt.attemptId };
  }

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

  // `stage.entered` is stage-scoped: its key ignores the activity, so entering the same open
  // attempt with a second activity must rebuild the event the journal already holds, byte for
  // byte. The attempt's `openingActivity` is the activity that opened it; using the passed one
  // would build the same key with different content and trip the historical-rewrite guard —
  // which is what made the documented mid-stage activity switch impossible.
  if (!state.currentAttemptId && state.attempts.at(-1)?.canonicalStage === canonicalStage &&
      state.attempts.at(-1)?.status !== "abandoned" && !state.revision && !state.pendingSlice &&
      !state.activeRouteEpisodeId) {
    throw new Error(`${canonicalStage} attempt has ended; use correct or slice for a new attempt`);
  }
  const openAttempt = state.attempts.find(
    ({ attemptId, canonicalStage: stage }) => attemptId === state.currentAttemptId && stage === canonicalStage,
  );
  const stageKey = keyFor(context, { kind: "stage.entered", canonicalStage,
    owningActivity: openAttempt?.openingActivity ?? owningActivity,
    attemptOrdinal: openAttempt?.ordinal ?? attemptOrdinalFor(state, canonicalStage), action: "stage-entered" });
  const recordedEntry = openAttempt && (await readLifecycleJournal(context.journalPath)).events.find(
    ({ eventId }) => eventId === openAttempt.enteredEventId);
  // A semantic correction already entered this attempt with its own stable key.
  if (!recordedEntry || recordedEntry.idempotencyKey === stageKey) {
    await record(context, { kind: "stage.entered", canonicalStage,
      owningActivity: openAttempt ? openAttempt.openingActivity : owningActivity, action: "stage-entered" });
  }

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
  const sameStageRoute = state.returns.find(({ episodeId }) => episodeId === state.activeRouteEpisodeId);
  if (sameStageRoute?.ownerReadyAt && sameStageRoute.owner.stage === sameStageRoute.detectingStage &&
      !sameStageRoute.suspendedAt && state.currentAttemptId === sameStageRoute.originAttemptId &&
      owningActivity === sameStageRoute.detectingActivity && sameStageRoute.assessment?.disposition !== "resume") {
    throw new Error("same-stage return requires a digested resume assessment before detecting activity entry");
  }
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
  const attempt = state.currentAttemptId ? attemptFor(state, canonicalStage) :
    state.attempts.filter(({ canonicalStage: stage }) => stage === canonicalStage).at(-1);
  if (!attempt) throw new Error(`no ${canonicalStage} attempt`);
  if (!state.currentAttemptId) {
    const previous = state.acceptedArtifacts.find(({ attemptId, owningActivity: activity, artifactRef }) =>
      attemptId === attempt.attemptId && activity === owningActivity && artifactRef.path === options.artifactPath);
    if (!previous || state.lastTerminalAttemptId !== attempt.attemptId) {
      throw new Error(`${canonicalStage} attempt has ended; cannot accept new work`);
    }
  }
  await record(context, {
    kind: "artifact.accepted",
    canonicalStage,
    owningActivity,
    action: "artifact-accepted",
    detail: options.artifactPath,
    attemptOrdinal: attempt.ordinal,
    artifactPath: options.artifactPath,
  });
  return { sync: await syncWorkstream(context) };
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
  if (canonicalStage === "Close" && terminalReason === "workstream-closed" && state.currentAttemptId &&
      state.unresolvedObservations.some(({ observationId }) =>
        !state.approvedAuditGaps.some((gap) => gap.observationId === observationId))) {
    throw new Error("Close requires an approved named gap for every unresolved observation");
  }
  const attempt = state.currentAttemptId ? attemptFor(state, canonicalStage) :
    state.attempts.filter(({ canonicalStage: stage }) => stage === canonicalStage).at(-1);
  if (!attempt || (!state.currentAttemptId && state.lastTerminalAttemptId !== attempt.attemptId)) {
    throw new Error(`${canonicalStage} attempt has ended; no terminal retry is available`);
  }
  if (!state.currentAttemptId) {
    if (attempt.terminalReason !== terminalReason) throw new Error("conflicting terminal retry: reason changed");
    const previous = state.feedback.find(({ attemptId, status }) => attemptId === attempt.attemptId && status !== "requested");
    const requestedStatus = options.feedback === "pending" ? "pending" : options.feedback === "skipped" ? "skipped" : "recorded";
    if (previous?.status !== requestedStatus) throw new Error("conflicting terminal retry: feedback changed");
    const privateRecords = JSON.parse(`[${(await readFile(join(context.workstreamDirectory, "feedback", "events.jsonl"), "utf8")).trim().split("\n").join(",")}]`);
    const saved = privateRecords.find(({ attemptId, status }) => attemptId === attempt.attemptId && status === requestedStatus);
    if (!saved || saved.rating !== (RATINGS.includes(options.feedback) ? options.feedback : undefined) ||
        saved.note !== options.note?.trim()) throw new Error("conflicting terminal retry: feedback changed");
  }

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

// Every semantic action derives identity from a source attempt and evidence, never from
// a caller-supplied ordinal or journal key. An observation survives even when a route
// cannot yet be represented as a canonical transition.
function sourceFor(state, options) {
  const id = options.sourceAttemptId ?? state.currentAttemptId ?? state.lastTerminalAttemptId;
  const source = state.attempts.find(({ attemptId }) => attemptId === id);
  if (!source) throw new Error("no current or last completed source attempt");
  if (id !== state.currentAttemptId && id !== state.lastTerminalAttemptId &&
      !(source.status === "suspended" && state.returns.some(({ originAttemptId, status }) =>
        originAttemptId === id && status !== "closed"))) {
    throw new Error("source must be the current, suspended detecting, or last completed attempt");
  }
  return source;
}

function intentKey(context, source, action, artifact, selector) {
  return stageBoundaryKey({ workstreamId: context.workstreamId, canonicalStage: source.canonicalStage,
    attemptOrdinal: source.ordinal, owningActivity: source.openingActivity, action,
    detail: selector === undefined ? artifact : `${artifact}\n${selector}` });
}

function actionKey(context, action, identity) {
  return stageBoundaryKey({ workstreamId: context.workstreamId, canonicalStage: "Scope",
    attemptOrdinal: 1, owningActivity: "scope", action, detail: identity });
}

async function semanticRecord(context, fields, action, identity) {
  const { canonicalStage, owningActivity, ...rest } = fields;
  const idempotencyKey = actionKey(context, action, identity);
  const result = await appendLifecycleEvent({ ...rest, canonicalStage, owningActivity,
    journalPath: context.journalPath, repositoryRoot: context.repositoryRoot,
    artifactRoots: [context.workstreamDirectory], repository: context.repository,
    workstreamId: context.workstreamId, source: sourceSkill(canonicalStage, owningActivity), idempotencyKey,
    ...(context.executionRef ? { executionRef: context.executionRef } : {}) });
  context.receipts.push({ kind: fields.kind, eventId: result.event.eventId, idempotencyKey,
    attemptId: result.event.attemptId, attemptOrdinal: result.event.attemptOrdinal, duplicate: result.duplicate });
  return result.event;
}

async function intentObservation(context, options, intendedAction, intendedStage, intendedActivity) {
  const state = await loadState(context.journalPath);
  const { events } = await readLifecycleJournal(context.journalPath);
  if (options.observationId) {
    const previous = events.find(({ kind, observationId }) => kind === "action.observed" && observationId === options.observationId);
    if (!previous || (previous.intendedAction !== intendedAction &&
        !(previous.intendedAction === "observe" && intendedAction === "route")) ||
        previous.sourceAttemptId !== (options.sourceAttemptId ?? previous.sourceAttemptId) ||
        (options.artifactPath && previous.artifactRef.path !== options.artifactPath) ||
        (options.finding && previous.actualFinding !== options.finding) ||
        (options.findingSelector !== undefined && previous.findingSelector !== options.findingSelector)) {
      throw new Error("unknown or conflicting observation ID");
    }
    const currentEvidence = await artifactReference(context.repositoryRoot, previous.artifactRef.path,
      [context.workstreamDirectory]);
    if (currentEvidence.digest !== previous.artifactRef.digest) {
      throw new Error("conflicting observation ID: evidence digest changed");
    }
    return previous;
  }
  if (!options.artifactPath) throw usageError(`${intendedAction} requires --artifact <evidence path>`);
  if (!options.finding || !options.owner) throw usageError(`${intendedAction} requires --finding and --owner`);
  const activeSource = options.sourceAttemptId ?? state.currentAttemptId ?? state.lastTerminalAttemptId;
  const matches = ({ kind, artifactRef, intendedAction: intended, canonicalStage, findingSelector }) =>
    kind === "action.observed" && artifactRef.path === options.artifactPath && intended === intendedAction &&
    findingSelector === options.findingSelector &&
    canonicalStage === (intendedAction === "start-slice" ? "Verify" : options.canonicalStage);
  const previous = events.findLast((event) => matches(event) && event.sourceAttemptId === activeSource) ??
    (state.currentStage !== (intendedAction === "start-slice" ? "Verify" : options.canonicalStage) ? events.findLast(matches) : undefined);
  const source = previous ? state.attempts.find(({ attemptId }) => attemptId === previous.sourceAttemptId) : sourceFor(state, options);
  if (!source || (options.sourceAttemptId && options.sourceAttemptId !== source.attemptId)) throw new Error("conflicting source attempt");
  const key = intentKey(context, source, intendedAction, options.artifactPath, options.findingSelector);
  // The key is based on the source and evidence path, so changing a finding, owner,
  // or evidence bytes on retry is a historical-intent conflict in the locked store.
  if (source.canonicalStage !== options.canonicalStage && intendedAction !== "start-slice") {
    throw usageError("source stage must match --stage");
  }
  return semanticRecord(context, { kind: "action.observed", canonicalStage: source.canonicalStage,
    owningActivity: intendedAction === "start-slice" ? source.openingActivity : options.owningActivity,
    sourceAttemptId: source.attemptId,
    ...(options.findingSelector !== undefined ? { findingSelector: options.findingSelector } : {}),
    actualFinding: options.finding, intendedAction, intendedStage, intendedActivity,
    intendedOwner: options.owner, unresolvedReason: "awaiting canonical route", artifactPath: options.artifactPath,
  }, "intent", key);
}

function semanticReceipt(context, state, observation, disposition, cause, nextAction) {
  const attempt = state.attempts.find(({ attemptId }) => attemptId === state.currentAttemptId);
  const source = state.attempts.find(({ attemptId }) => attemptId === observation?.sourceAttemptId);
  return { disposition, ...(observation ? { observationId: observation.observationId } : {}),
    ...(cause ? { cause } : {}), nextAction: nextAction ?? state.nextLegalActions,
    sourceAttempt: source ? { attemptId: source.attemptId, canonicalStage: source.canonicalStage, ordinal: source.ordinal } : null,
    currentAttempt: attempt ? { attemptId: attempt.attemptId, canonicalStage: attempt.canonicalStage, ordinal: attempt.ordinal } : null,
    pendingObligations: state.pendingVerificationEpisodeIds,
    unresolvedIds: state.unresolvedObservations.map(({ observationId }) => observationId),
  };
}

async function finishSemantic(context, observation, disposition, cause, nextAction) {
  const state = await loadState(context.journalPath);
  return { ...semanticReceipt(context, state, observation, disposition, cause, nextAction),
    sync: await syncWorkstream(context) };
}

async function enterSemanticAttempt(context, stage, activity, identity) {
  const state = await loadState(context.journalPath);
  if (!state.currentAttemptId) {
    await semanticRecord(context, { kind: "stage.entered", canonicalStage: stage, owningActivity: activity },
      "stage-entry", identity);
  }
  const current = await loadState(context.journalPath);
  if (current.currentStage !== stage) throw new Error(`cannot enter ${stage}: another attempt is active`);
  if (!current.currentActivityId) {
    await semanticRecord(context, { kind: "activity.entered", canonicalStage: stage, owningActivity: activity },
      "activity-entry", identity);
  }
}

async function correct(context, options) {
  const action = options.action;
  if (!["observe", "route", "revise", "ready", "assess", "resume", "supersede", "validate", "pass", "close", "resolve"].includes(action)) {
    throw usageError("correct requires --action observe|route|revise|ready|assess|resume|supersede|validate|pass|close|resolve");
  }
  const { canonicalStage, owningActivity } = options;
  assertStageAndActivity(canonicalStage, owningActivity);
  if (["observe", "route", "revise"].includes(action)) {
    const stage = options.owningStage ?? canonicalStage;
    const activity = options.routeActivity ?? owningActivity;
    assertStageAndActivity(stage, activity);
    if (action === "route" && (!TRIGGER_SOURCES.includes(options.triggerSource) || !CHANGE_KINDS.includes(options.changeKind))) {
      throw usageError("route requires --trigger-source and --change-kind");
    }
    if (action === "route") assertRoute(options.changeKind, stage, activity);
    const observation = await intentObservation(context, options, action, stage, activity);
    if (action === "observe") return finishSemantic(context, observation, "provisional", "record-only observation", "route with --observation-id after owner is known");
    const identity = observation.observationId;
    const episodeId = `episode_${digest(identity).slice(0, 24)}`;
    try {
      let state = await loadState(context.journalPath);
      const source = state.attempts.find(({ attemptId }) => attemptId === observation.sourceAttemptId);
      if (action === "revise") {
        if (!state.revision && !state.attempts.some(({ revisionSourceAttemptId }) => revisionSourceAttemptId === source.attemptId)) {
          await semanticRecord(context, { kind: "revision.opened", canonicalStage: source.canonicalStage,
            owningActivity: source.openingActivity, revisionSourceAttemptId: source.attemptId,
            reason: observation.actualFinding, artifactPath: observation.artifactRef.path }, "revision", identity);
        }
        await enterSemanticAttempt(context, source.canonicalStage, source.openingActivity, identity);
        return { episodeId: null, ...await finishSemantic(context, observation, "canonical", undefined, "accept revised stage evidence") };
      }
      let episode = state.returns.find(({ episodeId: id }) => id === episodeId);
      if (!episode) {
        const parentEpisodeId = state.activeRouteEpisodeId && state.currentAttemptId &&
          state.currentAttemptId !== state.returns.find(({ episodeId: id }) => id === state.activeRouteEpisodeId)?.originAttemptId
          ? state.activeRouteEpisodeId : null;
        await semanticRecord(context, { kind: "correction.opened", canonicalStage: source.canonicalStage,
          owningActivity: observation.owningActivity, episodeId, observationId: identity, parentEpisodeId,
          detectingStage: source.canonicalStage, detectingActivity: observation.owningActivity,
          initialOwningStage: stage, initialOwningActivity: activity, originAttemptId: source.attemptId,
          triggerSource: options.triggerSource, changeKind: options.changeKind,
          evidenceRefs: [observation.artifactRef.path] }, "correction", identity);
      } else {
        if (episode.owner.stage !== stage || episode.owner.activity !== activity ||
            episode.changeKind !== options.changeKind || episode.triggerSource !== options.triggerSource) {
          // A provisional intent can be routed to a newly determined owner; an already
          // recorded route cannot silently change its causal history.
          throw new Error("conflicting correction route for observation");
        }
        const routeIndex = state.eventLinks.findIndex(({ eventId }) => eventId === episode.routes[0].eventId);
        if ((episode.owner.stage === source.canonicalStage && state.activities.some(({ attemptId, owningActivity, enteredAt }) =>
          attemptId === source.attemptId && owningActivity === activity && enteredAt >= episode.openedAt)) ||
          state.attempts.some(({ canonicalStage: enteredStage, enteredEventId }) =>
            enteredStage === stage && state.eventLinks.findIndex(({ eventId }) => eventId === enteredEventId) > routeIndex)) {
          return { episodeId, ...await finishSemantic(context, observation, "canonical", undefined, "record owner readiness after corrective work") };
        }
      }
      state = await loadState(context.journalPath);
      episode = state.returns.find(({ episodeId: id }) => id === episodeId);
      if (!episode.postTerminal && !episode.suspendedAt) {
        if (state.currentActivityId) await completeOpenActivity(context, state);
        if (stage !== source.canonicalStage) {
          await semanticRecord(context, { kind: "attempt.suspended", canonicalStage: source.canonicalStage,
            owningActivity: episode.detectingActivity, episodeId }, "suspend", identity);
        }
      }
      await enterSemanticAttempt(context, stage, activity, identity);
      return { episodeId, ...await finishSemantic(context, observation, "canonical", undefined, "record owner readiness after corrective work") };
    } catch (error) {
      // Only known, authorized state conflicts defer a valid route. Validation,
      // identity, and evidence failures must never be presented as authorization.
      const deferredSource = error.message === "correction.opened stage does not match the open attempt" &&
        (await loadState(context.journalPath)).attempts.some(({ attemptId, status }) =>
          attemptId === observation.sourceAttemptId && status === "suspended");
      if (action !== "route" || (!deferredSource &&
          !/only the top correction route may open a child|distinct correction cannot bypass an active parent route|correction source must be the current or last superseded terminal attempt|stage entry must follow the active correction route/.test(error.message))) throw error;
      return { episodeId, ...await finishSemantic(context, observation, "provisional", error.message,
        `continue authorized work in artifacts; retry correct --action ${action} --observation-id ${identity} when routing is possible`) };
    }
  }
  const state = await loadState(context.journalPath);
  const episode = state.returns.find(({ episodeId }) => episodeId === options.episodeId);
  if (action !== "resolve" && !episode) throw new Error("correct action requires --episode-id from the route receipt");
  const identity = options.episodeId;
  const source = episode && state.attempts.find(({ attemptId }) => attemptId === episode.originAttemptId);
  const observation = state.observations.find(({ observationId }) =>
    observationId === (options.observationId ?? state.observations.find(({ observationId: id }) => `episode_${digest(id).slice(0, 24)}` === identity)?.observationId));
  if (action === "resolve") {
    if (!options.observationId || !options.linkedEventIds?.length || !options.linkedAttemptIds?.length || !options.linkedArtifactEventIds?.length) {
      throw usageError("resolve requires --observation-id and linked events, attempts and accepted artifact events");
    }
    await semanticRecord(context, { kind: "action.resolved", canonicalStage, owningActivity,
      observationId: options.observationId, linkedEventIds: options.linkedEventIds,
      linkedAttemptIds: options.linkedAttemptIds, linkedArtifactEventIds: options.linkedArtifactEventIds }, "resolve", options.observationId);
  } else if (action === "ready") {
    await semanticRecord(context, { kind: "return.owner-ready", canonicalStage, owningActivity, episodeId: identity }, "owner-ready", identity);
  } else if (action === "assess") {
    if (!options.artifactPath || !options.rerunChecks?.length) throw usageError("assess requires --artifact and --rerun-check");
    await semanticRecord(context, { kind: "attempt.assessed", canonicalStage: source.canonicalStage,
      owningActivity: episode.detectingActivity, episodeId: identity, disposition: options.disposition,
      reusableEvidence: options.reusableEvidence ?? [], invalidatedEvidence: options.invalidatedEvidence ?? [],
      rerunChecks: options.rerunChecks, artifactPath: options.artifactPath }, "assess", identity);
  } else if (["resume", "supersede"].includes(action)) {
    const sameStage = episode.owner.stage === episode.detectingStage && !episode.suspendedAt;
    if (sameStage && action === "supersede") throw new Error("same-stage correction requires a suspended attempt to supersede");
    if (action === "supersede" && options.feedback !== undefined && !FEEDBACK_ANSWERS.includes(options.feedback)) {
      throw usageError(`--feedback must be one of ${FEEDBACK_ANSWERS.join(", ")}`);
    }
    if (!sameStage) await semanticRecord(context, { kind: `attempt.${action === "resume" ? "resumed" : "superseded"}`,
      canonicalStage: source.canonicalStage, owningActivity: episode.detectingActivity,
      episodeId: identity }, "disposition", identity);
    const feedback = action === "supersede" ? await recordFeedback(context, {
      attempt: { attemptId: source.attemptId, attemptOrdinal: source.ordinal,
        canonicalStage: source.canonicalStage, owningActivity: episode.detectingActivity },
      answer: options.feedback ?? "pending", note: options.note, hostCapability: options.hostCapability,
    }) : undefined;
    if (sameStage) {
      if (episode.assessment?.disposition !== "resume") throw new Error("same-stage return requires a digested resume assessment");
      const current = await loadState(context.journalPath);
      const key = actionKey(context, "return-activity", identity);
      const returnActivityId = prospectiveActivityId(context, { canonicalStage: source.canonicalStage,
        owningActivity: episode.detectingActivity, idempotencyKey: key });
      if (current.currentActivityId && current.currentActivityId !== returnActivityId) {
        await completeOpenActivity(context, current);
      }
      await semanticRecord(context, { kind: "activity.entered", canonicalStage: source.canonicalStage,
        owningActivity: episode.detectingActivity }, "return-activity", identity);
    } else {
      await enterSemanticAttempt(context, source.canonicalStage, episode.detectingActivity, identity);
    }
    await semanticRecord(context, { kind: "return.resumed", canonicalStage: source.canonicalStage,
      owningActivity: episode.detectingActivity, episodeId: identity }, "return-resumed", identity);
    return { episodeId: identity, ...(feedback ? { feedback } : {}),
      ...await finishSemantic(context, observation, "canonical") };
  } else if (action === "validate") {
    if (!options.artifactPath) throw usageError("validate requires --artifact");
    await semanticRecord(context, { kind: "correction.validated", canonicalStage, owningActivity,
      episodeId: identity, artifactPath: options.artifactPath }, "local-validation", identity);
  } else if (action === "pass") {
    await semanticRecord(context, { kind: "verification.completed", canonicalStage, owningActivity,
      episodeId: identity, verificationStatus: "passed" }, "verification-pass", identity);
  } else if (action === "close") {
    await semanticRecord(context, { kind: "return.closed", canonicalStage, owningActivity,
      episodeId: identity }, "episode-closure", identity);
  }
  return { episodeId: identity, ...await finishSemantic(context, observation, "canonical") };
}

async function approveAuditGap(context, options) {
  if (options.canonicalStage !== "Close" || options.owningActivity !== "closeout") {
    throw usageError("audit-gap approval belongs to Close/closeout");
  }
  for (const field of ["observationId", "gapName", "approvedBy", "followUpDestination", "closeArtifactEventId"]) {
    if (!options[field]) throw usageError(`audit-gap approval requires ${field}`);
  }
  await semanticRecord(context, { kind: "close.audit-gap-approved", canonicalStage: "Close", owningActivity: "closeout",
    observationId: options.observationId, gapName: options.gapName, approvedBy: options.approvedBy,
    followUpDestination: options.followUpDestination, closeArtifactEventId: options.closeArtifactEventId,
  }, "audit-gap-approved", options.observationId);
  return { unresolvedIds: (await loadState(context.journalPath)).unresolvedObservations.map(({ observationId }) => observationId),
    sync: await syncWorkstream(context) };
}

async function slice(context, options) {
  if (options.canonicalStage !== "Plan" || options.owningActivity !== "planning") {
    throw usageError("slice starts at Plan/planning");
  }
  if (!options.sliceName || !options.planningBasisEventId || !options.scopeArtifactEventId || !options.designArtifactEventId) {
    throw usageError("slice requires --slice, --planning-basis, --scope-basis and --design-basis");
  }
  const observation = await intentObservation(context, { ...options, finding: options.finding ?? `Start ${options.sliceName}`,
    owner: options.owner ?? "planning owner" }, "start-slice", "Plan", "planning");
  const identity = observation.observationId;
  try {
    const state = await loadState(context.journalPath);
    await semanticRecord(context, { kind: "slice.started", canonicalStage: "Plan", owningActivity: "planning",
      sliceName: options.sliceName, precedingVerifyAttemptId: observation.sourceAttemptId,
      planningBasisEventId: options.planningBasisEventId, scopeArtifactEventId: options.scopeArtifactEventId,
      designArtifactEventId: options.designArtifactEventId }, "slice-start", identity);
    await enterSemanticAttempt(context, "Plan", "planning", identity);
    return finishSemantic(context, observation, "canonical", undefined, "accept the detailed plan for this slice");
  } catch (error) {
    if (/rewrite|conflict|integrity|crash tail/.test(error.message)) throw error;
    return finishSemantic(context, observation, "provisional", error.message, "retain the planned slice in artifacts; retry after a passing Verify and valid basis");
  }
}

const COMMANDS = { enter, accept, exit, return: returnEvent, correct, slice, "approve-audit-gap": approveAuditGap };

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
  if (context.receipts.length && !outcome.sync) outcome.sync = await syncWorkstream(context);
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
  ["--action", "action"],
  ["--source-attempt-id", "sourceAttemptId"],
  ["--observation-id", "observationId"],
  ["--gap-name", "gapName"],
  ["--approved-by", "approvedBy"],
  ["--follow-up", "followUpDestination"],
  ["--close-artifact-event", "closeArtifactEventId"],
  ["--finding", "finding"],
  ["--finding-selector", "findingSelector"],
  ["--owner", "owner"],
  ["--disposition", "disposition"],
  ["--slice", "sliceName"],
  ["--planning-basis", "planningBasisEventId"],
  ["--scope-basis", "scopeArtifactEventId"],
  ["--design-basis", "designArtifactEventId"],
]);

const usage = `usage: stage-boundary.mjs <enter|accept|exit|return|correct|slice|approve-audit-gap> --workstream <id> --stage <stage> --activity <activity> --repository-root <git-root> [options]
  enter  [--label <activity label>] [--feedback <answer> [--note <sentence>]]
  accept --artifact <repository-relative path>
  exit   --feedback <${FEEDBACK_ANSWERS.join("|")}> [--note <sentence>] [--terminal-reason <${TERMINAL_REASONS.join("|")}>]
  return [--event <${RETURN_EVENTS.join("|")}>] [--owning-stage <stage> --owning-activity <activity>]
         [--trigger-source <source>] [--change-kind <kind>] [--evidence-ref <ref>]... [--episode-id <id>]
  correct --action <observe|route|revise|ready|assess|resume|supersede|validate|pass|close|resolve>
          [--finding <actual finding> --finding-selector <stable ID> --owner <owner> --artifact <evidence>]
          [--observation-id <receipt ID>] [--episode-id <receipt ID>] [--disposition <resume|supersede>]
          [--rerun-check <check>]... [--linked-event <ID>]... [--linked-attempt <ID>]...
          [--linked-artifact-event <ID>]...
  slice   --stage Plan --activity planning --slice <name> --artifact <evidence>
          --planning-basis <accepted event ID> --scope-basis <accepted event ID> --design-basis <accepted event ID>
  approve-audit-gap --stage Close --activity closeout --observation-id <ID> --gap-name <name>
          --approved-by <named owner> --follow-up <destination> --close-artifact-event <accepted Close event ID>`;

export function parseArguments(arguments_) {
  const [command, ...rest] = arguments_;
  if (!COMMANDS[command]) throw usageError(usage);
  const options = { command, evidenceRefs: [], linkedEventIds: [], linkedAttemptIds: [],
    linkedArtifactEventIds: [], reusableEvidence: [], invalidatedEvidence: [], rerunChecks: [] };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (value === undefined) throw usageError(usage);
    const repeatable = { "--evidence-ref": "evidenceRefs", "--linked-event": "linkedEventIds",
      "--linked-attempt": "linkedAttemptIds", "--linked-artifact-event": "linkedArtifactEventIds",
      "--reusable-evidence": "reusableEvidence", "--invalidated-evidence": "invalidatedEvidence",
      "--rerun-check": "rerunChecks" }[flag];
    if (repeatable) { options[repeatable].push(value); continue; }
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
