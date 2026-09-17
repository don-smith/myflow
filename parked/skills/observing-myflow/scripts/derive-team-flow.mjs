#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  resolveStageIntervals,
  deriveReturnSummaries,
  ATTEMPT_INTERVAL_SOURCE_LIFECYCLE,
  ATTEMPT_INTERVAL_SOURCE_INFERRED,
} from "./lib/attempt-economics.mjs";

const EVIDENCE_VERSION = "myflow-observation-evidence/v1";
const ANALYSIS_VERSION = "myflow-observation-analysis/v1";
const TEAM_VERSION = "myflow-team-flow/v2";
const STAGES = new Set(["Scope", "Plan", "Implement", "Verify", "Close"]);
const FLOW_ITEM_TYPES = new Set(["Feature", "Defect", "Debt", "Risk", "Unknown"]);
const BOUNDARY_SEMANTICS = new Set(["scope-to-close", "value-stream-to-customer"]);
const USAGE_DIMENSIONS = [
  "uncachedInputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "outputTokens",
  "reasoningTokens",
  "totalTokens",
];

function usage() {
  return `Usage: node derive-team-flow.mjs --evidence <snapshot.json> --analysis <analysis.json> --output <team-flow.json> [--lifecycle <workstream-root>]\n`;
}

function parseArgs(argv) {
  if (argv.includes("--help")) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const options = { lifecycle: null };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === "--lifecycle") {
      options.lifecycle = resolve(argv[++index]);
      continue;
    }
    if (!["--evidence", "--analysis", "--output"].includes(option)) throw new Error(`Unknown option: ${option}`);
    const value = argv[++index];
    if (!value) throw new Error(`${option} requires a value.`);
    options[option.slice(2)] = resolve(value);
  }
  for (const key of ["evidence", "analysis", "output"]) {
    if (!options[key]) throw new Error(`--${key} is required.`);
  }
  return options;
}

function readJson(path, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function timestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp.`);
  return Date.parse(value);
}

function finiteNonNegative(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number${nullable ? " or null" : ""}.`);
  return value;
}

function optionalMetric(value, label) {
  return value === undefined || value === null ? null : finiteNonNegative(value, label);
}

function validateAnalysis(analysis) {
  if (analysis.schemaVersion !== ANALYSIS_VERSION) throw new Error(`analysis.schemaVersion must be ${ANALYSIS_VERSION}.`);
  for (const key of ["project", "workstream"]) {
    if (typeof analysis[key] !== "string" || !analysis[key].trim()) throw new Error(`analysis.${key} must be a non-empty string.`);
  }
  const startedAtMs = timestamp(analysis.startedAt, "analysis.startedAt");
  const closedAtMs = timestamp(analysis.closedAt, "analysis.closedAt");
  if (closedAtMs <= startedAtMs) throw new Error("analysis.closedAt must be after analysis.startedAt.");
  if (!BOUNDARY_SEMANTICS.has(analysis.boundarySemantics)) {
    throw new Error(`analysis.boundarySemantics must be one of: ${[...BOUNDARY_SEMANTICS].join(", ")}.`);
  }

  const classification = analysis.classification;
  if (!classification || typeof classification !== "object" || Array.isArray(classification)) throw new Error("analysis.classification must be an object.");
  if (!FLOW_ITEM_TYPES.has(classification.flowItemType)) throw new Error(`analysis.classification.flowItemType must be one of: ${[...FLOW_ITEM_TYPES].join(", ")}.`);
  for (const key of ["risk", "depth"]) {
    if (typeof classification[key] !== "string" || !classification[key]) throw new Error(`analysis.classification.${key} must be a non-empty string.`);
  }

  if (!Array.isArray(analysis.stageIntervals)) throw new Error("analysis.stageIntervals must be an array.");
  const intervals = analysis.stageIntervals.map((interval, index) => {
    if (!interval || typeof interval !== "object" || Array.isArray(interval)) throw new Error(`analysis.stageIntervals[${index}] must be an object.`);
    if (!STAGES.has(interval.stage)) throw new Error(`analysis.stageIntervals[${index}].stage is invalid.`);
    const intervalStart = timestamp(interval.startedAt, `analysis.stageIntervals[${index}].startedAt`);
    const intervalEnd = timestamp(interval.endedAt, `analysis.stageIntervals[${index}].endedAt`);
    if (intervalEnd <= intervalStart) throw new Error(`analysis.stageIntervals[${index}] must end after it starts.`);
    if (intervalStart < startedAtMs || intervalEnd > closedAtMs) throw new Error(`analysis.stageIntervals[${index}] must stay inside the workstream boundary.`);
    return { stage: interval.stage, startedAt: interval.startedAt, endedAt: interval.endedAt, startedAtMs: intervalStart, endedAtMs: intervalEnd };
  }).sort((left, right) => left.startedAtMs - right.startedAtMs || left.endedAtMs - right.endedAtMs);

  for (let index = 1; index < intervals.length; index++) {
    if (intervals[index].startedAtMs < intervals[index - 1].endedAtMs) throw new Error("Stage intervals overlap. Each usage event may belong to at most one interval.");
  }

  return { startedAtMs, closedAtMs, intervals };
}

