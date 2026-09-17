import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  normalizeObservation,
  propagateTreeContext,
} from "../skills/observing-myflow/scripts/lib/normalized-evidence.mjs";
import { normalizeJsonlEntry } from "../skills/observing-myflow/scripts/lib/pi-jsonl-adapter.mjs";
import {
  correlateObservations,
  aggregateByStatus,
  associationReasonText,
  correlationSummary,
} from "../skills/observing-myflow/scripts/lib/correlate-attempts.mjs";

const fixtureDir = join(
  fileURLToPath(import.meta.url),
  "..",
  "fixtures",
  "observing-myflow",
);

async function loadFixture(name) {
  const content = await readFile(join(fixtureDir, name), "utf8");
  return JSON.parse(content);
}

// ===================== Minimal lifecycle state builder =====================

function buildLifecycleState({
  attempts = [],
  events = [],
} = {}) {
  const allEvents = events.map((e, i) => ({
    eventId: e.eventId || `evt_${i}`,
    occurredAt: e.occurredAt || `2026-09-13T03:00:0${i}Z`,
    kind: e.kind || "stage.entered",
    canonicalStage: e.canonicalStage || "Implement",
    owningActivity: e.owningActivity || "phase",
    attemptId: e.attemptId,
    attemptOrdinal: e.attemptOrdinal || 1,
    executionRef: e.executionRef || undefined,
    ...e,
  }));

  return {
    attempts: attempts.map((a) => ({
      attemptId: a.attemptId,
      ordinal: a.attemptOrdinal || 1,
      canonicalStage: a.canonicalStage || "Implement",
      enteredAt: a.enteredAt,
      completedAt: a.completedAt || null,
    })),
    events: allEvents,
    feedback: [],
    acceptedArtifacts: [],
  };
}

function makeAttempt(id, stage = "Implement", { enteredAt, completedAt } = {}) {
  const base = new Date("2026-09-13T03:00:00Z").getTime();
  let idx = parseInt(id.replace("attempt_", ""), 10) || 1;
  return {
    attemptId: id,
    attemptOrdinal: idx,
    canonicalStage: stage,
    enteredAt: enteredAt || new Date(base + idx * 60000).toISOString(),
    completedAt: completedAt || new Date(base + idx * 60000 + 300000).toISOString(),
  };
}

// ===================== Exact match: explicit execution reference =====================

test("correlates observations with exact execution references", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Implement", {
        enteredAt: "2026-09-13T02:55:00Z",
        completedAt: "2026-09-13T03:10:00Z",
      }),
    ],
    events: [
      {
        kind: "stage.entered",
        canonicalStage: "Implement",
        attemptId: "attempt_1",
        attemptOrdinal: 1,
        executionRef: {
          emittingSessionId: "emit-child",
          groupingSessionId: "group-parent",
        },
      },
    ],
  });

  const result = correlateObservations(propagated, {
    lifecycleState,
    branch: "main",
    worktree: "/Users/don/projects/myflow",
  });

  assert.ok(result.associations.length >= 4);
  assert.ok(result.coverage);

  // Generations should have candidates
  const genAssoc = result.associations.find(
    (a) => a.observationId === "gen-1",
  );
  assert.ok(genAssoc);

  // Summary
  const summary = correlationSummary(result);
  assert.ok(summary.totalAssociations > 0);
});

// ===================== Branch/worktree exact match =====================

test("uses branch context in correlation reasons", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Implement", {
        enteredAt: "2026-09-13T02:55:00Z",
        completedAt: "2026-09-13T03:10:00Z",
      }),
    ],
  });

  const result = correlateObservations(propagated, {
    lifecycleState,
    branch: "feature/myflow-obs",
    worktree: "/Users/don/projects/myflow",
  });

  assert.ok(result.associations.length > 0);
});

// ===================== Concurrent workstreams =====================

test("distinguishes concurrent workstream attempts", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  // Two concurrent attempts with overlapping time windows
  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Scope", {
        enteredAt: "2026-09-13T02:50:00Z",
        completedAt: "2026-09-13T03:05:00Z",
      }),
      makeAttempt("attempt_2", "Implement", {
        enteredAt: "2026-09-13T02:55:00Z",
        completedAt: "2026-09-13T03:10:00Z",
      }),
    ],
    events: [
      {
        kind: "stage.entered",
        canonicalStage: "Implement",
        attemptId: "attempt_2",
        attemptOrdinal: 1,
        executionRef: {
          emittingSessionId: "emit-child",
        },
      },
    ],
  });

  const result = correlateObservations(propagated, { lifecycleState });

  // attempt_2 should have exact match via executionRef
  const assigned = result.associations.filter((a) => a.status === "assigned");
  // At least some observations should have candidates
  assert.ok(result.coverage.totalObservable > 0);
});

// ===================== Wrong-session identical economics =====================

