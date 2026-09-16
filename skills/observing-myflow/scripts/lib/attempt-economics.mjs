/**
 * Attempt economics module.
 *
 * Derives stage intervals and repeated attempts from lifecycle events,
 * attributes calls, token dimensions, provider-recorded cost, provider/model
 * grouping, tools, errors, calendar intervals, and coverage to attempts and
 * correction episodes using non-overlapping half-open intervals plus
 * observation association.
 *
 * Preserves reasoning as a subset dimension, unknown cost, source-missing
 * evidence, and silent gaps. Never calls silence active work or wait time.
 *
 * Derives existing stageReturnCount and return summaries from episodes.
 * Records first-pass flow as a diagnostic next to necessary-learning,
 * changed-intent, Verify quality, and developer experience guardrails.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { reduceLifecycle } from "../../../myflow/scripts/lib/lifecycle-reducer.mjs";
import { validateLifecycleEvent } from "../../../myflow/scripts/lib/lifecycle-contract.mjs";

export const ATTEMPT_INTERVAL_SOURCE_LIFECYCLE = "lifecycle";
export const ATTEMPT_INTERVAL_SOURCE_INFERRED = "inferred";
export const ATTEMPT_ECONOMICS_VERSION = "myflow-attempt-economics/v1";

const USAGE_DIMENSIONS = [
  "uncachedInputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "outputTokens",
  "reasoningTokens",
  "totalTokens",
];

/**
 * Read lifecycle journal events from JSONL file.
 * Returns events array and file path, or null if no journal exists.
 */
export function readLifecycleJournal(workstreamRoot) {
  const journalPath = join(workstreamRoot, "lifecycle", "events.jsonl");
  if (!existsSync(journalPath)) return null;

  const content = readFileSync(journalPath, "utf8");
  const events = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed);
      validateLifecycleEvent(event);
      events.push(event);
    } catch {
      // Skip malformed lines; the reducer will reject invalid chains
    }
  }

  if (events.length === 0) return null;
  return { events, path: journalPath };
}

/**
 * Reduce lifecycle events into workstream state.
 */
export function reduceJournalEvents(events) {
  try {
    return reduceLifecycle(events);
  } catch {
    return null;
  }
}

/**
 * Derive stage attempt intervals from lifecycle state.
 *
 * Each attempt produces a half-open interval [enteredAt, completedAt).
 * Incomplete attempts use a null completedAt and null endedAt for the interval.
 */
export function deriveAttemptIntervals(state) {
  if (!state?.attempts?.length) return [];

  return state.attempts.map((attempt) => ({
    attemptId: attempt.attemptId,
    canonicalStage: attempt.canonicalStage,
    ordinal: attempt.ordinal ?? attempt.attemptOrdinal,
    openingActivity: attempt.openingActivity,
    enteredAt: attempt.enteredAt,
    completedAt: attempt.completedAt,
    terminalReason: attempt.terminalReason ?? null,
    status: attempt.status,
    source: ATTEMPT_INTERVAL_SOURCE_LIFECYCLE,
    enteredAtMs: Date.parse(attempt.enteredAt),
    completedAtMs: attempt.completedAt ? Date.parse(attempt.completedAt) : null,
  }));
}

/**
 * Derive correction episode intervals from lifecycle state.
 *
 * Each episode has:
 * - openedAt/closedAt from the episode record
 * - correctionWindow: [openedAt, resumedAt) — the bounded window during which
 *   correction activity was expected
 * - ownerReadyAt, resumedAt, reverifiedAt for detailed timeline
 */