function privateExperience(value, label) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object or null.`);
  if (typeof value.value !== "string" || !value.value) throw new Error(`${label}.value must be a non-empty string.`);
  if (typeof value.source !== "string" || !value.source) throw new Error(`${label}.source must be a non-empty string.`);
  return { value: value.value, source: value.source };
}

function aggregateValues(value, label) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, amount]) => {
    if (amount !== null && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
      throw new Error(`${label}.${key} must be a non-negative number or null.`);
    }
    return [key, amount];
  }));
}

function normalizedUsage(entry, index) {
  if (!entry.usage) return null;
  const eventTime = timestamp(entry.timestamp, `evidence.entries[${index}].timestamp`);
  const dimensions = Object.fromEntries(USAGE_DIMENSIONS.map((key) => [key, entry.usage[key]]));
  for (const key of USAGE_DIMENSIONS) finiteNonNegative(dimensions[key], `evidence.entries[${index}].usage.${key}`);
  const rawCost = entry.usage.recordedCostUsd ?? entry.usage.cost ?? null;
  const recordedCostUsd = rawCost === null ? null : finiteNonNegative(rawCost, `evidence.entries[${index}].usage.recordedCostUsd`);
  return {
    timestampMs: eventTime,
    provider: typeof entry.provider === "string" && entry.provider ? entry.provider : "unknown",
    model: typeof entry.model === "string" && entry.model ? entry.model : "unknown",
    ...dimensions,
    recordedCostUsd,
  };
}

function emptyTotals() {
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
  };
}

function addEvent(totals, event) {
  totals.calls++;
  for (const key of USAGE_DIMENSIONS) totals[key] += event[key];
  if (event.recordedCostUsd !== null) {
    totals.recordedCostUsd += event.recordedCostUsd;
    totals.recordedCostCalls++;
  }
}

function finishTotals(totals) {
  const { recordedCostCalls, ...result } = totals;
  result.recordedCostUsd = recordedCostCalls ? Number(result.recordedCostUsd.toFixed(6)) : null;
  result.costCoverage = {
    recordedCalls: recordedCostCalls,
    missingCalls: result.calls - recordedCostCalls,
    ratio: result.calls ? recordedCostCalls / result.calls : null,
  };
  return result;
}

function groupEvents(events, keys) {
  const groups = new Map();
  for (const event of events) {
    const values = keys.map((key) => event[key]);
    const mapKey = values.join("\u0000");
    if (!groups.has(mapKey)) groups.set(mapKey, { values, totals: emptyTotals() });
    addEvent(groups.get(mapKey).totals, event);
  }
  return [...groups.values()]
    .map(({ values, totals }) => ({ ...Object.fromEntries(keys.map((key, index) => [key, values[index]])), ...finishTotals(totals) }))
    .sort((left, right) => keys.map((key) => left[key].localeCompare(right[key])).find((result) => result !== 0) ?? 0);
}

function efficiency(analysis) {
  const activeTimeMs = optionalMetric(analysis.activeTimeMs, "analysis.activeTimeMs");
  const waitTimeMs = optionalMetric(analysis.waitTimeMs, "analysis.waitTimeMs");
  if (activeTimeMs === null || waitTimeMs === null || activeTimeMs + waitTimeMs === 0) {
    return {
      value: null,
      activeTimeMs,
      waitTimeMs,
      coverage: activeTimeMs === null && waitTimeMs === null ? "not-measured" : "partial",
    };
  }
  return { value: activeTimeMs / (activeTimeMs + waitTimeMs), activeTimeMs, waitTimeMs, coverage: "active-and-wait-measured" };
}

function derive(evidence, analysis, { lifecyclePath = null } = {}) {
  if (evidence.schemaVersion !== EVIDENCE_VERSION) throw new Error(`evidence.schemaVersion must be ${EVIDENCE_VERSION}.`);
  if (!Array.isArray(evidence.entries)) throw new Error("evidence.entries must be an array.");
  const { startedAtMs, closedAtMs, intervals } = validateAnalysis(analysis);
  const allUsage = evidence.entries.map(normalizedUsage).filter(Boolean);
  const inside = allUsage.filter((event) => event.timestampMs >= startedAtMs && event.timestampMs < closedAtMs);
  const assigned = [];
  const unassigned = [];
  for (const event of inside) {
    const interval = intervals.find((candidate) => event.timestampMs >= candidate.startedAtMs && event.timestampMs < candidate.endedAtMs);
    if (interval) assigned.push({ ...event, stage: interval.stage });
    else unassigned.push(event);
  }

  const totals = emptyTotals();
  for (const event of inside) addEvent(totals, event);
  const assignedTotals = emptyTotals();
  for (const event of assigned) addEvent(assignedTotals, event);
  const unassignedTotals = emptyTotals();
  for (const event of unassigned) addEvent(unassignedTotals, event);
  const finishedAssigned = finishTotals(assignedTotals);
  const finishedUnassigned = finishTotals(unassignedTotals);

  const stageResidenceMs = {};
  for (const interval of intervals) stageResidenceMs[interval.stage] = (stageResidenceMs[interval.stage] ?? 0) + interval.endedAtMs - interval.startedAtMs;
  const turnaroundWindows = Array.isArray(evidence.metrics?.turnaroundWindows) ? evidence.metrics.turnaroundWindows : [];
  const boundedTurnaroundWindows = turnaroundWindows.filter((window) => {
    const start = Date.parse(window.startedAt);
    const end = Date.parse(window.endedAt);
    return !Number.isNaN(start) && !Number.isNaN(end) && start >= startedAtMs && end <= closedAtMs && typeof window.durationMs === "number";
  });
  const observableTurnaroundMs = analysis.observableTurnaroundMs === undefined
    ? (boundedTurnaroundWindows.length ? boundedTurnaroundWindows.reduce((sum, window) => sum + window.durationMs, 0) : null)
    : optionalMetric(analysis.observableTurnaroundMs, "analysis.observableTurnaroundMs");
  const execution = analysis.executionFlow ?? {};

  // Derive return summaries from lifecycle when available
  let lifecycleReturnSummaries = null;
  if (lifecyclePath) {
    const resolvedIntervals = resolveStageIntervals(lifecyclePath);
    if (resolvedIntervals.source === ATTEMPT_INTERVAL_SOURCE_LIFECYCLE) {
      lifecycleReturnSummaries = resolvedIntervals.returnSummaries;
    }
  }

  // Merge lifecycle-derived return data with explicit analysis overrides.
  // Analysis values take precedence; lifecycle fills gaps.
  const returnSummaries = lifecycleReturnSummaries ?? {};
  const reworkEpisodes =
    execution.reworkEpisodes ??
    returnSummaries.reworkEpisodes ??
    returnSummaries.returnEpisodeCount ??
    null;
  const stageReturnCount =
    execution.stageReturnCount ?? returnSummaries.stageReturnCount ?? null;
  const returnLoopMs =
    execution.returnLoopMs ?? returnSummaries.returnLoopMs ?? null;
  const returnEpisodeCount =
    execution.returnEpisodeCount ??
    returnSummaries.returnEpisodeCount ??
    null;

  // Private episode detail: include when lifecycle is available
  const privateEpisodeDetail =
    returnSummaries.episodes && returnSummaries.episodes.length > 0
      ? returnSummaries.episodes
      : null;

  return {
    schemaVersion: TEAM_VERSION,
    analysisVersion: ANALYSIS_VERSION,
    project: analysis.project,
    workstream: analysis.workstream,
    classification: {
      risk: analysis.classification.risk,
      depth: analysis.classification.depth,
      flowItemType: analysis.classification.flowItemType,
    },
    boundaries: {
      startedAt: analysis.startedAt,
      closedAt: analysis.closedAt,
      boundarySemantics: analysis.boundarySemantics,
      intervalConvention: "half-open [startedAt, closedAt)",
    },
    flowFrameworkContribution: {
      flowItemType: analysis.classification.flowItemType,
      completionContribution: 1,
      loadInterval: { startedAt: analysis.startedAt, closedAt: analysis.closedAt },
      scopeToCloseCycleTimeMs: closedAtMs - startedAtMs,
      flowTimeMs: analysis.boundarySemantics === "value-stream-to-customer" ? closedAtMs - startedAtMs : null,
      efficiency: efficiency(analysis),
    },
    executionFlow: {
      stageIntervals: intervals.map(({ stage, startedAt, endedAt }) => ({ stage, startedAt, endedAt, residenceMs: Date.parse(endedAt) - Date.parse(startedAt) })),
      stageResidenceMs: Object.fromEntries(Object.entries(stageResidenceMs).sort(([left], [right]) => left.localeCompare(right))),
      observableTurnaroundMs,
      unknownGapMs: optionalMetric(analysis.unknownGapMs, "analysis.unknownGapMs"),
      reworkEpisodes: optionalMetric(reworkEpisodes, "analysis.executionFlow.reworkEpisodes"),
      stageReturnCount: optionalMetric(stageReturnCount, "analysis.executionFlow.stageReturnCount"),
      lateDiscoveryCount: optionalMetric(execution.lateDiscoveryCount, "analysis.executionFlow.lateDiscoveryCount"),
      returnLoopMs: optionalMetric(returnLoopMs, "analysis.executionFlow.returnLoopMs"),
      verificationLatencyMs: optionalMetric(execution.verificationLatencyMs, "analysis.executionFlow.verificationLatencyMs"),
      processFriction: aggregateValues(execution.processFriction, "analysis.executionFlow.processFriction"),
      returnEpisodeCount: optionalMetric(returnEpisodeCount, "analysis.executionFlow.returnEpisodeCount"),
      lifecycleSource: lifecycleReturnSummaries?.source ?? ATTEMPT_INTERVAL_SOURCE_INFERRED,
      ...(privateEpisodeDetail
        ? { privateEpisodeDetail }
        : {}),
    },
    developerExperience: {
      selfReport: privateExperience(analysis.developerExperience?.selfReport, "analysis.developerExperience.selfReport"),
      closeSatisfaction: privateExperience(analysis.developerExperience?.closeSatisfaction, "analysis.developerExperience.closeSatisfaction"),
    },
    aiEconomics: {
      ...finishTotals(totals),
      attribution: {
        boundaryExcludedCalls: allUsage.length - inside.length,
        assignedCalls: assigned.length,
        unassignedCalls: unassigned.length,
        assignedRecordedCostUsd: finishedAssigned.recordedCostUsd,
        unassignedRecordedCostUsd: finishedUnassigned.recordedCostUsd,
        assignedCostCoverage: finishedAssigned.costCoverage,
        unassignedCostCoverage: finishedUnassigned.costCoverage,
      },
      byStage: groupEvents(assigned, ["stage"]),
      byProviderModel: groupEvents(inside, ["provider", "model"]),
    },
    outcomes: {
      verifyVerdict: analysis.outcomes?.verifyVerdict ?? "unknown",
      acceptedPhaseCount: optionalMetric(analysis.outcomes?.acceptedPhaseCount, "analysis.outcomes.acceptedPhaseCount") ?? 0,
      toolSuccessRate: optionalMetric(analysis.outcomes?.toolSuccessRate, "analysis.outcomes.toolSuccessRate"),
    },
    versions: analysis.versions && typeof analysis.versions === "object" && !Array.isArray(analysis.versions) ? analysis.versions : {},
    limitations: Array.isArray(analysis.limitations) ? analysis.limitations.filter((item) => typeof item === "string") : [],
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidence = readJson(options.evidence, "evidence");
  const analysis = readJson(options.analysis, "analysis");
  const output = derive(evidence, analysis, { lifecyclePath: options.lifecycle });
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ schemaVersion: output.schemaVersion, project: output.project, workstream: output.workstream, outputPath: options.output })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
  process.exitCode = 1;
}
