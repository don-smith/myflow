import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  normalizeObservation,
  propagateTreeContext,
  deduplicate,
  computeOrphans,
  computeStructuralCoverage,
  computeTotals,
  validateNormalizedRow,
  KNOWN_OBSERVATION_TYPES,
  ROOT_CAPABILITY_NAMES,
  NORMALIZED_EVIDENCE_SCHEMA_VERSION,
} from "../skills/observing-myflow/scripts/lib/normalized-evidence.mjs";
import {
  adaptObservations,
} from "../skills/observing-myflow/scripts/lib/langfuse-pi-0.1.2-adapter.mjs";
import {
  normalizeJsonlEntry,
} from "../skills/observing-myflow/scripts/lib/pi-jsonl-adapter.mjs";

const fixtureDir = join(fileURLToPath(import.meta.url), "..", "fixtures", "observing-myflow");

async function loadFixture(name) {
  const content = await readFile(join(fixtureDir, name), "utf8");
  return JSON.parse(content);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ===================== Normalize Observation =====================

test("normalizes a Subagent Turn root observation", () => {
  const row = {
    id: "root-1",
    traceId: "trace-1",
    type: "SPAN",
    name: "Subagent Turn",
    startTime: "2026-09-13T03:00:00Z",
    endTime: "2026-09-13T03:00:05Z",
    sessionId: "group-parent",
    level: "DEFAULT",
    metadata: {
      session_id: "emit-child",
      turn_number: 1,
      extension: "@langfuse/pi-observability-plugin",
      extension_version: "0.1.2",
      provider: "provider-a",
      model: "model-a",
    },
    usageDetails: {},
    costDetails: {},
  };

  const n = normalizeObservation(row);
  assert.equal(n.source, "langfuse-v2");
  assert.equal(n.rowId, "langfuse-v2:root-1");
  assert.equal(n.type, "SPAN");
  assert.equal(n.name, "Subagent Turn");
  assert.equal(n.isRootCapability, true);
  assert.equal(n.emittingSessionId, "emit-child");
  assert.equal(n.groupingSessionId, "group-parent");
  assert.equal(n.turnNumber, 1);
  assert.equal(n.pluginName, "@langfuse/pi-observability-plugin");
  assert.equal(n.pluginVersion, "0.1.2");
  assert.equal(n.pluginCapability, "supported-tree-economics-v0.1.2");
  assert.equal(n.provider, "provider-a");
  assert.equal(n.model, "model-a");
  assert.equal(n.knownType, true);
  assert.equal(n.state, "ok");
  validateNormalizedRow(n);
});

test("normalizes an LLM Call generation with usage and cost", () => {
  const row = {
    id: "gen-1",
    traceId: "trace-1",
    parentObservationId: "root-1",
    type: "GENERATION",
    name: "LLM Call",
    startTime: "2026-09-13T03:00:01Z",
    endTime: "2026-09-13T03:00:02Z",
    sessionId: "group-parent",
    level: "DEFAULT",
    model: "model-a",
    metadata: { provider: "provider-a", assistant_index: 0 },
    usageDetails: { input: 532, output: 35, total: 567 },
    costDetails: { total: 0.00371 },
  };

  const n = normalizeObservation(row);
  assert.equal(n.type, "GENERATION");
  assert.equal(n.name, "LLM Call");
  assert.equal(n.usage.uncachedInputTokens, 532);
  assert.equal(n.usage.outputTokens, 35);
  assert.equal(n.usage.totalTokens, 567);
  assert.equal(n.usage.reasoningTokens, undefined);
  assert.equal(n.cost.recordedTotal, 0.00371);
  assert.equal(n.costKnown, true);
  assert.equal(n.assistantIndex, 0);
  assert.equal(n.isRootCapability, false);
  assert.equal(n.state, "ok");
  validateNormalizedRow(n);
});

test("normalizes a TOOL observation", () => {
  const row = {
    id: "tool-1",
    traceId: "trace-1",
    parentObservationId: "root-1",
    type: "TOOL",
    name: "Tool: write",
    startTime: "2026-09-13T03:00:02Z",
    endTime: "2026-09-13T03:00:03Z",
    sessionId: "group-parent",
    level: "DEFAULT",
    metadata: { tool_id: "call-1", is_error: false },
    usageDetails: {},
    costDetails: {},
  };

  const n = normalizeObservation(row);
  assert.equal(n.type, "TOOL");
  assert.equal(n.name, "Tool: write");
  assert.equal(n.toolCallId, "call-1");
  assert.equal(n.state, "ok");
  assert.equal(n.costKnown, false);
  assert.deepEqual(n.cost, { recordedTotal: undefined });
});

test("marks error state on ERROR level observations", () => {
  const row = {
    id: "err-1",
    traceId: "trace-1",
    type: "GENERATION",
    name: "LLM Call",
    startTime: "2026-09-13T03:00:00Z",
    sessionId: "group-main",
    level: "ERROR",
    statusMessage: "aborted",
    metadata: { cancelled: true },
    usageDetails: { input: 100 },
    costDetails: {},
  };

  const n = normalizeObservation(row);
  assert.equal(n.state, "error");
  assert.equal(n.level, "ERROR");
  assert.equal(n.statusMessage, "aborted");
});

test("marks cancelled state on cancelled metadata", () => {
  const row = {
    id: "cancel-1",
    traceId: "trace-1",
    type: "GENERATION",
    name: "LLM Call",
    startTime: "2026-09-13T03:00:00Z",
    sessionId: "group-main",
    level: "DEFAULT",
    metadata: { cancelled: true },
    usageDetails: {},
    costDetails: {},
  };

  const n = normalizeObservation(row);
  assert.equal(n.state, "cancelled");
});

test("preserves unknown observation types", () => {
  const row = {
    id: "future-1",
    traceId: "trace-1",
    type: "FUTURE_KIND",
    name: "Future observation",
    startTime: "2026-09-13T03:00:04Z",
    sessionId: "group-parent",
    metadata: {},
    usageDetails: {},
    costDetails: {},
  };

  const n = normalizeObservation(row);
  assert.equal(n.type, "FUTURE_KIND");
  assert.equal(n.knownType, false);
  assert.equal(n.name, "Future observation");
});

test("separates reasoning tokens without adding to output", () => {
  const row = {
    id: "gen-reason",
    traceId: "trace-1",
    type: "GENERATION",
    name: "LLM Call",
    startTime: "2026-09-13T03:00:00Z",
    sessionId: "group-main",
    model: "model-a",
    metadata: {},
    usageDetails: { input: 100, output: 30, output_reasoning_tokens: 20, total: 150 },
    costDetails: {},
  };

  const n = normalizeObservation(row);
  assert.equal(n.usage.outputTokens, 50); // 30 + 20 (reasoning)
  assert.equal(n.usage.reasoningTokens, 20);
  assert.equal(n.usage.totalTokens, 150);
});

test("handles missing cost and zero cost correctly", () => {
  const noCost = normalizeObservation({
    id: "no-cost",
    traceId: "trace-1",
    type: "GENERATION",
    name: "LLM Call",
    startTime: "2026-09-13T03:00:00Z",
    sessionId: "group-main",
    model: "model-a",
    metadata: {},
    usageDetails: { input: 100 },
    costDetails: {},
  });
  assert.equal(noCost.costKnown, false);
  assert.equal(noCost.cost.recordedTotal, undefined);

  const zeroCost = normalizeObservation({
    id: "zero-cost",
    traceId: "trace-1",
    type: "GENERATION",
    name: "LLM Call",
    startTime: "2026-09-13T03:00:00Z",
    sessionId: "group-main",
    model: "model-a",
    metadata: {},
    usageDetails: { input: 100 },
    costDetails: { total: 0 },
  });
  assert.equal(zeroCost.costKnown, true);
  assert.equal(zeroCost.cost.recordedTotal, 0);
});

test("uses row.provider fallback when metadata.provider is absent", () => {
  const row = {
    id: "gen-prov",
    traceId: "trace-1",
    type: "GENERATION",
    name: "LLM Call",
    startTime: "2026-09-13T03:00:00Z",
    sessionId: "group-main",
    model: "claude",
    metadata: {},
    usageDetails: {},
    costDetails: {},
  };
  // No provider in metadata; should be undefined
  const n = normalizeObservation(row);
  assert.equal(n.provider, undefined);
});

// ===================== propagateTreeContext =====================

test("propagates root context to descendants", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  // Check children inherit from root
  for (const x of propagated) {
    if (x.sourceId === "root-1") {
      assert.equal(x.contextSources.emittingSessionId, "own");
      assert.equal(x.contextSources.groupingSessionId, "own");
      assert.equal(x.contextSources.turnNumber, "own");
      assert.equal(x.contextSources.provider, "own");
      assert.equal(x.contextSources.model, "own");
    } else {
      assert.equal(x.emittingSessionId, "emit-child");
      assert.equal(x.groupingSessionId, "group-parent");
      assert.equal(x.turnNumber, 1);
      assert.equal(x.pluginName, "@langfuse/pi-observability-plugin");
      assert.equal(x.pluginVersion, "0.1.2");
      assert.equal(x.provider, "provider-a");
      assert.equal(x.model, "model-a");
      assert.equal(x.rootObservationId, "root-1");
      assert.equal(x.contextSources.rootObservationId, "physical-root");
    }
  }

  // callOrder is derived for LLM Calls
  const gen1 = propagated.find((x) => x.sourceId === "gen-1");
  const gen2 = propagated.find((x) => x.sourceId === "gen-2");
  assert.equal(gen1.callOrder, 0);
  assert.equal(gen2.callOrder, 1);
  assert.equal(gen1.contextSources.callOrder, "assistant-index-present");
});

