#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TEAM_VERSION = "myflow-team-flow/v2";
const ROLLUP_VERSION = "myflow-flow-rollup/v1";
const FLOW_ITEM_TYPES = ["Feature", "Defect", "Debt", "Risk", "Unknown"];
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
  return `Usage: node rollup-flow-metrics.mjs (--target <worktree> | --observation-root <path>) --window-start <timestamp> --window-end <timestamp> --output <rollup.json>\n`;
}

function parseArgs(argv) {
  if (argv.includes("--help")) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!["--target", "--observation-root", "--window-start", "--window-end", "--output"].includes(option)) throw new Error(`Unknown option: ${option}`);
    if (!value) throw new Error(`${option} requires a value.`);
    options[option.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  if (Boolean(options.target) === Boolean(options.observationRoot)) throw new Error("Supply exactly one of --target or --observation-root.");
  for (const key of ["windowStart", "windowEnd", "output"]) {
    if (!options[key]) throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  }
  options.target = options.target ? resolve(options.target) : undefined;
  options.observationRoot = options.observationRoot ? resolve(options.observationRoot) : undefined;
  options.output = resolve(options.output);
  options.windowStartMs = timestamp(options.windowStart, "--window-start");
  options.windowEndMs = timestamp(options.windowEnd, "--window-end");
  if (options.windowEndMs <= options.windowStartMs) throw new Error("--window-end must be after --window-start.");
  return options;
}

function timestamp(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp${nullable ? " or null" : ""}.`);
  return Date.parse(value);
}

function nonNegative(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number${nullable ? " or null" : ""}.`);
  return value;
}

function ratio(value, label, nullable = false) {
  const result = nonNegative(value, label, nullable);
  if (result !== null && result > 1) throw new Error(`${label} must not exceed 1.`);
  return result;
}

function canonical(path) {
  const absolute = resolve(path);
  const missingSegments = [];
  let existingAncestor = absolute;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) return absolute;
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }
  return join(realpathSync(existingAncestor), ...missingSegments);
}