export function deriveEpisodeIntervals(state) {
  if (!state?.returns?.length) return [];

  return state.returns.map((episode) => ({
    episodeId: episode.episodeId,
    detectingStage: episode.detectingStage,
    detectingActivity: episode.detectingActivity,
    initialOwningStage: episode.routes?.[0]?.stage ?? episode.owner?.stage,
    initialOwningActivity: episode.routes?.[0]?.activity ?? episode.owner?.activity,
    owner: episode.owner
      ? { stage: episode.owner.stage, activity: episode.owner.activity }
      : null,
    status: episode.status,
    triggerSource: episode.triggerSource ?? "unknown",
    changeKind: episode.changeKind ?? "unknown",
    originAttemptId: episode.originAttemptId,
    openedAt: episode.openedAt,
    closedAt: episode.closedAt ?? null,
    ownerReadyAt: episode.ownerReadyAt ?? null,
    resumedAt: episode.resumedAt ?? null,
    reverifiedAt: episode.reverifiedAt ?? null,
    verificationStatus: episode.verificationStatus ?? null,
    routes: (episode.routes ?? []).map((route) => ({
      stage: route.stage,
      activity: route.activity,
      changeKind: route.changeKind,
    })),
    openedAtMs: episode.openedAt ? Date.parse(episode.openedAt) : null,
    closedAtMs: episode.closedAt ? Date.parse(episode.closedAt) : null,
    resumedAtMs: episode.resumedAt ? Date.parse(episode.resumedAt) : null,
    correctionWindowStartedAt: episode.openedAt,
    correctionWindowEndedAt: episode.resumedAt ?? episode.closedAt ?? null,
    correctionWindowStartedAtMs: episode.openedAt ? Date.parse(episode.openedAt) : null,
    correctionWindowEndedAtMs: (episode.resumedAt || episode.closedAt)
      ? Date.parse(episode.resumedAt || episode.closedAt)
      : null,
    canonicalBackwardEdges: episode.routes?.length ?? 1,
  }));
}

/**
 * Attribute normalized evidence observations to attempt intervals using
 * half-open [enteredAt, completedAt) intervals.
 *
 * Each observation with a startTime is tested against each interval.
 * Observations are assigned to the FIRST matching interval (no overlap
 * should exist since state machine enforces sequential attempts).
 *
 * Returns:
 * - assigned: Map<attemptId, observations[]>
 * - unassigned: observations not matching any interval
 * - boundaryExcluded: observations before first or after last interval
 */
export function attributeToAttempts(observations, attemptIntervals) {
  const assigned = new Map();
  const unassigned = [];
  const boundaryExcluded = [];

  if (!attemptIntervals.length) {
    return { assigned, unassigned, boundaryExcluded: observations };
  }

  const sortedIntervals = [...attemptIntervals].sort(
    (a, b) => a.enteredAtMs - b.enteredAtMs,
  );
  const firstStart = sortedIntervals[0].enteredAtMs;
  const lastEnd = sortedIntervals[sortedIntervals.length - 1].completedAtMs;

  for (const obs of observations) {
    const obsTime = Date.parse(obs.startTime);
    if (Number.isNaN(obsTime)) {
      unassigned.push(obs);
      continue;
    }

    if (obsTime < firstStart || (lastEnd !== null && obsTime >= lastEnd)) {
      boundaryExcluded.push(obs);
      continue;
    }

    let found = false;
    for (const interval of sortedIntervals) {
      const end = interval.completedAtMs;
      // Half-open: [enteredAt, completedAt)
      if (
        obsTime >= interval.enteredAtMs &&
        (end === null || obsTime < end)
      ) {
        const list = assigned.get(interval.attemptId) || [];
        list.push(obs);
        assigned.set(interval.attemptId, list);
        found = true;
        break;
      }
    }

    if (!found) {
      unassigned.push(obs);
    }
  }

  return { assigned, unassigned, boundaryExcluded };
}

/**
 * Attribute observations to correction episode windows.
 *
 * Uses the correction window [openedAt, resumedAt) for the episode.
 * Observations that fall inside this window (and aren't already attributed
 * to a forward attempt) can be attributed to the correction episode.
 */
export function attributeToEpisodes(observations, episodeIntervals) {
  const assigned = new Map();

  for (const episode of episodeIntervals) {
    if (!episode.openedAtMs || !episode.correctionWindowEndedAtMs) continue;

    const matching = [];
    for (const obs of observations) {
      const obsTime = Date.parse(obs.startTime);
      if (Number.isNaN(obsTime)) continue;

      if (
        obsTime >= episode.openedAtMs &&
        obsTime < episode.correctionWindowEndedAtMs
      ) {
        matching.push(obs);
      }
    }

    if (matching.length) {
      assigned.set(episode.episodeId, matching);
    }
  }

  return assigned;
}

function emptyUsageTotals() {
  return {
    calls: 0,
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    recordedCostUsd: 0,
    recordedCostCalls: 0,
    providerModels: new Map(),
    tools: {},
    toolErrors: {},
  };
}

