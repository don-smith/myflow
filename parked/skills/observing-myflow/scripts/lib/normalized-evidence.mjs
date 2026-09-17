import { createHash } from "node:crypto";

import { canonicalJson } from "../../../../../skills/myflow/scripts/lib/lifecycle-contract.mjs";

export const NORMALIZED_EVIDENCE_SCHEMA_VERSION = "myflow-normalized-evidence/v1";

export const DELIVERY_STATES = Object.freeze([
  "observed-within-window",
  "timeout",
  "late-visible",
  "deadline-incomplete",
  "unknown",
]);

export const STRUCTURAL_COVERAGE = Object.freeze([
  "observed-complete",
  "partial",
  "unknown",
]);

export const KNOWN_OBSERVATION_TYPES = new Set([
  "GENERATION",
  "SPAN",
  "TOOL",
  "EVENT",
  "AGENT",
  "CHAIN",
  "RETRIEVER",
  "EVALUATOR",
  "EMBEDDING",
  "GUARDRAIL",
]);

export const ROOT_CAPABILITY_NAMES = new Set([
  "Conversational Turn",
  "Subagent Turn",
]);

export const ASSOCIATION_STATUSES = Object.freeze([
  "assigned",
  "ambiguous",
  "unassigned",
]);

export const ASSOCIATION_CONFIDENCE = Object.freeze([
  "exact",
  "strong",
  "medium",
  "weak",
]);

export const STATE_VALUES = Object.freeze([
  "ok",
  "error",
  "cancelled",
  "aborted",
]);

export const USAGE_DIMENSIONS = [
  "uncachedInputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "outputTokens",
  "reasoningTokens",
  "totalTokens",
];

const numeric = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function stable(value) {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, value[k]]),
    ),
  );
}

/**
 * Normalize a single raw Langfuse v2 observation row into the
 * versioned normalized evidence contract.
 */
export function normalizeObservation(row) {
  const usage = row.usageDetails || {};
  const cost = row.costDetails || {};
  const reasoning = numeric(usage.output_reasoning_tokens);
  const output = numeric(usage.output);

  return {
    source: "langfuse-v2",
    sourceId: row.id,
    rowId: `langfuse-v2:${row.id}`,
    traceId: row.traceId,
    parentObservationId: row.parentObservationId,
    type: String(row.type || "UNKNOWN"),
    knownType: KNOWN_OBSERVATION_TYPES.has(String(row.type)),
    name: String(row.name || ""),
    startTime: row.startTime,
    endTime: row.endTime,
    isRootCapability:
      ROOT_CAPABILITY_NAMES.has(row.name) &&
      row.metadata?.extension === "@langfuse/pi-observability-plugin",
    rootObservationId: undefined,
    emittingSessionId: numeric(row.metadata?.turn_number) !== undefined
      ? row.metadata?.session_id
      : undefined,
    groupingSessionId: row.sessionId,
    turnNumber: numeric(row.metadata?.turn_number),
    pluginName: row.metadata?.extension,
    pluginVersion: row.metadata?.extension_version,
    pluginCapability:
      row.metadata?.extension_version === undefined
        ? undefined
        : row.metadata.extension_version === "0.1.2"
          ? "supported-tree-economics-v0.1.2"
          : "unsupported-version",
    provider: row.metadata?.provider || row.provider,
    model: row.model || row.metadata?.model,
    assistantIndex: numeric(row.metadata?.assistant_index),
    callOrder: undefined,
    toolCallId: row.metadata?.tool_id || row.metadata?.tool_call_id,
    level: row.level,
    statusMessage: row.statusMessage,
    state: row.level === "ERROR"
      ? "error"
      : row.metadata?.cancelled
        ? "cancelled"
        : "ok",
    usage: {
      uncachedInputTokens: numeric(usage.input),
      cacheReadTokens: numeric(usage.cache_read_input_tokens),
      cacheWriteTokens: numeric(usage.cache_creation_input_tokens),
      outputTokens:
        output === undefined && reasoning === undefined
          ? undefined
          : (output || 0) + (reasoning || 0),
      reasoningTokens: reasoning,
      totalTokens: numeric(usage.total),
    },
    cost: { recordedTotal: numeric(cost.total) },
    costKnown: numeric(cost.total) !== undefined,
    contextSources: {},
    provenance: [row.id],
  };
}

/**
 * Propagate root context (emitting/grouping session, turn, plugin info,
 * provider/model) to every descendant in the physical tree.
 * Orphans retain unknown context. Derives callOrder for GENERATION/LLM Call
 * siblings when assistant_index is absent.
 */