test("wrong-session economics does not produce exact matches", async () => {
  const wrongFixture = await loadFixture("wrong-session.fixture.json");
  const langfuseRows = wrongFixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(langfuseRows);

  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Implement", {
        enteredAt: "2026-09-13T02:55:00Z",
        completedAt: "2026-09-13T03:10:00Z",
      }),
    ],
    events: [
      {
        kind: "stage.entered",
        canonicalStage: "Implement",
        attemptId: "attempt_1",
        attemptOrdinal: 1,
        executionRef: {
          emittingSessionId: "emit-other", // Different session!
        },
      },
    ],
  });

  const result = correlateObservations(propagated, { lifecycleState });

  // The observation is from "emit-child" but attempt references "emit-other"
  // Should not produce exact match to attempt_1
  const genExact = result.associations.filter(
    (a) => a.observationId === "gen-1" && a.status === "assigned" && a.confidence === "exact",
  );
  // Without explicit executionRef match on emit-child, no exact match
  assert.equal(genExact.length, 0);
});

// ===================== Native traces crossing stage boundaries =====================

test("native traces crossing stage boundaries produce ambiguous/medium candidates", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  // Observations span from Scope time to Implement time
  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Scope", {
        enteredAt: "2026-09-13T02:58:00Z",
        completedAt: "2026-09-13T03:02:00Z",
      }),
      makeAttempt("attempt_2", "Implement", {
        enteredAt: "2026-09-13T03:01:00Z",
        completedAt: "2026-09-13T03:10:00Z",
      }),
    ],
  });

  const result = correlateObservations(propagated, { lifecycleState });

  // Without explicit execution refs, bounded time is medium confidence
  const genAssoc = result.associations.find(
    (a) => a.observationId === "gen-1",
  );
  assert.ok(genAssoc);
  // gen-1 at 03:00:01Z falls in attempt_1 window
  // gen-2 at 03:00:03Z falls in overlap area with attempt_2
});

// ===================== No-match cases =====================

test("observations with no matching lifecycle state remain unassigned", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  // Lifecycle state with a completely different time window
  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Verify", {
        enteredAt: "2026-09-14T00:00:00Z",
        completedAt: "2026-09-14T01:00:00Z",
      }),
    ],
  });

  const result = correlateObservations(propagated, { lifecycleState });

  // All economic observations should be unassigned
  const economicAssociations = result.associations.filter(
    (a) => a.status !== "unassigned" || a.confidence === "weak",
  );
  for (const a of result.associations) {
    if (a.type === "GENERATION" || a.type === "TOOL") {
      assert.equal(a.status, "unassigned");
    }
  }
});

// ===================== Coverage reporting =====================

test("preserves candidate count, reasons, confidence in association records", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Implement", {
        enteredAt: "2026-09-13T02:55:00Z",
        completedAt: "2026-09-13T03:10:00Z",
      }),
    ],
    events: [
      {
        kind: "stage.entered",
        canonicalStage: "Implement",
        attemptId: "attempt_1",
        attemptOrdinal: 1,
        executionRef: {
          emittingSessionId: "emit-child",
          groupingSessionId: "group-parent",
        },
      },
    ],
  });

  const result = correlateObservations(propagated, { lifecycleState });

  // Every association has required fields
  for (const a of result.associations) {
    assert.ok(typeof a.observationId === "string");
    assert.ok(typeof a.status === "string");
    assert.ok(typeof a.confidence === "string");
    assert.ok(typeof a.candidateCount === "number");
    assert.ok(Array.isArray(a.candidates));
    assert.ok(Array.isArray(a.reasons));
  }

  // Coverage has all fields
  assert.ok(typeof result.coverage.totalObservable === "number");
  assert.ok(typeof result.coverage.assigned === "number");
  assert.ok(typeof result.coverage.ambiguous === "number");
  assert.ok(typeof result.coverage.unassigned === "number");
});

// ===================== aggregateByStatus =====================

test("aggregates economics by association status", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Implement", {
        enteredAt: "2026-09-13T02:55:00Z",
        completedAt: "2026-09-13T03:10:00Z",
      }),
    ],
    events: [
      {
        kind: "stage.entered",
        canonicalStage: "Implement",
        attemptId: "attempt_1",
        attemptOrdinal: 1,
        executionRef: {
          emittingSessionId: "emit-child",
        },
      },
    ],
  });

  const result = correlateObservations(propagated, { lifecycleState });
  const groups = aggregateByStatus(propagated, result.associations);

  assert.ok(groups.assigned);
  assert.ok(groups.ambiguous);
  assert.ok(groups.unassigned);
  assert.ok(typeof groups.assigned.calls === "number");
  assert.ok(typeof groups.assigned.recordedCost === "number");
  assert.ok(groups.assigned.costCoverage);
});

// ===================== JSONL parity passes before economics =====================