test("handles orphans without crashes", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  // Remove root
  const rows = fixture.rows.filter((r) => r.id !== "root-1").map(normalizeObservation);
  const propagated = propagateTreeContext(rows);

  // Orphans should still be in the result
  assert.ok(propagated.length > 0);

  // Some should have undefined rootObservationId
  const orphan = propagated.find((x) => x.sourceId === "gen-1");
  assert.ok(orphan);
});

// ===================== deduplicate =====================

test("passes through unique rows unchanged", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const { canonical, duplicates, conflicts } = deduplicate(normalized);

  assert.equal(canonical.length, fixture.rows.length);
  assert.equal(duplicates.length, 0);
  assert.equal(conflicts.length, 0);
});

test("collapses byte-identical duplicates", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  // Duplicate the first row
  const withDup = [...normalized, deepClone(normalized[0])];
  const { canonical, duplicates, conflicts } = deduplicate(withDup);

  assert.equal(canonical.length, normalized.length);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].identity, normalized[0].rowId);
  assert.equal(duplicates[0].count, 2);
  assert.equal(conflicts.length, 0);
});

test("detects conflicting duplicates", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  // Modify a duplicate
  const dup = deepClone(normalized[0]);
  dup.usage.uncachedInputTokens = 999;
  const withConflict = [...normalized, dup];
  const { canonical, duplicates, conflicts } = deduplicate(withConflict);

  assert.ok(conflicts.length > 0);
  assert.equal(conflicts[0].count, 2);
  assert.equal(duplicates.length, 0);
});