function addObservationToTotals(totals, obs) {
  if (obs.type === "GENERATION") {
    totals.calls++;
    for (const key of USAGE_DIMENSIONS) {
      const value = obs.usage?.[key];
      if (typeof value === "number") totals[key] += value;
    }
    const cost = obs.cost?.recordedTotal;
    if (typeof cost === "number") {
      totals.recordedCostUsd += cost;
      totals.recordedCostCalls++;
    }

    const provider = obs.provider ?? "unknown";
    const model = obs.model ?? "unknown";
    const pmKey = `${provider}\u0000${model}`;
    if (!totals.providerModels.has(pmKey)) {
      totals.providerModels.set(pmKey, {
        provider,
        model,
        calls: 0,
        ...Object.fromEntries(USAGE_DIMENSIONS.map((k) => [k, 0])),
        recordedCostUsd: 0,
        recordedCostCalls: 0,
      });
    }
    const pm = totals.providerModels.get(pmKey);
    pm.calls++;
    for (const key of USAGE_DIMENSIONS) {
      const value = obs.usage?.[key];
      if (typeof value === "number") pm[key] += value;
    }
    if (typeof cost === "number") {
      pm.recordedCostUsd += cost;
      pm.recordedCostCalls++;
    }
  }

  if (obs.type === "TOOL") {
    const toolName = obs.name || "unknown";
    totals.tools[toolName] = (totals.tools[toolName] ?? 0) + 1;
    if (obs.state === "error") {
      totals.toolErrors[toolName] = (totals.toolErrors[toolName] ?? 0) + 1;
    }
  }
}

function finishTotals(totals) {
  const { recordedCostCalls, providerModels, ...rest } = totals;
  const missingCalls = rest.calls - recordedCostCalls;

  const finishedProviderModels = [...providerModels.values()]
    .map(({ recordedCostCalls: pmCostCalls, ...pm }) => ({
      ...pm,
      recordedCostUsd: pmCostCalls
        ? Number(pm.recordedCostUsd.toFixed(6))
        : null,
      costCoverage: {
        recordedCalls: pmCostCalls,
        missingCalls: pm.calls - pmCostCalls,
        ratio: pm.calls ? pmCostCalls / pm.calls : null,
      },
    }))
    .sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.model.localeCompare(b.model),
    );

  return {
    calls: rest.calls,
    uncachedInputTokens: rest.uncachedInputTokens,
    cacheReadTokens: rest.cacheReadTokens,
    cacheWriteTokens: rest.cacheWriteTokens,
    outputTokens: rest.outputTokens,
    reasoningTokens: rest.reasoningTokens,
    totalTokens: rest.totalTokens,
    recordedCostUsd: recordedCostCalls
      ? Number(rest.recordedCostUsd.toFixed(6))
      : null,
    costCoverage: {
      recordedCalls: recordedCostCalls,
      missingCalls,
      ratio: rest.calls ? recordedCostCalls / rest.calls : null,
    },
    byProviderModel: finishedProviderModels,
    tools: { ...rest.tools },
    toolErrors: { ...rest.toolErrors },
    toolTotal: Object.values(rest.tools).reduce((a, b) => a + b, 0),
    toolErrorTotal: Object.values(rest.toolErrors).reduce((a, b) => a + b, 0),
  };
}

/**
 * Compute per-attempt economics from observations.
 *
 * Returns a map of attemptId -> economics object.
 */
export function computeAttemptEconomics(
  observations,
  attemptIntervals,
  { episodes } = {},
) {
  const { assigned, unassigned, boundaryExcluded } = attributeToAttempts(
    observations,
    attemptIntervals,
  );
  const attemptMap = new Map();

  for (const interval of attemptIntervals) {
    const obs = assigned.get(interval.attemptId) || [];
    const totals = emptyUsageTotals();
    for (const o of obs) addObservationToTotals(totals, o);

    const finished = finishTotals(totals);

    // Determine if this attempt was part of a correction episode
    const relatedEpisode = (episodes ?? []).find(
      (ep) =>
        ep.originAttemptId === interval.attemptId ||
        (ep.status === "resumed" &&
          ep.resumedStage === interval.canonicalStage),
    );

    attemptMap.set(interval.attemptId, {
      attemptId: interval.attemptId,
      canonicalStage: interval.canonicalStage,
      ordinal: interval.ordinal,
      interval: {
        enteredAt: interval.enteredAt,
        completedAt: interval.completedAt,
        terminalReason: interval.terminalReason,
        source: interval.source,
      },
      economics: finished,
      observationCount: obs.length,
      correctionContext: relatedEpisode
        ? {
            episodeId: relatedEpisode.episodeId,
            role:
              relatedEpisode.originAttemptId === interval.attemptId
                ? "detected-on-return"
                : "rework",
          }
        : null,
    });
  }

  return {
    attempts: attemptMap,
    assignedObservations: [...assigned.values()].flat().length,
    unassignedObservations: unassigned.length,
    boundaryExcludedObservations: boundaryExcluded.length,
  };
}