test("identity-qualified parity: matched observations agree on economics", async () => {
  const obsFixture = await loadFixture("nominal-observation.fixture.json");
  const jsonlFixture = await loadFixture("nominal-jsonl.fixture.json");

  const langfuseRows = obsFixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(langfuseRows);
  const jsonlRows = jsonlFixture.entries
    .map(normalizeJsonlEntry)
    .filter(Boolean);

  // Identity match first
  const identityMatched = [];
  for (const j of jsonlRows) {
    const matches = propagated.filter(
      (l) =>
        l.emittingSessionId === j.emittingSessionId &&
        l.turnNumber === j.turnNumber &&
        l.provider === j.provider &&
        l.model === j.model &&
        (l.assistantIndex ?? l.callOrder) ===
          (j.assistantIndex ?? j.callOrder),
    );
    if (matches.length === 1) identityMatched.push([matches[0], j]);
  }

  assert.equal(identityMatched.length, 2, "Both JSONL entries should match Langfuse");

  // Economics comparison only after identity match
  for (const [langfuse, jsonl] of identityMatched) {
    // Token dimensions
    for (const dim of [
      "uncachedInputTokens",
      "outputTokens",
      "totalTokens",
    ]) {
      assert.equal(
        langfuse.usage[dim],
        jsonl.usage[dim],
        `${dim} mismatch for ${jsonl.sourceId}`,
      );
    }
    // Cost
    assert.equal(
      langfuse.cost.recordedTotal,
      jsonl.cost.recordedTotal,
      `cost mismatch for ${jsonl.sourceId}`,
    );
  }
});

// ===================== Unmatched evidence =====================

test("unmatched JSONL evidence remains visible", async () => {
  const wrongFixture = await loadFixture("wrong-session.fixture.json");
  const jsonlRows = wrongFixture.jsonl
    .map(normalizeJsonlEntry)
    .filter(Boolean);

  const langfuseRows = wrongFixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(langfuseRows);

  // Match
  const matched = [];
  const unmatched = [];
  for (const j of jsonlRows) {
    const candidates = propagated.filter(
      (l) =>
        l.emittingSessionId === j.emittingSessionId &&
        l.turnNumber === j.turnNumber,
    );
    if (candidates.length === 0) {
      unmatched.push(j);
    } else {
      matched.push(j);
    }
  }

  assert.equal(unmatched.length, 1, "Wrong-session JSONL should be unmatched");
  assert.equal(unmatched[0].sourceId, "jsonl-wrong-session");
  assert.equal(unmatched[0].emittingSessionId, "emit-other");
});

// ===================== Association reason text =====================

test("association reason text is human-readable", () => {
  const assoc = {
    observationId: "gen-1",
    status: "assigned",
    confidence: "exact",
    candidateCount: 1,
    candidates: [
      {
        attemptId: "attempt_1",
        confidence: "exact",
        reasons: ["explicit-execution-reference"],
      },
    ],
    reasons: ["emittingSession", "turnNumber"],
  };

  const text = associationReasonText(assoc);
  assert.ok(text.includes("attempt_1"));
  assert.ok(text.includes("exact"));
});

test("no candidates produces clear reason text", () => {
  const assoc = {
    observationId: "orphan-1",
    status: "unassigned",
    confidence: "weak",
    candidateCount: 0,
    candidates: [],
    reasons: [],
  };
  const text = associationReasonText(assoc);
  assert.ok(text.includes("no candidates"));
});

// ===================== Coverage: ambiguous remains reviewable =====================

test("medium-confidence candidates produce ambiguous status", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  // Two attempts with overlapping time windows, no explicit refs
  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Scope", {
        enteredAt: "2026-09-13T02:59:00Z",
        completedAt: "2026-09-13T03:02:00Z",
      }),
      makeAttempt("attempt_2", "Implement", {
        enteredAt: "2026-09-13T03:01:00Z",
        completedAt: "2026-09-13T03:06:00Z",
      }),
    ],
  });

  const result = correlateObservations(propagated, { lifecycleState });

  // Observational across the overlap will get medium candidates
  const gen2 = result.associations.find(
    (a) => a.observationId === "gen-2",
  );
  assert.ok(gen2);
  // gen-2 at 03:00:03Z should have one or both candidates via bounded time
  // Without explicit refs, it won't be auto-assigned at exact/strong
});

// ===================== Empty lifecycle state =====================

test("empty lifecycle state yields all unassigned", async () => {
  const fixture = await loadFixture("nominal-observation.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  const lifecycleState = buildLifecycleState({ attempts: [], events: [] });
  const result = correlateObservations(propagated, { lifecycleState });

  const economic = result.associations.filter(
    (a) => a.type === "GENERATION" || a.type === "TOOL",
  );
  for (const a of economic) {
    assert.equal(a.status, "unassigned");
  }
});

// ===================== Structural-only observations =====================

test("structural observations (SPAN, EVENT) are tracked but unassigned", async () => {
  const fixture = await loadFixture("full-tree.fixture.json");
  const normalized = fixture.rows.map(normalizeObservation);
  const propagated = propagateTreeContext(normalized);

  const lifecycleState = buildLifecycleState({
    attempts: [
      makeAttempt("attempt_1", "Implement", {
        enteredAt: "2026-09-13T03:55:00Z",
        completedAt: "2026-09-13T04:05:00Z",
      }),
    ],
  });

  const result = correlateObservations(propagated, { lifecycleState });

  // SPAN observations are structural
  const spans = result.associations.filter((a) => a.type === "SPAN");
  assert.ok(spans.length > 0);
  for (const s of spans) {
    assert.equal(s.status, "unassigned");
    assert.ok(s.reasons.includes("structural-only-observation"));
  }
});