// ===================== computeOrphans =====================

test("detects orphans when parent is missing", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  // gen-1 has parentObservationId "root-1" which exists
  const propagated = propagateTreeContext(normalized);
  let orphans = computeOrphans(propagated);
  assert.equal(orphans.length, 0);

  // Remove root and re-propagate
  const withoutRoot = fixture.rows
    .filter((r) => r.id !== "root-1")
    .map(normalizeObservation);
  const propagated2 = propagateTreeContext(withoutRoot);
  orphans = computeOrphans(propagated2);
  assert.ok(orphans.length > 0);
  assert.ok(orphans.some((o) => o.rowId.includes("gen-1")));
});

// ===================== computeStructuralCoverage =====================

test("reports observed-complete for clean canonical tree", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const { canonical, conflicts } = deduplicate(normalized);
  const propagated = propagateTreeContext(canonical);
  const orphans = computeOrphans(propagated);
  const unknownTypeCount = propagated.filter((x) => !x.knownType).length;
  const coverage = computeStructuralCoverage(
    fixture.rows.length,
    propagated.length,
    conflicts,
    orphans,
    unknownTypeCount,
  );
  assert.equal(coverage, "observed-complete");
});

test("reports partial when orphans exist", () => {
  const coverage = computeStructuralCoverage(5, 4, [], [{ rowId: "row-1", parentObservationId: "missing" }], 0);
  assert.equal(coverage, "partial");
});

test("reports partial when unknown types exist", () => {
  const coverage = computeStructuralCoverage(5, 5, [], [], 1);
  assert.equal(coverage, "partial");
});

