/**
 * Langfuse Pi Observability Plugin 0.1.2 Adapter.
 *
 * Dispatches on the exact plugin contract version 0.1.2.
 * Normalizes observations from the Langfuse v2 API into the
 * versioned normalized evidence contract.
 *
 * Preserves:
 * - Physical tree and root context.
 * - Emitting and grouping session IDs separately.
 * - Traces, observations, parents, turns, assistant order, tool calls.
 * - Provider/model, usage dimensions, provider-recorded cost.
 * - Errors, aborts, compaction, branches, unknown future types.
 * - Structural coverage separate from delivery coverage.
 */

import {
  normalizeObservation,
  propagateTreeContext,
  deduplicate,
  computeOrphans,
  computeStructuralCoverage,
  computeTotals,
  NORMALIZED_EVIDENCE_SCHEMA_VERSION,
  DELIVERY_STATES,
  STRUCTURAL_COVERAGE,
} from "./normalized-evidence.mjs";
import {
  readBoundedWindow,
  sourceCapabilities,
  buildSessionFilter,
} from "./langfuse-v2-reader.mjs";

export const PLUGIN_VERSION = "0.1.2";
export const PLUGIN_NAME = "@langfuse/pi-observability-plugin";

/**
 * Source capabilities for the official Pi 0.1.2 plugin.
 * These are what the plugin CAN provide; gaps represent
 * features the plugin does not offer.
 */
export function pluginCapabilities() {
  return {
    pluginName: PLUGIN_NAME,
    pluginVersion: PLUGIN_VERSION,
    systemPrompt: false, // 0.1.2 does not capture system prompt
    completeRequest: false, // No complete provider request / conversation history
    reasoningContent: false, // Reasoning token count only
    offeredTools: false, // No tool definition capture
    modelParameters: false, // No model request parameters
    repositoryIdentity: false, // No canonical repository identity
    commitSha: false, // Not captured
    workstreamId: false, // Not captured by plugin
    lifecycleState: false, // Not captured
    images: true, // Image markers present (suppressed via LANGFUSE_MEDIA_UPLOAD_ENABLED)
    deliveryGuarantee: "best-effort", // forceFlush with timeout race
    turnNumbering: true,
    sessionSeparation: true,
    nestedAgents: true,
    compactionTracking: true,
    branchSummaries: true,
  };
}

/**
 * Reconciled capabilities accounting: plugin capabilities plus
 * API/server capabilities.
 */
export function reconciledCapabilities(apiCapabilities) {
  return {
    ...pluginCapabilities(),
    ...apiCapabilities,
  };
}

/**
 * Adapt raw Langfuse v2 observations from the 0.1.2 plugin into
 * normalized evidence. Applies normalization, tree context propagation,
 * deduplication, orphan detection, and totals computation.
 */
export function adaptObservations(rawObservations) {
  const normalized = rawObservations.map(normalizeObservation);
  const result = deduplicate(normalized);
  const propagated = propagateTreeContext(result.canonical);
  const orphans = computeOrphans(propagated);
  const unknownTypeCount = propagated.filter((x) => !x.knownType).length;
  const totals = computeTotals(propagated);
  const structuralCoverage = computeStructuralCoverage(
    rawObservations.length,
    propagated.length,
    result.conflicts,
    orphans,
    unknownTypeCount,
  );

  return {
    schemaVersion: NORMALIZED_EVIDENCE_SCHEMA_VERSION,
    adapter: {
      pluginName: PLUGIN_NAME,
      pluginVersion: PLUGIN_VERSION,
    },
    rawCount: rawObservations.length,
    canonical: propagated,
    normalizedCount: normalized.length,
    canonicalCount: propagated.length,
    duplicates: result.duplicates,
    conflicts: result.conflicts,
    orphans,
    unknownTypeCount,
    structuralCoverage,
    totals,
    delivery: {
      status: "observed-within-window",
      evidence: `${rawObservations.length} rows inside the bounded query window`,
    },
  };
}

/**
 * Fetch and adapt observations for a bounded time window.
 * Optionally filters by session ID.
 */
export async function fetchAndAdapt({
  baseUrl,
  fromStartTime,
  toStartTime,
  sessionId,
  authHeader,
  fetch: fetchImpl,
  fields,
  limit,
  onPage,
} = {}) {
  const result = await readBoundedWindow({
    baseUrl,
    fromStartTime,
    toStartTime,
    sessionId,
    authHeader,
    fetch: fetchImpl,
    fields,
    limit,
    onPage,
  });

  const adapted = adaptObservations(result.rows);

  return {
    ...adapted,
    queryMetadata: {
      pageCount: result.pageCount,
      totalSeen: result.totalSeen,
      cursorChainComplete: result.cursorChainComplete,
      pages: result.pages,
      fromStartTime,
      toStartTime,
      duplicates: result.duplicates,
      conflicts: result.conflicts,
    },
  };
}

/**
 * Build a delivery transition record for tracking delivery state
 * across multiple query windows.
 */
export function deliveryTransition(current, event, evidence) {
  const map = {
    observed: "observed-within-window",
    timeout: "timeout",
    late: "late-visible",
    deadline: "deadline-incomplete",
    unknown: "unknown",
  };
  return {
    status: map[event] || current.status,
    evidence: evidence || current.evidence,
  };
}

/**
 * Initial delivery state.
 */
export function initialDelivery() {
  return {
    status: "unknown",
    evidence: "no delivery observation recorded",
  };
}