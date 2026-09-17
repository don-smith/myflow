import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { validateStageReview } from "../skills/observing-myflow/scripts/lib/stage-review-contract.mjs";
import {
  projectTrace,
  buildStableTraceId,
  buildStableObservationId,
  buildStableScoreId,
  validatePayloadAllowlist,
  SCORE_NAMES,
  SYNTHETIC_TRACE_ROOT_NAME,
  EVALUATOR_OBSERVATION_TYPE,
  compatibilityReceipt,
  projectReturnDiagnosticScores,
} from "../skills/observing-myflow/scripts/lib/review-projection.mjs";
import {
  createOutboxEntry,
  updateOutboxSent,
  updateOutboxConfirmed,
  updateOutboxConflict,
  updateOutboxRetry,
  isNoOpReplay,
  findExistingOutboxEntry,
  findConfirmedOutboxEntry,
  OUTBOX_STATUSES,
} from "../skills/observing-myflow/scripts/lib/publication-outbox.mjs";

const execFileAsync = promisify(execFile);
const publishCli = new URL("../skills/observing-myflow/scripts/publish-stage-review.mjs", import.meta.url);

function makeReview(overrides = {}) {
  const base = {
    schemaVersion: "myflow-stage-review/v1",
    reviewId: "rev_test_001",
    createdAt: "2026-09-16T00:00:00.000Z",
    repository: { kind: "origin", value: "github.com/test/project" },
    workstreamId: "test-workstream",
    attemptId: "attempt_scope_1",
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    revision: 1,
    inputs: {
      lifecycleEventCount: 5,
      lifecycleLastEventId: "evt_abc",
      lifecycleDigest: "abcdef1234567890",
      artifactDigests: [{ path: ".myflow/workstreams/test/scope/scope.md", digest: "abcdef" }],
      feedbackStatus: "recorded",
      feedbackRef: "stage-feedback/events.jsonl#feedback_001",
    },
    evaluator: {
      evaluatorVersion: "0.1.0",
      ruleSetVersion: "0.1.0",
    },
    predicates: [
      { id: "scope.outcome-defined", result: "pass", evidence: ["Outcome section found"] },
      { id: "scope.beneficiaries-defined", result: "pass", evidence: ["Beneficiaries section found"] },
      { id: "scope.acceptance-criteria", result: "pass", evidence: ["AC section found"] },
      { id: "scope.developer-acceptance", result: "pass", evidence: ["Developer accepted"] },
    ],
    outcome: "satisfied",
    feedbackCoverage: "recorded",
    returnAssessment: null,
    limitations: ["Mechanical section checks only."],
    ...overrides,
  };
  return base;
}

function makeReturnReview(overrides = {}) {
  return makeReview({
    reviewId: "rev_return_001",
    canonicalStage: "Verify",
    outcome: "unsatisfied",
    returnAssessment: {
      episodeId: "ep-1",
      triggerSource: "verification-evidence",
      changeKind: "implementation",
      nature: "delivery-defect",
      lateDiscovery: "false",
      confidence: "high",
      initialOwningStage: "Implement",
      missingEvidence: [],
      counterevidence: [],
    },
    ...overrides,
  });
}

// --- Trace and observation identity ---

test("buildStableTraceId is deterministic per repository+workstream+attempt", () => {
  const id1 = buildStableTraceId(
    { kind: "origin", value: "github.com/a/b" }, "ws-1", "attempt-1",
  );
  const id2 = buildStableTraceId(
    { kind: "origin", value: "github.com/a/b" }, "ws-1", "attempt-1",
  );
  const id3 = buildStableTraceId(
    { kind: "origin", value: "github.com/a/b" }, "ws-1", "attempt-2",
  );

  assert.equal(id1, id2, "same inputs produce same trace ID");
  assert.notEqual(id1, id3, "different attempt produces different trace ID");
  assert.equal(typeof id1, "string");
  assert.equal(id1.length, 32);
});

test("buildStableObservationId is deterministic and version-sensitive", () => {
  const traceId = buildStableTraceId(
    { kind: "origin", value: "github.com/a/b" }, "ws-1", "a1",
  );
  const obs1 = buildStableObservationId(traceId, "0.1.0", "digest-abc", 1);
  const obs2 = buildStableObservationId(traceId, "0.1.0", "digest-abc", 1);
  const obs3 = buildStableObservationId(traceId, "0.1.0", "digest-abc", 2);
  const obs4 = buildStableObservationId(traceId, "0.1.1", "digest-abc", 1);

  assert.equal(obs1, obs2, "same inputs produce same observation ID");
  assert.notEqual(obs1, obs3, "different revision produces different ID");
  assert.notEqual(obs1, obs4, "different evaluator version produces different ID");
});