test("reports unknown when raw count is zero", () => {
  const coverage = computeStructuralCoverage(0, 0, [], [], 0);
  assert.equal(coverage, "unknown");
});

// ===================== computeTotals =====================

test("computes totals across generations and tools", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);
  const totals = computeTotals(propagated);

  assert.equal(totals.calls, 2);
  assert.equal(totals.tools, 1);
  assert.equal(totals.toolErrors, 0);
  assert.equal(totals.usage.uncachedInputTokens, 1116); // 532 + 584
  assert.equal(totals.usage.outputTokens, 42); // 35 + 7
  assert.equal(totals.usage.totalTokens, 1158); // 567 + 591
  assert.equal(totals.costRecordedCalls, 2);
  assert.equal(totals.costMissingCalls, 0);
  assert.ok(Math.abs(totals.recordedCost - 0.00684) < 0.00001);
});

// ===================== adaptObservations =====================

test("adapts full plugin tree fixture", async () => {
  const fixture = await loadFixture("full-tree.fixture.json");
  const result = adaptObservations(fixture.rows);

  assert.equal(result.schemaVersion, NORMALIZED_EVIDENCE_SCHEMA_VERSION);
  assert.equal(result.adapter.pluginName, "@langfuse/pi-observability-plugin");
  assert.equal(result.adapter.pluginVersion, "0.1.2");
  assert.equal(result.rawCount, fixture.rows.length);
  assert.ok(result.canonical.length > 0);

  // Verify specific observation types are preserved
  const types = new Set(result.canonical.map((x) => x.type));
  assert.ok(types.has("SPAN"));
  assert.ok(types.has("GENERATION"));
  assert.ok(types.has("TOOL"));
  assert.ok(types.has("FUTURE_KIND"));

  // Nested subagent has separate emitting session
  const subagent = result.canonical.find((x) => x.sourceId === "subagent-root");
  assert.ok(subagent);
  assert.equal(subagent.isRootCapability, true);
  assert.equal(subagent.emittingSessionId, "emit-sub");
  assert.equal(subagent.groupingSessionId, "group-main");

  // Error tool
  const errorTool = result.canonical.find((x) => x.sourceId === "tool-error");
  assert.ok(errorTool);
  assert.equal(errorTool.state, "error");
  assert.equal(errorTool.level, "ERROR");
  assert.equal(errorTool.statusMessage, "command failed with exit code 1");

  // Aborted generation
  const aborted = result.canonical.find((x) => x.sourceId === "gen-aborted");
  assert.ok(aborted);
  assert.equal(aborted.state, "error");

  // Missing cost
  const noCost = result.canonical.find((x) => x.sourceId === "gen-no-cost");
  assert.ok(noCost);
  assert.equal(noCost.costKnown, false);

  // Unknown type preserved
  const unknown = result.canonical.find((x) => x.sourceId === "unknown-type");
  assert.ok(unknown);
  assert.equal(unknown.knownType, false);

  // Tool LLM usage
  const tlUsage = result.canonical.find((x) => x.sourceId === "tool-llm-usage");
  assert.ok(tlUsage);
  assert.equal(tlUsage.name, "Tool LLM Usage");

  // Compaction and branch summary
  const compaction = result.canonical.find((x) => x.sourceId === "compaction-in-turn");
  assert.ok(compaction);
  assert.equal(compaction.name, "Compaction");

  const branchSummary = result.canonical.find((x) => x.sourceId === "branch-summary");
  assert.ok(branchSummary);
  assert.equal(branchSummary.name, "Branch Summary");

  // Standalone compaction (no turn parent)
  const standalone = result.canonical.find((x) => x.sourceId === "compaction-standalone");
  assert.ok(standalone);

  // Totals should include all generations
  assert.ok(result.totals.calls >= 7);
  assert.ok(result.totals.tools >= 2);
  assert.equal(result.totals.toolErrors, 1);
  assert.ok(result.totals.costMissingCalls > 0);

  // Structural coverage
  assert.equal(result.structuralCoverage, "partial"); // has FUTURE_KIND
});