/**
 * Compute per-episode economics from observations.
 *
 * Attributes observations to correction episode windows.
 */
export function computeEpisodeEconomics(observations, episodeIntervals) {
  const attributed = attributeToEpisodes(observations, episodeIntervals);
  const episodeMap = new Map();

  for (const episode of episodeIntervals) {
    const obs = attributed.get(episode.episodeId) || [];
    const totals = emptyUsageTotals();
    for (const o of obs) addObservationToTotals(totals, o);

    const finished = finishTotals(totals);

    episodeMap.set(episode.episodeId, {
      episodeId: episode.episodeId,
      detectingStage: episode.detectingStage,
      status: episode.status,
      interval: {
        openedAt: episode.openedAt,
        closedAt: episode.closedAt,
        correctionWindowStartedAt: episode.correctionWindowStartedAt,
        correctionWindowEndedAt: episode.correctionWindowEndedAt,
      },
      economics: finished,
      observationCount: obs.length,
      canonicalBackwardEdges: episode.routes?.length ?? 1,
    });
  }

  return {
    episodes: episodeMap,
  };
}

/**
 * Derive return summaries from lifecycle state for team-safe v2 export.
 *
 * Returns data compatible with the executionFlow section:
 * - stageReturnCount: canonical-stage backward edges
 * - activityReturnCount: same-stage activity returns
 * - returnEpisodeCount: causal correction episodes
 * - returnLoopMs: total correction window duration
 * - reworkEpisodes: alias for returnEpisodeCount
 */
export function deriveReturnSummaries(state) {
  if (!state) {
    return {
      stageReturnCount: null,
      activityReturnCount: null,
      returnEpisodeCount: null,
      reworkEpisodes: null,
      returnLoopMs: null,
      episodes: [],
      source: ATTEMPT_INTERVAL_SOURCE_INFERRED,
    };
  }

  const episodes = deriveEpisodeIntervals(state);

  let totalLoopMs = 0;
  for (const ep of episodes) {
    if (ep.openedAtMs !== null && ep.closedAtMs !== null) {
      totalLoopMs += ep.closedAtMs - ep.openedAtMs;
    } else if (ep.openedAtMs !== null && ep.resumedAtMs !== null) {
      totalLoopMs += ep.resumedAtMs - ep.openedAtMs;
    }
  }

  return {
    stageReturnCount: state.stageReturnCount ?? 0,
    activityReturnCount: state.activityReturnCount ?? 0,
    returnEpisodeCount: state.returnEpisodeCount ?? 0,
    reworkEpisodes: state.returnEpisodeCount ?? 0,
    returnLoopMs: episodes.length > 0 ? totalLoopMs : null,
    episodes: episodes.map((ep) => ({
      episodeId: ep.episodeId,
      detectingStage: ep.detectingStage,
      detectingActivity: ep.detectingActivity,
      ownerStage: ep.owner?.stage ?? null,
      ownerActivity: ep.owner?.activity ?? null,
      status: ep.status,
      triggerSource: ep.triggerSource,
      changeKind: ep.changeKind,
      openedAt: ep.openedAt,
      closedAt: ep.closedAt,
      canonicalBackwardEdges: ep.routes?.length ?? 1,
      isStageReturn: ep.routes?.some(
        (r, i) => i === 0 && r.stage !== ep.detectingStage,
      ) ?? false,
    })),
    source: ATTEMPT_INTERVAL_SOURCE_LIFECYCLE,
  };
}

/**
 * Derive first-pass flow diagnostic.
 *
 * Returns whether this workstream was a first-pass (no returns) or had
 * corrections, plus the diagnostic context for guardrail interpretation.
 */