test("buildStableScoreId is deterministic per observation+score name", () => {
  const obsId = "obs_abcdef1234567890";
  const id1 = buildStableScoreId(obsId, SCORE_NAMES.STAGE_OUTCOME);
  const id2 = buildStableScoreId(obsId, SCORE_NAMES.STAGE_OUTCOME);
  const id3 = buildStableScoreId(obsId, SCORE_NAMES.STAGE_RETURNED);

  assert.equal(id1, id2, "same inputs produce same score ID");
  assert.notEqual(id1, id3, "different score name produces different ID");
});

// --- Projection validation ---

test("projectTrace produces valid trace+observation+scores for satisfied Scope", () => {
  const review = makeReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_scope_1", review);

  assert.equal(proj.trace.traceName, SYNTHETIC_TRACE_ROOT_NAME);
  assert.equal(proj.observation.observationType, EVALUATOR_OBSERVATION_TYPE);
  assert.equal(proj.observation.observationName, "myflow-stage-review-scope-r1");
  assert.equal(proj.observation.traceId, proj.traceId);
  assert.equal(proj.observationId.length, 32);
  assert.ok(proj.scores.length >= 2, "at minimum: outcome + returned");

  const outcomeScore = proj.scores.find((s) => s.scoreName === SCORE_NAMES.STAGE_OUTCOME);
  assert.ok(outcomeScore);
  assert.equal(outcomeScore.scoreValue, "satisfied");
  assert.equal(outcomeScore.scoreDataType, "CATEGORICAL");

  const returnedScore = proj.scores.find((s) => s.scoreName === SCORE_NAMES.STAGE_RETURNED);
  assert.ok(returnedScore);
  assert.equal(returnedScore.scoreValue, false);
  assert.equal(returnedScore.scoreDataType, "BOOLEAN");

  assert.ok(proj.scoreIds.length >= 2);
  assert.ok(proj.scoreIds.every((id) => typeof id === "string" && id.length === 32));
});

test("projectTrace includes return scores when returnAssessment present", () => {
  const review = makeReturnReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_verify_1", review);

  const natureScore = proj.scores.find((s) => s.scoreName === SCORE_NAMES.RETURN_NATURE);
  assert.ok(natureScore);
  assert.equal(natureScore.scoreValue, "delivery-defect");

  const lateDiscoveryScore = proj.scores.find((s) => s.scoreName === SCORE_NAMES.RETURN_LATE_DISCOVERY);
  assert.ok(lateDiscoveryScore);
  assert.equal(lateDiscoveryScore.scoreValue, "false");

  const ownerStageScore = proj.scores.find((s) => s.scoreName === SCORE_NAMES.RETURN_OWNER_STAGE);
  assert.ok(ownerStageScore);
  assert.equal(ownerStageScore.scoreValue, "Implement");

  const returnedScore = proj.scores.find((s) => s.scoreName === SCORE_NAMES.STAGE_RETURNED);
  assert.equal(returnedScore.scoreValue, true);
});

test("projectTrace returns different observation IDs for different revisions", () => {
  const review1 = makeReview({ revision: 1 });
  const review2 = makeReview({ revision: 2, reviewId: "rev_test_002" });
  const repo = { kind: "origin", value: "github.com/test/project" };

  const proj1 = projectTrace(repo, "test-workstream", "attempt_scope_1", review1);
  const proj2 = projectTrace(repo, "test-workstream", "attempt_scope_1", review2);

  assert.equal(proj1.traceId, proj2.traceId, "same trace for same attempt");
  assert.notEqual(proj1.observationId, proj2.observationId, "different revision = different observation");
});

test("projectTrace returns different trace IDs for different attempts", () => {
  const review = makeReview();
  const repo = { kind: "origin", value: "github.com/test/project" };

  const proj1 = projectTrace(repo, "test-workstream", "attempt_scope_1", review);
  const proj2 = projectTrace(repo, "test-workstream", "attempt_scope_2", review);

  assert.notEqual(proj1.traceId, proj2.traceId, "different attempt = different trace");
});

// --- Payload allowlist validation ---