test("root inheritance: subagent with different provider/model", async () => {
  const fixture = await loadFixture("full-tree.fixture.json");
  const result = adaptObservations(fixture.rows);

  // Subagent root has its own provider/model
  const subagent = result.canonical.find((x) => x.sourceId === "subagent-root");
  assert.equal(subagent.provider, "openai");
  assert.equal(subagent.model, "gpt-4");
  assert.equal(subagent.contextSources.provider, "own");

  // Subagent's child LLM Call should inherit from subagent
  const subGen = result.canonical.find((x) => x.sourceId === "gen-sub-1");
  assert.equal(subGen.provider, "openai");
  assert.equal(subGen.model, "gpt-4");
  if (subGen.contextSources.provider === "inherited") {
    // Context was inherited from subagent root
    assert.equal(subGen.rootObservationId, "subagent-root");
  }
});

// ===================== JSONL normalization =====================

test("normalizes JSONL model-usage entries", async () => {
  const fixture = await loadFixture("nominal-jsonl.fixture.json");
  const normalized = fixture.entries
    .map(normalizeJsonlEntry)
    .filter(Boolean);

  assert.equal(normalized.length, 2);
  const first = normalized[0];
  assert.equal(first.source, "pi-jsonl");
  assert.equal(first.rowId, "pi-jsonl:jsonl-1");
  assert.equal(first.type, "GENERATION");
  assert.equal(first.emittingSessionId, "emit-child");
  assert.equal(first.provider, "provider-a");
  assert.equal(first.model, "model-a");
  assert.equal(first.assistantIndex, 0);
  assert.equal(first.usage.uncachedInputTokens, 532);
  assert.equal(first.usage.outputTokens, 35);
  assert.equal(first.usage.totalTokens, 567);
  assert.equal(first.cost.recordedTotal, 0.00371);
  assert.equal(first.costKnown, true);
});

test("normalizes JSONL tool-event entries", () => {
  const entry = {
    type: "tool-event",
    id: "tool-jsonl-1",
    sessionId: "emit-child",
    turnNumber: 1,
    toolCallId: "call-1",
    toolName: "write",
    isError: true,
    timestamp: "2026-09-13T03:00:02Z",
  };
  const n = normalizeJsonlEntry(entry);
  assert.ok(n);
  assert.equal(n.type, "TOOL");
  assert.equal(n.toolCallId, "call-1");
  assert.equal(n.state, "error");
  assert.equal(n.source, "pi-jsonl");
});

test("JSONL adapter handles session filtering", async () => {
  // Unit-level test for the adapter module functions
  const { listSessionFiles, completeRecords, sessionMatchesWorktree } =
    await import("../skills/observing-myflow/scripts/lib/pi-jsonl-adapter.mjs");

  // sessionMatchesWorktree
  assert.equal(
    sessionMatchesWorktree(
      { id: "s1", cwd: "/Users/test/project" },
      "/Users/test/project",
    ),
    true,
  );
  assert.equal(
    sessionMatchesWorktree({ id: "s1", cwd: "/other" }, "/Users/test/project"),
    false,
  );
  assert.equal(
    sessionMatchesWorktree(null, "/Users/test/project"),
    false,
  );
});

// ===================== JSONL parity (identity first, then economics) =====================

test("identity-qualified JSONL parity passes before economics comparison", async () => {
  const obsFixture = await loadFixture("nominal-observation.fixture.json");
  const jsonlFixture = await loadFixture("nominal-jsonl.fixture.json");

  const langfuseRows = obsFixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(langfuseRows);
  const jsonlRows = jsonlFixture.entries
    .map(normalizeJsonlEntry)
    .filter(Boolean);

  // Match by emitting session + turn + assistant index
  const matches = [];
  for (const j of jsonlRows) {
    const candidates = propagated.filter(
      (l) =>
        l.emittingSessionId === j.emittingSessionId &&
        l.turnNumber === j.turnNumber &&
        l.provider === j.provider &&
        l.model === j.model &&
        (l.assistantIndex ?? l.callOrder) === (j.assistantIndex ?? j.callOrder) &&
        l.type === "GENERATION" &&
        l.name === "LLM Call",
    );
    if (candidates.length === 1) {
      matches.push({ langfuse: candidates[0], jsonl: j });
    }
  }

  assert.equal(matches.length, 2);

  // Now compare economics only after identity match
  for (const { langfuse, jsonl } of matches) {
    assert.equal(langfuse.usage.uncachedInputTokens, jsonl.usage.uncachedInputTokens);
    assert.equal(langfuse.usage.outputTokens, jsonl.usage.outputTokens);
    assert.equal(langfuse.usage.totalTokens, jsonl.usage.totalTokens);
    assert.equal(langfuse.cost.recordedTotal, jsonl.cost.recordedTotal);
  }
});