function isInside(parent, child) {
  const path = relative(canonical(parent), canonical(child));
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function repositoryObservationRoot(target) {
  const resolver = resolve(dirname(fileURLToPath(import.meta.url)), "../../myflow/scripts/resolve-repository-map.mjs");
  let result;
  try {
    result = JSON.parse(execFileSync(process.execPath, [resolver, "target", "--cwd", target], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch (error) {
    throw new Error(`Cannot resolve the repository observation root: ${String(error.stderr ?? error.message).trim()}`);
  }
  if (result.error || typeof result.mapPath !== "string") throw new Error("Cannot resolve the repository observation root.");
  return join(dirname(result.mapPath), "observations");
}

function coverage(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const recordedCalls = nonNegative(value.recordedCalls, `${label}.recordedCalls`);
  const missingCalls = nonNegative(value.missingCalls, `${label}.missingCalls`);
  const expected = recordedCalls + missingCalls ? recordedCalls / (recordedCalls + missingCalls) : null;
  const actual = ratio(value.ratio, `${label}.ratio`, true);
  if (actual !== expected) throw new Error(`${label}.ratio does not match its call counts.`);
  return { recordedCalls, missingCalls, ratio: actual };
}

function economics(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const result = { calls: nonNegative(value.calls, `${label}.calls`) };
  for (const key of USAGE_DIMENSIONS) result[key] = nonNegative(value[key], `${label}.${key}`);
  result.recordedCostUsd = nonNegative(value.recordedCostUsd, `${label}.recordedCostUsd`, true);
  result.costCoverage = coverage(value.costCoverage, `${label}.costCoverage`);
  if (result.costCoverage.recordedCalls + result.costCoverage.missingCalls !== result.calls) throw new Error(`${label}.costCoverage does not match calls.`);
  return result;
}

function validateExport(value, directoryWorkstream) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("export must be a JSON object.");
  if (value.schemaVersion !== TEAM_VERSION) throw new Error(`schemaVersion must be ${TEAM_VERSION}.`);
  if (typeof value.project !== "string" || !value.project) throw new Error("project must be a non-empty string.");
  if (typeof value.workstream !== "string" || !value.workstream) throw new Error("workstream must be a non-empty string.");
  if (value.workstream !== directoryWorkstream) throw new Error("workstream does not match its observation directory.");

  const contribution = value.flowFrameworkContribution;
  if (!contribution || typeof contribution !== "object" || Array.isArray(contribution)) throw new Error("flowFrameworkContribution must be an object.");
  if (!FLOW_ITEM_TYPES.includes(contribution.flowItemType)) throw new Error("flowFrameworkContribution.flowItemType is invalid.");
  const startedAt = contribution.loadInterval?.startedAt;
  const closedAt = contribution.loadInterval?.closedAt ?? null;
  const startedAtMs = timestamp(startedAt, "flowFrameworkContribution.loadInterval.startedAt");
  const closedAtMs = timestamp(closedAt, "flowFrameworkContribution.loadInterval.closedAt", true);
  if (closedAtMs !== null && closedAtMs <= startedAtMs) throw new Error("load interval must have positive duration.");
  if (value.boundaries?.startedAt !== startedAt || (value.boundaries?.closedAt ?? null) !== closedAt) throw new Error("boundaries and loadInterval must agree.");
  const completionContribution = nonNegative(contribution.completionContribution, "flowFrameworkContribution.completionContribution");
  if ((closedAt === null && completionContribution !== 0) || (closedAt !== null && completionContribution !== 1)) throw new Error("completionContribution must be 0 for open items and 1 for closed items.");
  const scopeToCloseCycleTimeMs = nonNegative(contribution.scopeToCloseCycleTimeMs, "flowFrameworkContribution.scopeToCloseCycleTimeMs", true);
  if ((closedAt === null) !== (scopeToCloseCycleTimeMs === null)) throw new Error("scopeToCloseCycleTimeMs must be null only for open items.");
  const boundarySemantics = value.boundaries?.boundarySemantics;
  if (!BOUNDARY_SEMANTICS.has(boundarySemantics)) throw new Error("boundaries.boundarySemantics is invalid.");
  const flowTimeMs = nonNegative(contribution.flowTimeMs, "flowFrameworkContribution.flowTimeMs", true);
  if (boundarySemantics === "scope-to-close" && flowTimeMs !== null) throw new Error("flowTimeMs requires value-stream-to-customer boundaries.");
  if (closedAt === null && flowTimeMs !== null) throw new Error("flowTimeMs must be null for open items.");
  const efficiencyValue = ratio(contribution.efficiency?.value, "flowFrameworkContribution.efficiency.value", true);
  if (efficiencyValue !== null && contribution.efficiency?.coverage !== "active-and-wait-measured") {
    throw new Error("A non-null efficiency value requires active-and-wait-measured coverage.");
  }
  const aiEconomics = economics(value.aiEconomics, "aiEconomics");
  if (!Array.isArray(value.aiEconomics.byProviderModel)) throw new Error("aiEconomics.byProviderModel must be an array.");
  const byProviderModel = value.aiEconomics.byProviderModel.map((group, index) => {
    if (typeof group?.provider !== "string" || !group.provider || typeof group?.model !== "string" || !group.model) throw new Error(`aiEconomics.byProviderModel[${index}] requires provider and model.`);
    return { provider: group.provider, model: group.model, ...economics(group, `aiEconomics.byProviderModel[${index}]`) };
  });
  return {
    project: value.project,
    workstream: value.workstream,
    flowItemType: contribution.flowItemType,
    startedAt,
    startedAtMs,
    closedAt,
    closedAtMs,
    completionContribution,
    scopeToCloseCycleTimeMs,
    flowTimeMs,
    efficiencyValue,
    aiEconomics,
    byProviderModel,
  };
}

function scanExports(root) {
  const counts = { malformed: 0, unsupportedSchema: 0, invalidV2: 0 };
  let scannedExports = 0;
  let compatibleExports = 0;
  const selected = [];
  if (!existsSync(root)) return { counts, scannedExports, compatibleExports, selected };
  for (const directory of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const curated = join(root, directory.name, "curated");
    if (!existsSync(curated)) continue;
    let latest;
    for (const file of readdirSync(curated, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith("-team-flow.json")).sort((left, right) => left.name.localeCompare(right.name))) {
      scannedExports++;
      let value;
      try {
        value = JSON.parse(readFileSync(join(curated, file.name), "utf8"));
      } catch {
        counts.malformed++;
        continue;
      }
      if (value?.schemaVersion !== TEAM_VERSION) {
        counts.unsupportedSchema++;
        continue;
      }
      try {
        latest = validateExport(value, directory.name);
        compatibleExports++;
      } catch {
        counts.invalidV2++;
      }
    }
    if (latest) selected.push(latest);
  }
  return { counts, scannedExports, compatibleExports, selected };
}

function statistic(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median,
  };
}

function metricSummary(items, selector) {
  const values = items.map(selector).filter((value) => value !== null);
  return {
    unit: "ms",
    summary: statistic(values),
    coverage: {
      measuredItems: values.length,
      missingItems: items.length - values.length,
      ratio: items.length ? values.length / items.length : null,
    },
  };
}

function loadHistory(items, windowStartMs, windowEndMs) {
  let load = items.filter((item) => item.startedAtMs <= windowStartMs && (item.closedAtMs === null || item.closedAtMs > windowStartMs)).length;
  const changes = new Map();
  for (const item of items) {
    if (item.startedAtMs > windowStartMs && item.startedAtMs < windowEndMs) changes.set(item.startedAtMs, (changes.get(item.startedAtMs) ?? 0) + 1);
    if (item.closedAtMs !== null && item.closedAtMs > windowStartMs && item.closedAtMs <= windowEndMs) changes.set(item.closedAtMs, (changes.get(item.closedAtMs) ?? 0) - 1);
  }
  const history = [{ at: new Date(windowStartMs).toISOString(), load }];
  for (const [at, change] of [...changes].sort(([left], [right]) => left - right)) {
    load += change;
    history.push({ at: new Date(at).toISOString(), load });
  }
  if (history.at(-1).at !== new Date(windowEndMs).toISOString()) history.push({ at: new Date(windowEndMs).toISOString(), load });
  return { history, currentValue: load };
}

function emptyEconomics() {
  return {
    calls: 0,
    ...Object.fromEntries(USAGE_DIMENSIONS.map((key) => [key, 0])),
    recordedCostUsd: 0,
    recordedCalls: 0,
    missingCalls: 0,
  };
}

function addEconomics(target, source) {
  target.calls += source.calls;
  for (const key of USAGE_DIMENSIONS) target[key] += source[key];
  if (source.recordedCostUsd !== null) target.recordedCostUsd += source.recordedCostUsd;
  target.recordedCalls += source.costCoverage.recordedCalls;
  target.missingCalls += source.costCoverage.missingCalls;
}

function finishEconomics(value) {
  const { recordedCalls, missingCalls, ...result } = value;
  result.recordedCostUsd = recordedCalls ? Number(result.recordedCostUsd.toFixed(6)) : null;
  result.costCoverage = {
    recordedCalls,
    missingCalls,
    ratio: recordedCalls + missingCalls ? recordedCalls / (recordedCalls + missingCalls) : null,
  };
  return result;
}

function rollup(scan, options) {
  const selected = scan.selected;
  const projects = [...new Set(selected.map((item) => item.project))];
  if (projects.length > 1) throw new Error("Compatible exports contain more than one project identity.");
  const completed = selected.filter((item) => item.closedAtMs !== null && item.closedAtMs >= options.windowStartMs && item.closedAtMs < options.windowEndMs);
  const distribution = Object.fromEntries(FLOW_ITEM_TYPES.map((type) => {
    const count = completed.filter((item) => item.flowItemType === type).length;
    return [type, { count, ratio: completed.length ? count / completed.length : null }];
  }));
  const unknownItems = distribution.Unknown.count;
  distribution.coverage = {
    knownItems: completed.length - unknownItems,
    unknownItems,
    knownRatio: completed.length ? (completed.length - unknownItems) / completed.length : null,
  };
  const loadItems = selected.filter((item) => item.startedAtMs < options.windowEndMs && (item.closedAtMs === null || item.closedAtMs > options.windowStartMs));
  const load = loadHistory(loadItems, options.windowStartMs, options.windowEndMs);
  const efficiencyValues = completed.map((item) => item.efficiencyValue).filter((value) => value !== null);

  const totals = emptyEconomics();
  const providerModels = new Map();
  for (const item of completed) {
    addEconomics(totals, item.aiEconomics);
    for (const group of item.byProviderModel) {
      const key = `${group.provider}\u0000${group.model}`;
      if (!providerModels.has(key)) providerModels.set(key, { provider: group.provider, model: group.model, totals: emptyEconomics() });
      addEconomics(providerModels.get(key).totals, group);
    }
  }

  return {
    schemaVersion: ROLLUP_VERSION,
    project: projects[0] ?? null,
    reportingWindow: {
      startedAt: new Date(options.windowStartMs).toISOString(),
      endedAt: new Date(options.windowEndMs).toISOString(),
      intervalConvention: "half-open [startedAt, endedAt)",
      completionRule: "closedAt falls inside the reporting window",
    },
    selection: {
      scannedExports: scan.scannedExports,
      compatibleExports: scan.compatibleExports,
      selectedWorkstreams: selected.length,
      incompatibleExports: scan.counts,
    },
    flowMetrics: {
      velocity: { completedItems: completed.length, windowDurationMs: options.windowEndMs - options.windowStartMs },
      distribution,
      load: {
        history: load.history,
        current: {
          asOf: new Date(options.windowEndMs).toISOString(),
          value: load.currentValue,
          coverage: loadItems.some((item) => item.closedAtMs === null) ? "includes-open-and-finalized-intervals" : "finalized-intervals-only",
        },
      },
      cycleTime: metricSummary(completed, (item) => item.scopeToCloseCycleTimeMs),
      flowTime: metricSummary(completed, (item) => item.flowTimeMs),
      efficiency: {
        mean: efficiencyValues.length ? efficiencyValues.reduce((sum, value) => sum + value, 0) / efficiencyValues.length : null,
        coverage: {
          measuredItems: efficiencyValues.length,
          missingItems: completed.length - efficiencyValues.length,
          ratio: completed.length ? efficiencyValues.length / completed.length : null,
        },
      },
    },
    aiEconomics: {
      itemsIncluded: completed.length,
      ...finishEconomics(totals),
      byProviderModel: [...providerModels.values()]
        .map(({ provider, model, totals: groupTotals }) => ({ provider, model, ...finishEconomics(groupTotals) }))
        .sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
    },
    interpretation: "Repository flow and AI economics diagnose the delivery system. They are not individual productivity measures.",
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.target && isInside(options.target, options.output)) throw new Error("Rollup output must stay outside the target worktree.");
  const observationRoot = options.observationRoot ?? repositoryObservationRoot(options.target);
  const scan = scanExports(observationRoot);
  const output = rollup(scan, options);
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ schemaVersion: output.schemaVersion, project: output.project, selectedWorkstreams: output.selection.selectedWorkstreams, outputPath: options.output })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
  process.exitCode = 1;
}