test("validatePayloadAllowlist rejects forbidden fields and content", () => {
  const clean = { observationId: "abc", observationType: "EVALUATOR", traceId: "def", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T00:00:00Z", metadata: {} };
  validatePayloadAllowlist(clean, "test");

  assert.throws(() => validatePayloadAllowlist({ ...clean, prompt: "some prompt text here" }, "test"), /unlisted field/);
  assert.throws(() => validatePayloadAllowlist({ ...clean, metadata: { "/etc/passwd": "value" } }, "test"), /forbidden content/);
});

test("validatePayloadAllowlist rejects oversized payloads", () => {
  const base = { observationId: "abc", observationType: "EVALUATOR", traceId: "def", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T00:00:00Z", metadata: { data: "x".repeat(70_000) } };
  assert.throws(() => validatePayloadAllowlist(base, "test"), /exceeds/);
});

// --- Outbox ---

test("createOutboxEntry produces entry in pending state", () => {
  const entry = createOutboxEntry({
    repository: "github.com/test/project",
    workstreamId: "test-ws",
    attemptId: "attempt_scope_1",
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    revision: 1,
    traceId: "trace_abc123",
    observationId: "obs_def456",
    projectionDigest: "sha256digest",
    scoreIds: ["score_a", "score_b"],
    idempotencyKey: "key-1",
  });

  assert.equal(entry.status, "pending");
  assert.equal(entry.retryCount, 0);
  assert.ok(entry.entryId.startsWith("out_"));
  assert.equal(entry.schemaVersion, "myflow-publication-outbox/v1");
});

test("outbox state transitions", () => {
  const entry = createOutboxEntry({
    repository: "r",
    workstreamId: "w",
    attemptId: "a",
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    revision: 1,
    traceId: "t",
    observationId: "o",
    projectionDigest: "d",
    scoreIds: ["s"],
    idempotencyKey: "k",
  });

  assert.equal(entry.status, "pending");

  const sent = updateOutboxSent(entry);
  assert.equal(sent.status, "sent-unconfirmed");
  assert.ok(sent.sentAt);

  const confirmed = updateOutboxConfirmed(sent);
  assert.equal(confirmed.status, "confirmed");
  assert.ok(confirmed.confirmedAt);

  const conflicted = updateOutboxConflict(confirmed, "duplicate observation ID");
  assert.equal(conflicted.status, "conflicted");
  assert.equal(conflicted.conflictEvidence, "duplicate observation ID");

  const retried = updateOutboxRetry(entry, "network error");
  assert.equal(retried.status, "pending");
  assert.equal(retried.retryCount, 1);
  assert.equal(retried.lastError, "network error");
});

test("isNoOpReplay detects confirmed entries with matching digests", () => {
  const entry = {
    status: "confirmed",
    projectionDigest: "abc123",
    attemptId: "a",
    revision: 1,
  };

  assert.equal(isNoOpReplay(entry, "abc123"), true);
  assert.equal(isNoOpReplay(entry, "different_digest"), false);

  const pending = { ...entry, status: "pending" };
  assert.equal(isNoOpReplay(pending, "abc123"), false);
});

test("findExistingOutboxEntry locates entries by attempt+revision", () => {
  const records = [
    { attemptId: "a", revision: 1, status: "confirmed", projectionDigest: "d1" },
    { attemptId: "a", revision: 2, status: "sent-unconfirmed", projectionDigest: "d2" },
    { attemptId: "b", revision: 1, status: "pending", projectionDigest: "d3" },
  ];

  assert.ok(findExistingOutboxEntry(records, "a", 1));
  assert.equal(findExistingOutboxEntry(records, "a", 1).projectionDigest, "d1");
  assert.equal(findExistingOutboxEntry(records, "a", 3), undefined);
  assert.equal(findExistingOutboxEntry(records, "c", 1), undefined);
});

test("findConfirmedOutboxEntry returns latest confirmed for attempt", () => {
  const records = [
    { attemptId: "a", revision: 1, status: "confirmed", projectionDigest: "d1" },
    { attemptId: "a", revision: 2, status: "sent-unconfirmed", projectionDigest: "d2" },
  ];

  const confirmed = findConfirmedOutboxEntry(records, "a");
  assert.ok(confirmed);
  assert.equal(confirmed.revision, 1);
  assert.equal(confirmed.status, "confirmed");

  const none = findConfirmedOutboxEntry(records, "b");
  assert.equal(none, undefined);
});

// --- Compatibility receipt ---

test("compatibilityReceipt inventories existing scores and confirms no conflict", () => {
  const packageScores = {
    friction: {
      "myflow.friction.tool_error_spike": true,
      "myflow.friction.high_tool_churn": true,
    },
    work: {
      "myflow.work.type": true,
      "myflow.work.synopsis": true,
    },
    flow: {
      "myflow.flow.wall-clock-minutes": true,
    },
  };

  const receipt = compatibilityReceipt({ packageTelemetryScores: packageScores });
  assert.equal(receipt.assertions.noNameConflict, true);
  assert.equal(receipt.assertions.noSilentReuse, true);
  assert.deepEqual(receipt.recordedScoreNames.existing.friction, ["myflow.friction.tool_error_spike", "myflow.friction.high_tool_churn"]);
});

test("existing score names not overwritten", () => {
  const newNames = Object.values(SCORE_NAMES);
  const existingNames = [
    "myflow.friction.tool_error_spike",
    "myflow.friction.high_tool_churn",
    "myflow.friction.expensive_subagent",
    "myflow.friction.high_cost_artifact_ratio",
    "myflow.friction.long_session",
    "myflow.friction.missing_checkpoints",
    "myflow.friction-free",
    "myflow.work.type",
    "myflow.work.synopsis",
    "myflow.flow.wall-clock-minutes",
    "myflow.flow.turn-count",
    "myflow.flow.context-switch",
    "myflow.flow.tool-success-rate",
  ];

  for (const newName of newNames) {
    assert.ok(
      !existingNames.includes(newName),
      `new score name ${newName} must not conflict with existing`,
    );
  }

  for (const existingName of existingNames) {
    assert.ok(
      !newNames.includes(existingName),
      `existing score name ${existingName} must not be silently reused`,
    );
  }
});

// --- Return diagnostic score projection ---

test("projectReturnDiagnosticScores produces numeric diagnostic scores", () => {
  const scores = projectReturnDiagnosticScores("obs-1", "trace-1", {
    returnLoopMs: 300_000,
    calls: 12,
    totalTokens: 5000,
    recordedCostUsd: 0.15,
    costCoverage: 0.8,
  });

  assert.equal(scores.length, 5);

  const loopScore = scores.find((s) => s.scoreName === SCORE_NAMES.RETURN_LOOP_MINUTES);
  assert.ok(loopScore);
  assert.equal(loopScore.scoreValue, 5); // 300000 / 60000
  assert.equal(loopScore.scoreDataType, "NUMERIC");

  const callsScore = scores.find((s) => s.scoreName === SCORE_NAMES.RETURN_CALLS);
  assert.equal(callsScore.scoreValue, 12);

  const tokensScore = scores.find((s) => s.scoreName === SCORE_NAMES.RETURN_TOTAL_TOKENS);
  assert.equal(tokensScore.scoreValue, 5000);

  const costScore = scores.find((s) => s.scoreName === SCORE_NAMES.RETURN_RECORDED_COST_USD);
  assert.equal(costScore.scoreValue, 0.15);

  const covScore = scores.find((s) => s.scoreName === SCORE_NAMES.RETURN_COST_COVERAGE);
  assert.equal(covScore.scoreValue, 0.8);
});

test("projectReturnDiagnosticScores omits null/undefined diagnostics", () => {
  const scores = projectReturnDiagnosticScores("obs-1", "trace-1", {
    returnLoopMs: null,
    calls: 5,
    totalTokens: undefined,
  });

  assert.equal(scores.length, 1);
  assert.equal(scores[0].scoreName, SCORE_NAMES.RETURN_CALLS);
});

// --- Dry run CLI ---

test("dry run CLI prints receipt with credentials unavailable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myflow-pub-dryrun-"));
  try {
    const review = makeReview();
    const reviewPath = join(dir, "review.json");
    await writeFile(reviewPath, JSON.stringify(review));

    const { stdout, stderr } = await execFileAsync("node", [
      publishCli.pathname,
      "--review-path", reviewPath,
      "--workstream-id", "test-workstream",
      "--repository-root", dir,
    ], {
      env: { ...process.env, LANGFUSE_PUBLIC_KEY: "", LANGFUSE_SECRET_KEY: "" },
    });

    const receipt = JSON.parse(stdout);
    assert.equal(receipt.mode, "dry-run");
    assert.equal(receipt.credentialsAvailable, false);
    assert.equal(receipt.validation.allowlistPassed, true);
    assert.ok(receipt.projectionDigest);
    assert.ok(receipt.traceId);
    assert.ok(receipt.observationId);
    assert.ok(receipt.scoreCount >= 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- dryRunPublish with explicit publish=false ---

test("dryRunPublish validates allowlist and returns projection metadata", async () => {
  const review = makeReview();
  const { dryRunPublish } = await import("../skills/observing-myflow/scripts/lib/langfuse-review-publisher.mjs");
  const { receipt } = await dryRunPublish(review, {
    workstreamId: "test-workstream",
    repositoryRoot: process.cwd(),
  });

  assert.equal(receipt.mode, "dry-run");
  assert.ok(receipt.projectionDigest);
  assert.ok(receipt.scoreIds.length >= 2);
  assert.ok(receipt.payloadSizes.totalBytes > 0);
});

// --- Missing credentials rejection ---

test("publish with --publish and no credentials throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myflow-pub-nocreds-"));
  try {
    const review = makeReview();
    const reviewPath = join(dir, "review.json");
    await writeFile(reviewPath, JSON.stringify(review));

    let stderr = "";
    try {
      await execFileAsync("node", [
        publishCli.pathname,
        "--review-path", reviewPath,
        "--workstream-id", "test-workstream",
        "--repository-root", dir,
        "--publish",
      ], {
        env: { ...process.env, LANGFUSE_PUBLIC_KEY: "", LANGFUSE_SECRET_KEY: "" },
      });
    } catch (error) {
      stderr = error.stderr || error.message || "";
    }
    assert.match(stderr, /LANGFUSE_PUBLIC_KEY/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Score compatibility CLI ---

test("score-compatibility flag prints inventory receipt", async () => {
  const { stdout } = await execFileAsync("node", [
    publishCli.pathname,
    "--score-compatibility",
  ]);

  const receipt = JSON.parse(stdout);
  assert.equal(receipt.schemaVersion, "myflow-score-compatibility-receipt/v1");
  assert.ok(receipt.assertions.noNameConflict);
  assert.deepEqual(receipt.recordedScoreNames.existing.friction, [
    "myflow.friction.tool_error_spike",
    "myflow.friction.high_tool_churn",
    "myflow.friction.expensive_subagent",
    "myflow.friction.high_cost_artifact_ratio",
    "myflow.friction.long_session",
    "myflow.friction.missing_checkpoints",
    "myflow.friction-free",
  ]);
});

// --- Property: synthetic payload scan ---

test("synthetic payloads exclude prompts, responses, reasoning, tool arguments, code, commands", () => {
  const review = makeReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_scope_1", review);

  const allPayloads = [
    JSON.stringify(proj.trace),
    JSON.stringify(proj.observation),
    ...proj.scores.map((s) => JSON.stringify(s)),
  ];

  const forbiddenForms = [
    /"prompt":/i,
    /"response":/i,
    /"reasoning":/i,
    /"toolArguments":/,
    /"toolResult":/,
    /"sourceCode":/,
    /"command":/i,
    /"absolutePath":/,
    /"credential":/i,
    /"secret":/i,
    /"password":/i,
  ];

  for (const payload of allPayloads) {
    for (const pattern of forbiddenForms) {
      assert.ok(
        !pattern.test(payload),
        `payload contains forbidden field matching ${pattern}`,
      );
    }
  }
});

test("synthetic payloads exclude absolute paths", () => {
  const review = makeReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_scope_1", review);

  const allPayloads = [
    JSON.stringify(proj.trace),
    JSON.stringify(proj.observation),
    ...proj.scores.map((s) => JSON.stringify(s)),
  ];

  for (const payload of allPayloads) {
    assert.ok(!payload.includes("/Users/"), "excludes /Users/ paths");
    assert.ok(!payload.includes("/home/"), "excludes /home/ paths");
    assert.ok(!payload.includes("~/.myflow"), "excludes ~/.myflow paths");
  }
});

test("synthetic payloads exclude free-text feedback and individual identity", () => {
  const review = makeReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_scope_1", review);

  const allPayloads = [
    JSON.stringify(proj.trace),
    JSON.stringify(proj.observation),
    ...proj.scores.map((s) => JSON.stringify(s)),
  ];

  for (const payload of allPayloads) {
    assert.ok(!payload.includes("feedbackRef"), "excludes feedback reference");
    assert.ok(!payload.includes("privateRef"), "excludes private references");
    assert.ok(!payload.includes("freeText"), "excludes free text markers");
    assert.ok(!payload.includes("developerComment"), "excludes developer comments");
  }
});

// --- Duplicate and conflict detection ---

test("storeOutboxEntry with duplicate confirmed entry completes silently", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myflow-pub-dup-"));
  try {
    await execFileAsync("git", ["init", "-q", dir]);

    const { storeOutboxEntry } = await import("../skills/observing-myflow/scripts/lib/publication-outbox.mjs");

    const entry = createOutboxEntry({
      repository: "test",
      workstreamId: "test-ws",
      attemptId: "a",
      attemptOrdinal: 1,
      canonicalStage: "Scope",
      revision: 1,
      traceId: "t",
      observationId: "o",
      projectionDigest: "d",
      scoreIds: ["s"],
      idempotencyKey: "k",
    });

    const stateRoot = join(dir, "state");
    const result1 = await storeOutboxEntry({
      repositoryRoot: dir,
      stateRoot,
      workstreamId: "test-ws",
      entry: { ...entry },
    });
    assert.equal(result1.duplicate, false);

    const result2 = await storeOutboxEntry({
      repositoryRoot: dir,
      stateRoot,
      workstreamId: "test-ws",
      entry: { ...entry },
    });
    assert.equal(result2.duplicate, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Revision handling ---

test("same attempt with different revision creates distinct outbox entries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myflow-pub-revision-"));
  try {
    await execFileAsync("git", ["init", "-q", dir]);

    const { storeOutboxEntry } = await import("../skills/observing-myflow/scripts/lib/publication-outbox.mjs");

    const stateRoot = join(dir, "state");
    const e1 = createOutboxEntry({
      repository: "test",
      workstreamId: "test-ws",
      attemptId: "a",
      attemptOrdinal: 1,
      canonicalStage: "Scope",
      revision: 1,
      traceId: "t1",
      observationId: "o1",
      projectionDigest: "d1",
      scoreIds: ["s1"],
      idempotencyKey: "k1",
    });

    const e2 = createOutboxEntry({
      repository: "test",
      workstreamId: "test-ws",
      attemptId: "a",
      attemptOrdinal: 1,
      canonicalStage: "Scope",
      revision: 2,
      traceId: "t1",
      observationId: "o2",
      projectionDigest: "d2",
      scoreIds: ["s2"],
      idempotencyKey: "k2",
    });

    const r1 = await storeOutboxEntry({ repositoryRoot: dir, stateRoot, workstreamId: "test-ws", entry: e1 });
    const r2 = await storeOutboxEntry({ repositoryRoot: dir, stateRoot, workstreamId: "test-ws", entry: e2 });

    assert.equal(r1.duplicate, false);
    assert.equal(r2.duplicate, false);
    assert.notEqual(r1.record.entryId, r2.record.entryId);

    const text = await readFile(r1.path, "utf8");
    const records = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(records.length, 2);
    assert.equal(records[0].revision, 1);
    assert.equal(records[1].revision, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Retry behavior ---

test("outbox entry records retry count and lastError", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myflow-pub-retry-"));
  try {
    await execFileAsync("git", ["init", "-q", dir]);

    const { storeOutboxEntry } = await import("../skills/observing-myflow/scripts/lib/publication-outbox.mjs");

    const stateRoot = join(dir, "state");
    let entry = createOutboxEntry({
      repository: "test",
      workstreamId: "test-ws",
      attemptId: "a",
      attemptOrdinal: 1,
      canonicalStage: "Scope",
      revision: 1,
      traceId: "t",
      observationId: "o",
      projectionDigest: "d",
      scoreIds: ["s"],
      idempotencyKey: "k",
    });

    entry = updateOutboxRetry(entry, "network timeout");
    assert.equal(entry.status, "pending");
    assert.equal(entry.retryCount, 1);
    assert.equal(entry.lastError, "network timeout");

    entry = updateOutboxRetry(entry, new Error("429 Too Many Requests"));
    assert.equal(entry.retryCount, 2);
    assert.equal(entry.lastError, "429 Too Many Requests");

    const result = await storeOutboxEntry({
      repositoryRoot: dir,
      stateRoot,
      workstreamId: "test-ws",
      entry,
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.record.retryCount, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Conflict detection ---

test("outbox conflict records evidence", () => {
  const entry = createOutboxEntry({
    repository: "r", workstreamId: "w", attemptId: "a", attemptOrdinal: 1,
    canonicalStage: "Scope", revision: 1, traceId: "t", observationId: "o",
    projectionDigest: "d", scoreIds: ["s"], idempotencyKey: "k",
  });

  const conflicted = updateOutboxConflict(entry, {
    type: "duplicate-observation",
    existingId: "existing-obs-id",
    message: "Observation ID already exists with different metadata",
  });

  assert.equal(conflicted.status, "conflicted");
  assert.ok(conflicted.conflictedAt);
  assert.deepEqual(conflicted.conflictEvidence, {
    type: "duplicate-observation",
    existingId: "existing-obs-id",
    message: "Observation ID already exists with different metadata",
  });
});

// --- Delayed confirmation ---

test("outbox entry transitions to confirmed with timestamp", () => {
  const entry = createOutboxEntry({
    repository: "r", workstreamId: "w", attemptId: "a", attemptOrdinal: 1,
    canonicalStage: "Scope", revision: 1, traceId: "t", observationId: "o",
    projectionDigest: "d", scoreIds: ["s"], idempotencyKey: "k",
  });

  const sent = updateOutboxSent(entry, "2026-01-01T00:00:00Z");
  const confirmed = updateOutboxConfirmed(sent, "2026-01-01T00:00:05Z");

  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.confirmedAt, "2026-01-01T00:00:05Z");
});

// --- No-op replay ---

test("noOpReplay returns true only when status confirmed and digest matches", () => {
  const entry = {
    entryId: "out_abc",
    attemptId: "a",
    revision: 1,
    status: "confirmed",
    projectionDigest: "digest_match",
  };

  assert.equal(isNoOpReplay(entry, "digest_match"), true);
  assert.equal(isNoOpReplay(entry, "digest_different"), false);

  entry.status = "sent-unconfirmed";
  assert.equal(isNoOpReplay(entry, "digest_match"), false);

  entry.status = "pending";
  assert.equal(isNoOpReplay(entry, "digest_match"), false);

  entry.status = "conflicted";
  assert.equal(isNoOpReplay(entry, "digest_match"), false);
});

// --- Forbidden field rejection in projection ---

test("projection rejects forbidden fields in scores payload", () => {
  const review = makeReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_scope_1", review);

  const badScore = {
    scoreId: "abc",
    scoreName: "test",
    scoreValue: "value",
    scoreDataType: "CATEGORICAL",
    scoreObservationId: proj.observationId,
    scoreTraceId: proj.traceId,
    prompt: "this should not be here", // Forbidden field
  };

  assert.throws(
    () => validatePayloadAllowlist(badScore, "bad-score"),
    /unlisted field/,
  );
});

test("payload with path-shaped content is rejected", () => {
  const payload = {
    observationId: "abc", observationType: "EVALUATOR", traceId: "def",
    startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T00:00:00Z",
    metadata: { path: "/Users/test/secret/file.txt" },
  };

  assert.throws(
    () => validatePayloadAllowlist(payload, "path-test"),
    /forbidden content/,
  );
});

test("payload with credential-like content is rejected", () => {
  const payload = {
    observationId: "abc", observationType: "EVALUATOR", traceId: "def",
    startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T00:00:00Z",
    metadata: { config: 'secret="sk-abc123secretkey"' },
  };

  assert.throws(
    () => validatePayloadAllowlist(payload, "cred-test"),
    /forbidden content/,
  );
});

// --- Score data types match plan contract ---

test("score data types match plan definitions", () => {
  const typeMap = {
    [SCORE_NAMES.DEVELOPER_STAGE_EXPERIENCE]: "CATEGORICAL",
    [SCORE_NAMES.STAGE_OUTCOME]: "CATEGORICAL",
    [SCORE_NAMES.STAGE_RETURNED]: "BOOLEAN",
    [SCORE_NAMES.RETURN_NATURE]: "CATEGORICAL",
    [SCORE_NAMES.RETURN_LATE_DISCOVERY]: "CATEGORICAL",
    [SCORE_NAMES.RETURN_OWNER_STAGE]: "CATEGORICAL",
    [SCORE_NAMES.RETURN_LOOP_MINUTES]: "NUMERIC",
    [SCORE_NAMES.RETURN_CALLS]: "NUMERIC",
    [SCORE_NAMES.RETURN_TOTAL_TOKENS]: "NUMERIC",
    [SCORE_NAMES.RETURN_RECORDED_COST_USD]: "NUMERIC",
    [SCORE_NAMES.RETURN_COST_COVERAGE]: "NUMERIC",
  };

  const review = makeReturnReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_verify_1", review);

  const diagScores = projectReturnDiagnosticScores(proj.observationId, proj.traceId, {
    returnLoopMs: 300_000,
    calls: 5,
    totalTokens: 1000,
    recordedCostUsd: 0.05,
    costCoverage: 0.5,
  });

  const allScores = [...proj.scores, ...diagScores];

  for (const score of allScores) {
    if (typeMap[score.scoreName]) {
      assert.equal(
        score.scoreDataType,
        typeMap[score.scoreName],
        `${score.scoreName} should be ${typeMap[score.scoreName]}`,
      );
    }
  }
});

// --- SYNTHETIC_TRACE_ROOT_NAME invariant ---

test("synthetic trace name is stable", () => {
  assert.equal(SYNTHETIC_TRACE_ROOT_NAME, "myflow-stage-review");
});

// --- DEV_EXPERIENCE_VALUES completeness ---

test("developer stage experience score values are categorical", () => {
  const review = makeReview();
  const repo = { kind: "origin", value: "github.com/test/project" };

  // With feedback "recorded" but no explicit rating, the experience score
  // should appear as the outcome field from public projection.
  const proj = projectTrace(repo, "test-workstream", "attempt_scope_1", review);
  const expScore = proj.scores.find((s) => s.scoreName === SCORE_NAMES.DEVELOPER_STAGE_EXPERIENCE);
  // The developer experience score is only added when feedback is "recorded"
  // and the outcome maps to a valid DEV_EXPERIENCE_VALUES.
  // Since outcome is "satisfied" (not a dev experience value), it won't be in DEV_EXPERIENCE_VALUES
  assert.equal(expScore, undefined, "developer experience only published for valid experience values");
});

// --- Integration: full pipeline smoke test ---

test("full pipeline: dry run, outbox entry creation, state transitions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myflow-pub-full-"));
  try {
    await execFileAsync("git", ["init", "-q", dir]);

    const review = makeReturnReview();
    const reviewPath = join(dir, "review.json");
    await writeFile(reviewPath, JSON.stringify(review));

    // Dry run.
    const { stdout } = await execFileAsync("node", [
      publishCli.pathname,
      "--review-path", reviewPath,
      "--workstream-id", "test-workstream",
      "--repository-root", dir,
      "--state-root", join(dir, "state"),
    ], {
      env: { ...process.env, LANGFUSE_PUBLIC_KEY: "", LANGFUSE_SECRET_KEY: "" },
    });
    const receipt = JSON.parse(stdout);
    assert.equal(receipt.mode, "dry-run");
    assert.equal(receipt.scoreCount >= 4, true);

    // Create and store an outbox entry manually.
    const { storeOutboxEntry, createOutboxEntry, updateOutboxSent, updateOutboxConfirmed } =
      await import("../skills/observing-myflow/scripts/lib/publication-outbox.mjs");

    const entry = createOutboxEntry({
      repository: "github.com/test/project",
      workstreamId: "test-workstream",
      attemptId: review.attemptId,
      attemptOrdinal: review.attemptOrdinal,
      canonicalStage: review.canonicalStage,
      revision: review.revision,
      traceId: receipt.traceId,
      observationId: receipt.observationId,
      projectionDigest: receipt.projectionDigest,
      scoreIds: receipt.scoreIds,
      idempotencyKey: "smoke-test",
    });

    const stored = await storeOutboxEntry({
      repositoryRoot: dir,
      stateRoot: join(dir, "state"),
      workstreamId: "test-workstream",
      entry,
    });
    assert.equal(stored.duplicate, false);
    assert.equal(stored.record.status, "pending");

    // Transition to sent.
    let updated = updateOutboxSent(stored.record);
    assert.equal(updated.status, "sent-unconfirmed");

    updated.recordId = updated.entryId;
    const sentStored = await storeOutboxEntry({
      repositoryRoot: dir,
      stateRoot: join(dir, "state"),
      workstreamId: "test-workstream",
      entry: updated,
    });
    assert.equal(sentStored.duplicate, false);

    // Transition to confirmed.
    updated = updateOutboxConfirmed(sentStored.record);
    updated.recordId = updated.entryId;
    const confirmedStored = await storeOutboxEntry({
      repositoryRoot: dir,
      stateRoot: join(dir, "state"),
      workstreamId: "test-workstream",
      entry: updated,
    });
    assert.equal(confirmedStored.record.status, "confirmed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Safety: validated review only ---

test("projectTrace validates the review before projecting", () => {
  const repo = { kind: "origin", value: "github.com/test/project" };
  assert.throws(
    () => projectTrace(repo, "w", "a", null),
    /must be an object/,
  );
  assert.throws(
    () => projectTrace(repo, "w", "a", { not: "valid" }),
    /schemaVersion/,
  );
});

// --- deterministic score IDs are unique ---

test("each score for the same observation has a unique deterministic ID", () => {
  const review = makeReturnReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_verify_1", review);

  const ids = new Set(proj.scoreIds);
  assert.equal(ids.size, proj.scoreIds.length, "all score IDs must be unique");
});

// --- contextual: workstreamId in metadata ---

test("trace metadata contains workstream and attempt context", () => {
  const review = makeReview();
  const repo = { kind: "origin", value: "github.com/test/project" };
  const proj = projectTrace(repo, "test-workstream", "attempt_scope_1", review);

  assert.equal(proj.trace.metadata.workstreamId, "test-workstream");
  assert.equal(proj.trace.metadata.attemptId, "attempt_scope_1");
  assert.equal(proj.trace.metadata.canonicalStage, "Scope");
  assert.equal(proj.trace.metadata.revision, 1);
});