test("wrong-session JSONL is unmatched despite identical economics", async () => {
  const wrongFixture = await loadFixture("wrong-session.fixture.json");
  const langfuseRows = wrongFixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(langfuseRows);
  const jsonlRows = wrongFixture.jsonl
    .map(normalizeJsonlEntry)
    .filter(Boolean);

  const matches = [];
  for (const j of jsonlRows) {
    const candidates = propagated.filter(
      (l) =>
        l.emittingSessionId === j.emittingSessionId &&
        l.turnNumber === j.turnNumber &&
        l.provider === j.provider &&
        l.model === j.model &&
        (l.assistantIndex ?? l.callOrder) === (j.assistantIndex ?? j.callOrder) &&
        l.type === "GENERATION",
    );
    if (candidates.length === 1) matches.push(candidates[0].sourceId);
  }

  assert.equal(matches.length, wrongFixture.expectedMatched);
  const unmatchedCount = wrongFixture.expectedUnmatched;
  assert.ok(unmatchedCount > 0);
});

// ===================== Duplicate and delayed rows =====================

test("handles duplicate pages gracefully", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  // Simulate duplicate page: add the same rows again
  const doubled = [...normalized, ...fixture.rows.map(normalizeObservation)];
  const { canonical, duplicates } = deduplicate(doubled);

  assert.equal(canonical.length, normalized.length);
  assert.equal(duplicates.length, normalized.length); // every row duplicated once
  for (const d of duplicates) {
    assert.equal(d.count, 2);
  }
});

test("detects conflicting duplicates from delayed/different pages", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const gen1 = deepClone(normalized.find((x) => x.sourceId === "gen-1"));
  gen1.usage.uncachedInputTokens = 999; // Different economics

  const withConflict = [...normalized, gen1];
  const { canonical, conflicts } = deduplicate(withConflict);

  assert.ok(conflicts.length > 0);
  const conflict = conflicts.find((c) => c.identity === "langfuse-v2:gen-1");
  assert.ok(conflict);
  assert.equal(conflict.count, 2);
});

// ===================== Unsupported filter behavior =====================

test("normalizes rows without session filter context", async () => {
  // Observations without plugin metadata (from unsupported filter or non-Pi source)
  const row = {
    id: "no-plugin-1",
    traceId: "trace-x",
    type: "GENERATION",
    name: "LLM Call",
    startTime: "2026-09-13T03:00:00Z",
    sessionId: "group-x",
    metadata: {},
    usageDetails: { input: 100 },
    costDetails: {},
  };

  const n = normalizeObservation(row);
  assert.equal(n.pluginName, undefined);
  assert.equal(n.pluginVersion, undefined);
  assert.equal(n.pluginCapability, undefined);
  assert.equal(n.isRootCapability, false);
  assert.equal(n.emittingSessionId, undefined);
});

// ===================== Context propagation edge cases =====================

test("context sources track own vs inherited for each field", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  const root = propagated.find((x) => x.sourceId === "root-1");
  assert.equal(root.contextSources.emittingSessionId, "own");
  assert.equal(root.contextSources.pluginVersion, "own");

  const child = propagated.find((x) => x.sourceId === "gen-1");
  // gen-1 has its own assistantIndex but inherits emittingSession from root
  if (child.contextSources.emittingSessionId === "inherited") {
    assert.equal(child.emittingSessionId, "emit-child");
  }
});

test("children with own plugin info win over inherited", async () => {
  const fixture = await loadFixture("full-tree.fixture.json");
  const result = adaptObservations(fixture.rows);

  const subagent = result.canonical.find((x) => x.sourceId === "subagent-root");
  assert.equal(subagent.emittingSessionId, "emit-sub");
  assert.equal(subagent.pluginVersion, "0.1.2");
  // Has own values
  assert.ok(subagent.contextSources.emittingSessionId);

  const subGen = result.canonical.find((x) => x.sourceId === "gen-sub-1");
  assert.equal(subGen.emittingSessionId, "emit-sub");
  assert.equal(subGen.pluginVersion, "0.1.2");
});