export function deriveFirstPassFlow(state) {
  if (!state) return { isFirstPass: null, source: ATTEMPT_INTERVAL_SOURCE_INFERRED };

  const isFirstPass = (state.returnEpisodeCount ?? 0) === 0;

  return {
    isFirstPass,
    returnEpisodeCount: state.returnEpisodeCount ?? 0,
    stageReturnCount: state.stageReturnCount ?? 0,
    activityReturnCount: state.activityReturnCount ?? 0,
    guardrails: isFirstPass
      ? [
          "necessary-learning: not applicable (no returns)",
          "changed-intent: not applicable (no returns)",
          "verify-quality: Verify outcome must independently confirm correctness",
          "developer-experience: self-report remains the authority on friction",
        ]
      : [
          "necessary-learning: may be present; review return nature",
          "changed-intent: may be present; review return nature",
          "verify-quality: passing re-verification required",
          "developer-experience: additional friction expected but not a failure",
        ],
    source: ATTEMPT_INTERVAL_SOURCE_LIFECYCLE,
  };
}

/**
 * Check if a lifecycle journal exists and derive intervals from it.
 *
 * @returns {{ source: 'lifecycle', state, attemptIntervals, ... }} or
 *          {{ source: 'inferred' }}
 */
export function resolveStageIntervals(workstreamRoot) {
  const journal = readLifecycleJournal(workstreamRoot);

  if (!journal) {
    return { source: ATTEMPT_INTERVAL_SOURCE_INFERRED };
  }

  const state = reduceJournalEvents(journal.events);
  if (!state) {
    return { source: ATTEMPT_INTERVAL_SOURCE_INFERRED };
  }

  const attemptIntervals = deriveAttemptIntervals(state);
  const episodeIntervals = deriveEpisodeIntervals(state);
  const returnSummaries = deriveReturnSummaries(state);
  const firstPassFlow = deriveFirstPassFlow(state);

  return {
    source: ATTEMPT_INTERVAL_SOURCE_LIFECYCLE,
    state,
    attemptIntervals,
    episodeIntervals,
    returnSummaries,
    firstPassFlow,
    eventCount: journal.events.length,
  };
}

/**
 * Determine the source of stage intervals for a workstream.
 * Used by the collector to mark the source in evidence output.
 */
export function getStageIntervalSource(workstreamRoot) {
  const resolved = resolveStageIntervals(workstreamRoot);
  return {
    source: resolved.source,
    attemptCount: resolved.attemptIntervals?.length ?? 0,
    episodeCount: resolved.episodeIntervals?.length ?? 0,
    hasLifecycle: resolved.source === ATTEMPT_INTERVAL_SOURCE_LIFECYCLE,
  };
}

/**
 * Generate an attempt economics account suitable for inclusion in
 * the private observation analysis.
 */
export function generateAttemptEconomicsAccount(
  observations,
  workstreamRoot,
) {
  const resolved = resolveStageIntervals(workstreamRoot);

  if (resolved.source === ATTEMPT_INTERVAL_SOURCE_INFERRED) {
    return {
      version: ATTEMPT_ECONOMICS_VERSION,
      source: ATTEMPT_INTERVAL_SOURCE_INFERRED,
      note: "No lifecycle journal found. Attempt economics use inferred boundaries from artifact timestamps.",
      attempts: [],
      episodes: [],
      coverage: { assignedObservations: 0, unassignedObservations: 0, boundaryExcludedObservations: 0 },
    };
  }

  const attemptResult = computeAttemptEconomics(
    observations,
    resolved.attemptIntervals,
    { episodes: resolved.episodeIntervals },
  );
  const episodeResult = computeEpisodeEconomics(
    observations,
    resolved.episodeIntervals,
  );

  return {
    version: ATTEMPT_ECONOMICS_VERSION,
    source: ATTEMPT_INTERVAL_SOURCE_LIFECYCLE,
    returnSummaries: resolved.returnSummaries,
    firstPassFlow: resolved.firstPassFlow,
    attempts: [...attemptResult.attempts.values()],
    episodes: [...episodeResult.episodes.values()],
    coverage: {
      assignedObservations: attemptResult.assignedObservations,
      unassignedObservations: attemptResult.unassignedObservations,
      boundaryExcludedObservations: attemptResult.boundaryExcludedObservations,
    },
  };
}