export function propagateTreeContext(rows) {
  const out = rows.map((x) => ({ ...x, contextSources: { ...x.contextSources } }));
  const byId = new Map(out.map((x) => [x.sourceId, x]));
  const children = new Map();

  for (const x of out) {
    const pid = x.parentObservationId;
    if (pid) {
      const a = children.get(pid) || [];
      a.push(x);
      children.set(pid, a);
    }
  }

  const visited = new Set();

  function visit(x, parent, root) {
    if (visited.has(x.sourceId)) return;
    visited.add(x.sourceId);

    const rootHere = x.isRootCapability ? x : root || parent;

    const inherit = (key) => {
      if (x[key] === undefined && parent?.[key] !== undefined) {
        x[key] = parent[key];
        x.contextSources[key] = "inherited";
      } else if (x[key] !== undefined) {
        x.contextSources[key] = "own";
      }
    };

    for (const key of [
      "emittingSessionId",
      "groupingSessionId",
      "turnNumber",
      "pluginName",
      "pluginVersion",
      "pluginCapability",
      "provider",
      "model",
    ]) {
      inherit(key);
    }

    x.rootObservationId = rootHere?.sourceId;
    x.contextSources.rootObservationId = x.isRootCapability
      ? "own"
      : "physical-root";

    for (const child of children.get(x.sourceId) || []) {
      visit(child, x, rootHere);
    }
  }

  // Visit roots and standalone observations
  for (const x of out.filter(
    (x) => !x.parentObservationId || !byId.has(x.parentObservationId) || x.isRootCapability,
  )) {
    visit(x, undefined, x.isRootCapability ? x : undefined);
  }

  // Catch orphans
  for (const x of out) {
    if (!visited.has(x.sourceId)) visit(x, undefined, undefined);
  }

  // Derive callOrder for LLM Calls under each root
  const byRoot = new Map();
  for (const x of out.filter(
    (x) => x.type === "GENERATION" && x.name === "LLM Call",
  )) {
    const a = byRoot.get(x.rootObservationId) || [];
    a.push(x);
    byRoot.set(x.rootObservationId, a);
  }

  for (const list of byRoot.values()) {
    list
      .sort(
        (a, b) =>
          (a.startTime || "").localeCompare(b.startTime || "") ||
          a.sourceId.localeCompare(b.sourceId),
      )
      .forEach((x, i) => {
        x.callOrder = i;
        if (x.assistantIndex === undefined) {
          x.contextSources.callOrder = "derived";
        } else {
          x.contextSources.callOrder = "assistant-index-present";
        }
      });
  }

  return out;
}

/**
 * Deduplicate normalized rows by rowId.
 * Byte-identical rows collapse; conflicting rows with the same ID
 * produce conflict records. Returns canonical rows, duplicates, and conflicts.
 */
export function deduplicate(normalized) {
  const groups = new Map();
  for (const row of normalized) {
    const a = groups.get(row.rowId) || [];
    a.push(row);
    groups.set(row.rowId, a);
  }

  const canonical = [];
  const duplicates = [];
  const conflicts = [];

  for (const [id, rows] of groups) {
    if (rows.length === 1) {
      canonical.push(rows[0]);
      continue;
    }

    const signatures = new Set(
      rows.map((x) =>
        stable({
          ...x,
          provenance: undefined,
          contextSources: undefined,
        }),
      ),
    );

    if (signatures.size === 1) {
      canonical.push({
        ...rows[0],
        provenance: rows.map((_, i) => `${rows[0].sourceId}#${i + 1}`),
      });
      duplicates.push({
        identity: id,
        count: rows.length,
        provenance: rows.map((_, i) => `copy-${i + 1}`),
      });
    } else {
      conflicts.push({
        identity: id,
        count: rows.length,
        variants: rows.map((x) => ({
          type: x.type,
          name: x.name,
          input: x.usage.uncachedInputTokens,
          level: x.level || "absent",
        })),
      });
    }
  }

  return { canonical, duplicates, conflicts };
}

/**
 * Compute orphans: observations whose parentObservationId references
 * an observation not in the canonical set. Roots are not orphans.
 */
export function computeOrphans(canonical) {
  const ids = new Set(canonical.map((x) => x.sourceId));
  return canonical
    .filter(
      (x) =>
        x.parentObservationId &&
        !ids.has(x.parentObservationId) &&
        !x.isRootCapability,
    )
    .map((x) => ({
      rowId: x.rowId,
      parentObservationId: x.parentObservationId,
    }));
}

/**
 * Validate that a normalized evidence row has the required fields.
 */
export function validateNormalizedRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("normalized row must be an object");
  }

  const required = [
    "source",
    "sourceId",
    "rowId",
    "traceId",
    "type",
    "name",
  ];
  for (const field of required) {
    if (row[field] === undefined || row[field] === null) {
      throw new Error(`normalized row requires ${field}`);
    }
  }

  if (!["langfuse-v2", "pi-jsonl"].includes(row.source)) {
    throw new Error(`unknown source: ${row.source}`);
  }

  if (row.state !== undefined && !STATE_VALUES.includes(row.state)) {
    throw new Error(`unknown state: ${row.state}`);
  }

  return row;
}

/**
 * Compute structural coverage from the reconciliation result.
 */
export function computeStructuralCoverage(
  rawCount,
  canonicalCount,
  conflicts,
  orphans,
  unknownTypeCount,
) {
  if (rawCount === 0) return "unknown";
  if (conflicts.length > 0 || orphans.length > 0 || unknownTypeCount > 0) {
    return "partial";
  }
  return "observed-complete";
}

/**
 * Compute totals across canonical rows.
 */
export function computeTotals(canonical) {
  const totals = {
    calls: 0,
    tools: 0,
    toolErrors: 0,
    usage: {},
    recordedCost: 0,
    costRecordedCalls: 0,
    costMissingCalls: 0,
  };

  for (const x of canonical) {
    if (x.type === "GENERATION") {
      totals.calls++;
      for (const [k, v] of Object.entries(x.usage)) {
        if (v !== undefined) {
          totals.usage[k] = (totals.usage[k] || 0) + v;
        }
      }
      if (x.costKnown) {
        totals.costRecordedCalls++;
        totals.recordedCost += x.cost.recordedTotal || 0;
      } else {
        totals.costMissingCalls++;
      }
    }
    if (x.type === "TOOL") {
      totals.tools++;
      if (x.state === "error") totals.toolErrors++;
    }
  }

  totals.recordedCost = Number(totals.recordedCost.toFixed(6));
  return totals;
}

/**
 * Stable digest of a set of evidence rows for parity verification.
 */
export function evidenceDigest(rows) {
  const input = rows
    .map((x) => stable({ sourceId: x.sourceId, type: x.type, name: x.name }))
    .sort()
    .join("\n");
  return createHash("sha256").update(input).digest("hex");
}