import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  STAGE_REVIEW_SCHEMA_VERSION,
  EVALUATOR_VERSION,
  RULE_SET_VERSION,
  deriveOutcome,
  publicProjection,
  reviewId,
  validateStageReview,
  validateCounterfactual,
} from "../skills/observing-myflow/scripts/lib/stage-review-contract.mjs";
import { PREDICATE_SETS } from "../skills/observing-myflow/scripts/lib/stage-predicates.mjs";
import {
  buildReturnAssessment,
  validateReturnAssessmentInput,
} from "../skills/observing-myflow/scripts/lib/return-assessment.mjs";
import {
  appendLifecycleEvent,
} from "../../skills/myflow/scripts/lib/lifecycle-store.mjs";
import { reduceLifecycle } from "../../skills/myflow/scripts/lib/lifecycle-reducer.mjs";
import { resolveRepositoryContext } from "../../skills/myflow/scripts/lib/repository-context.mjs";
import { recordStageFeedback } from "../../skills/myflow/scripts/record-stage-feedback.mjs";

const execFileAsync = promisify(execFile);
const evaluateCli = new URL("../skills/observing-myflow/scripts/evaluate-stage.mjs", import.meta.url);
const repository = resolveRepositoryContext(process.cwd()).identity;

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "myflow-stage-eval-"));
  const workstreamId = "eval-fixture";
  const workstreamDir = join(dir, ".myflow", "workstreams", workstreamId);
  const journalPath = join(workstreamDir, "lifecycle", "events.jsonl");
  await mkdir(workstreamDir, { recursive: true });
  await writeFile(join(workstreamDir, "workstream.md"), "---\nworkstream: eval-fixture\ncurrent_stage: Scope\nstatus: active\n---\n");
  await execFileAsync("git", ["init", "-q", dir]);
  await execFileAsync("git", ["-C", dir, "config", "user.email", "test@test"]);
  await execFileAsync("git", ["-C", dir, "config", "user.name", "test"]);
  let sequence = 0;

  const append = (kind, values = {}) => {
    sequence += 1;
    return appendLifecycleEvent({
      journalPath,
      repositoryRoot: dir,
      repository,
      workstreamId,
      kind,
      source: "test",
      idempotencyKey: values.idempotencyKey ?? `eval-event-${sequence}`,
      occurredAt: values.occurredAt ?? new Date(Date.UTC(2026, 0, 1, 0, sequence)).toISOString(),
      ...values,
    });
  };

  return { dir, workstreamId, workstreamDir, journalPath, append, repository };
}

async function createAndEnterScope(fix) {
  await fix.append("workstream.created", {
    canonicalStage: "Scope",
    owningActivity: "scope",
  });
  await fix.append("stage.entered", {
    canonicalStage: "Scope",
    owningActivity: "scope",
  });
}

async function advance(fix, fromStage, fromActivity, toStage, toActivity) {
  await fix.append("stage.completed", {
    canonicalStage: fromStage,
    owningActivity: fromActivity,
    terminalReason: "advanced",
  });
  await fix.append("stage.entered", {
    canonicalStage: toStage,
    owningActivity: toActivity,
  });
}

async function reachStage(fix, stage) {
  if (stage === "Scope") {
    await createAndEnterScope(fix);
    return;
  }
  await createAndEnterScope(fix);
  const stages = ["Scope", "Plan", "Implement", "Verify", "Close"];
  const idx = stages.indexOf(stage);
  const fromActivity = ["scope", "planning", "phase", "verification", "closeout"];
  const toActivity = ["scope", "planning", "phase", "verification", "closeout"];
  for (let i = 0; i < idx; i++) {
    const from = stages[i];
    const to = stages[i + 1];
    await advance(fix, from, fromActivity[i], to, toActivity[i + 1]);
  }
}

async function acceptArtifact(fix, stage, filename, content) {
  const dir = join(fix.workstreamDir, stage.toLowerCase());
  await mkdir(dir, { recursive: true });
  const artifactPath = `.myflow/workstreams/${fix.workstreamId}/${stage.toLowerCase()}/${filename}`;
  const fullPath = join(fix.dir, artifactPath);
  await writeFile(fullPath, content);
  return fix.append("artifact.accepted", {
    canonicalStage: stage,
    owningActivity: stage === "Plan" ? "planning" : stage === "Implement" ? "phase" : stage === "Verify" ? "verification" : stage === "Close" ? "closeout" : "scope",
    artifactPath,
  });
}

async function recordFeedback(fix, attemptId, rating, stateRoot) {
  return recordStageFeedback({
    repositoryRoot: fix.dir,
    stateRoot: stateRoot ?? join(fix.dir, "private-state"),
    workstreamId: fix.workstreamId,
    attemptId,
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    status: "recorded",
    rating: rating ?? "smooth",
    hostCapability: "structured",
    source: "scope",
    idempotencyKey: `feedback-${attemptId}`,
  });
}

// --- Contract validation ---

test("validateStageReview rejects missing required fields", () => {
  assert.throws(() => validateStageReview(null), /must be an object/);
  assert.throws(() => validateStageReview({}), /schemaVersion/);
  assert.throws(
    () =>
      validateStageReview({
        schemaVersion: "wrong",
        reviewId: "r1",
        createdAt: "2026-01-01T00:00:00.000Z",
        repository: { kind: "origin", value: "github.com/test/repo" },
        workstreamId: "ws",
        attemptId: "a1",
        attemptOrdinal: 1,
        canonicalStage: "Scope",
        revision: 1,
        inputs: {
          lifecycleEventCount: 3,
          lifecycleLastEventId: null,
          lifecycleDigest: "abc",
          artifactDigests: [],
          feedbackStatus: "missing",
          feedbackRef: null,
        },
        evaluator: { evaluatorVersion: "1.0", ruleSetVersion: "1.0" },
        predicates: [{ id: "test", result: "pass", evidence: [] }],
        outcome: "satisfied",
        feedbackCoverage: "recorded",
        returnAssessment: null,
        limitations: [],
      }),
    /schemaVersion must be/,
  );
});

test("validateStageReview rejects invalid outcomes and predicate results", () => {
  const base = {
    schemaVersion: STAGE_REVIEW_SCHEMA_VERSION,
    reviewId: "rev_test",
    createdAt: "2026-01-01T00:00:00.000Z",
    repository: { kind: "origin", value: "github.com/test/repo" },
    workstreamId: "ws",
    attemptId: "a1",
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    revision: 1,
    inputs: {
      lifecycleEventCount: 3,
      lifecycleLastEventId: null,
      lifecycleDigest: "abc",
      artifactDigests: [],
      feedbackStatus: "missing",
      feedbackRef: null,
    },
    evaluator: { evaluatorVersion: "1.0", ruleSetVersion: "1.0" },
    predicates: [{ id: "test", result: "pass", evidence: [] }],
    outcome: "satisfied",
    feedbackCoverage: "recorded",
    returnAssessment: null,
    limitations: [],
  };

  assert.throws(() => validateStageReview({ ...base, outcome: "great" }), /outcome must be one of/);
  assert.throws(
    () => validateStageReview({ ...base, predicates: [{ id: "test", result: "maybe", evidence: [] }] }),
    /result must be one of/,
  );
  assert.throws(
    () => validateStageReview({ ...base, feedbackCoverage: "unknown" }),
    /feedbackCoverage must be one of/,
  );
  assert.throws(
    () => validateStageReview({ ...base, revision: 0 }),
    /revision must be a positive integer/,
  );
  assert.throws(
    () => validateStageReview({ ...base, canonicalStage: "Design" }),
    /canonicalStage must be a canonical stage/,
  );

  // Valid review passes.
  validateStageReview(base);
});

test("validateStageReview validates returnAssessment when present", () => {
  const base = {
    schemaVersion: STAGE_REVIEW_SCHEMA_VERSION,
    reviewId: "rev_test",
    createdAt: "2026-01-01T00:00:00.000Z",
    repository: { kind: "origin", value: "github.com/test/repo" },
    workstreamId: "ws",
    attemptId: "a1",
    attemptOrdinal: 1,
    canonicalStage: "Verify",
    revision: 1,
    inputs: {
      lifecycleEventCount: 3,
      lifecycleLastEventId: null,
      lifecycleDigest: "abc",
      artifactDigests: [],
      feedbackStatus: "missing",
      feedbackRef: null,
    },
    evaluator: { evaluatorVersion: "1.0", ruleSetVersion: "1.0" },
    predicates: [{ id: "test", result: "pass", evidence: [] }],
    outcome: "satisfied",
    feedbackCoverage: "recorded",
    returnAssessment: null,
    limitations: [],
  };

  // Valid returnAssessment.
  const withReturn = {
    ...base,
    returnAssessment: {
      episodeId: "ep1",
      triggerSource: "verification-evidence",
      changeKind: "implementation",
      nature: "delivery-defect",
      lateDiscovery: "false",
      confidence: "high",
      missingEvidence: [],
      counterevidence: [],
    },
  };
  validateStageReview(withReturn);

  // Missing episodeId.
  assert.throws(
    () =>
      validateStageReview({
        ...base,
        returnAssessment: { triggerSource: "x", changeKind: "y", nature: "z", lateDiscovery: "false", confidence: "high", missingEvidence: [], counterevidence: [] },
      }),
    /episodeId/,
  );
});

test("validateCounterfactual requires all fields for lateDiscovery=true", () => {
  const base = {
    episodeId: "ep1",
    triggerSource: "verification-evidence",
    changeKind: "implementation",
    nature: "delivery-defect",
    lateDiscovery: "true",
    confidence: "high",
    missingEvidence: [],
    counterevidence: [],
    earliestDetectingStage: "Plan",
    earlierCheck: "review acceptance criteria against design",
    requiredInformation: "acceptance criteria and design document",
    informationExisted: "both documents existed at Plan stage",
    expectedSignal: "missing acceptance criterion would be visible",
    costClass: "lower",
    falsePositiveRisk: "low - criteria are objective",
    qualityGuardrail: "verified by second reviewer",
  };
  validateCounterfactual(base);

  for (const field of [
    "earliestDetectingStage",
    "earlierCheck",
    "requiredInformation",
    "informationExisted",
    "expectedSignal",
    "costClass",
    "falsePositiveRisk",
    "qualityGuardrail",
  ]) {
    assert.throws(
      () => validateCounterfactual({ ...base, [field]: undefined }),
      new RegExp(field),
    );
  }

  assert.throws(
    () => validateCounterfactual({ ...base, costClass: "free" }),
    /costClass must be one of/,
  );
  assert.throws(
    () => validateCounterfactual({ ...base, earliestDetectingStage: "Design" }),
    /must be a canonical stage/,
  );
});

// --- Predicate tests per stage ---

test("Scope predicates detect complete and incomplete artifacts", async () => {
  const fix = await fixture();
  await reachStage(fix, "Scope");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);

  // Without artifact: all structure predicates are unknown, acceptance may fail.
  const noArtifact = await PREDICATE_SETS.Scope({
    lifecycleState: state,
    artifacts: [],
    feedback: null,
    repositoryRoot: fix.dir,
  });
  for (const p of noArtifact) {
    if (p.id === "scope.developer-acceptance") {
      assert.equal(p.result, "fail", `expected fail for ${p.id} without feedback`);
    } else {
      assert.equal(p.result, "unknown", `expected unknown for ${p.id}, got ${p.result}`);
    }
  }

  // With artifact containing all required sections.
  const fullScope = `---
kind: myflow-scope
workstream: eval-fixture
stage: Scope
status: ready
---

## Outcome

The outcome is clear.

## Beneficiaries

Developers.

## Non-goals

Not doing X.

## Acceptance criteria

- AC1: Must pass.
- AC2: Must work.

## Risk

Low risk.

## Depth

Lightweight.

## Open questions

None.

## Next action

Proceed to Plan.
`;
  await acceptArtifact(fix, "Scope", "scope.md", fullScope);
  const journal2 = await readLifecycleJournal(fix.journalPath);
  const state2 = reduceLifecycle(journal2.events);
  const results = await PREDICATE_SETS.Scope({
    lifecycleState: state2,
    artifacts: state2.acceptedArtifacts.filter((a) => a.canonicalStage === "Scope"),
    feedback: null,
    repositoryRoot: fix.dir,
  });

  for (const p of results) {
    if (p.id === "scope.developer-acceptance") {
      assert.equal(p.result, "fail", `expected fail for ${p.id} without feedback`);
    } else {
      assert.equal(p.result, "pass", `expected pass for ${p.id}, got ${p.result}: ${p.evidence.join("; ")}`);
    }
  }

  await rm(fix.dir, { recursive: true, force: true });
});

test("Scope requires developer acceptance for satisfied outcome", async () => {
  const fix = await fixture();
  await reachStage(fix, "Scope");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const attemptId = state.attempts[0].attemptId;

  const fullScope = `---
kind: myflow-scope
workstream: eval-fixture
stage: Scope
status: ready
---

## Outcome

Clear.

## Beneficiaries

Devs.

## Non-goals

None.

## Acceptance criteria

- AC1.

## Risk

Low.

## Depth

Lightweight.

## Open questions

None.

## Next action

Plan.
`;
  await acceptArtifact(fix, "Scope", "scope.md", fullScope);
  const journal2 = await readLifecycleJournal(fix.journalPath);
  const state2 = reduceLifecycle(journal2.events);

  // Without feedback: developer-acceptance fails.
  const resultsWithoutFeedback = await PREDICATE_SETS.Scope({
    lifecycleState: state2,
    artifacts: state2.acceptedArtifacts.filter((a) => a.canonicalStage === "Scope"),
    feedback: null,
    repositoryRoot: fix.dir,
  });
  const acceptancePred = resultsWithoutFeedback.find((p) => p.id === "scope.developer-acceptance");
  assert.equal(acceptancePred.result, "fail");

  // Derive outcome: has one fail -> unsatisfied.
  const outcomeWithout = deriveOutcome("Scope", resultsWithoutFeedback, state2);
  assert.equal(outcomeWithout, "unsatisfied");

  // With feedback: developer-acceptance passes.
  const resultsWithFeedback = await PREDICATE_SETS.Scope({
    lifecycleState: state2,
    artifacts: state2.acceptedArtifacts.filter((a) => a.canonicalStage === "Scope"),
    feedback: { status: "recorded" },
    repositoryRoot: fix.dir,
  });
  const acceptancePred2 = resultsWithFeedback.find((p) => p.id === "scope.developer-acceptance");
  assert.equal(acceptancePred2.result, "pass");

  // Derive outcome: all pass -> satisfied.
  const outcomeWith = deriveOutcome("Scope", resultsWithFeedback, state2);
  assert.equal(outcomeWith, "satisfied");

  await rm(fix.dir, { recursive: true, force: true });
});

test("Plan predicates detect design disposition and settled choices", async () => {
  const fix = await fixture();
  await reachStage(fix, "Plan");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const attempt = state.attempts[state.attempts.length - 1];
  assert.equal(attempt.canonicalStage, "Plan");

  const fullPlan = `---
kind: myflow-plan
workstream: eval-fixture
stage: Plan
status: ready
---

## Design disposition

Accepted.

## Implementation choices fixed by this plan

Settled choices.

## Implementation phases

Phase 1, Phase 2.

## Verification map

Table of checks.

## Manual verification

Not required.

## Commit and delivery strategy

One commit per phase.

## Developer acceptance

Accepted on 2026-01-01.
`;
  await acceptArtifact(fix, "Plan", "plan.md", fullPlan);
  const journal2 = await readLifecycleJournal(fix.journalPath);
  const state2 = reduceLifecycle(journal2.events);

  const results = await PREDICATE_SETS.Plan({
    lifecycleState: state2,
    artifacts: state2.acceptedArtifacts.filter((a) => a.canonicalStage === "Plan"),
    feedback: { status: "recorded" },
    repositoryRoot: fix.dir,
  });

  for (const p of results) {
    assert.equal(p.result, "pass", `expected pass for ${p.id}, got ${p.result}: ${p.evidence.join("; ")}`);
  }

  await rm(fix.dir, { recursive: true, force: true });
});

test("Implement predicates detect checkpoint and required checks", async () => {
  const fix = await fixture();
  await reachStage(fix, "Implement");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const attempt = state.attempts[state.attempts.length - 1];
  assert.equal(attempt.canonicalStage, "Implement");

  const fullCheckpoint = `---
kind: myflow-implementation-checkpoint
workstream: eval-fixture
stage: Implement
status: in-progress
---

## Phase state

| Phase | Status | Commit |
|---|---|---|
| 1 | complete | \`abc1234\` |

## Phase 1 result

All tests passed. No failures.

## Deviations

No deviations.

## Outstanding manual verification

None.

## Next action

Proceed to Verify.
`;
  await acceptArtifact(fix, "Implement", "checkpoint.md", fullCheckpoint);
  const journal2 = await readLifecycleJournal(fix.journalPath);
  const state2 = reduceLifecycle(journal2.events);

  const results = await PREDICATE_SETS.Implement({
    lifecycleState: state2,
    artifacts: state2.acceptedArtifacts.filter((a) => a.canonicalStage === "Implement"),
    feedback: null,
    repositoryRoot: fix.dir,
  });

  for (const p of results) {
    if (p.id === "implement.deviations") {
      assert.equal(p.result, "pass", `expected pass for ${p.id}, got ${p.result}: ${p.evidence.join("; ")}`);
    } else {
      assert.equal(p.result, "pass", `expected pass for ${p.id}, got ${p.result}: ${p.evidence.join("; ")}`);
    }
  }

  await rm(fix.dir, { recursive: true, force: true });
});

test("Verify predicates detect criterion coverage and verdict", async () => {
  const fix = await fixture();
  await reachStage(fix, "Verify");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const attempt = state.attempts[state.attempts.length - 1];
  assert.equal(attempt.canonicalStage, "Verify");

  const fullVerify = `---
kind: myflow-verification
workstream: eval-fixture
stage: Verify
status: ready
verdict: pass
---

## Criterion coverage

All criteria checked.

## Automated evidence

\`node --test\` passed with 10 tests.

## Independent review

Code review completed.

## Deviations

No deviations.

## Manual brief

Not required for this phase.

## Verdict

Pass.

## Next action

Proceed to Close.
`;
  await acceptArtifact(fix, "Verify", "verification.md", fullVerify);
  const journal2 = await readLifecycleJournal(fix.journalPath);
  const state2 = reduceLifecycle(journal2.events);

  const results = await PREDICATE_SETS.Verify({
    lifecycleState: state2,
    artifacts: state2.acceptedArtifacts.filter((a) => a.canonicalStage === "Verify"),
    feedback: null,
    repositoryRoot: fix.dir,
  });

  for (const p of results) {
    assert.equal(p.result, "pass", `expected pass for ${p.id}, got ${p.result}: ${p.evidence.join("; ")}`);
  }

  await rm(fix.dir, { recursive: true, force: true });
});

test("Close predicates detect Verify precondition and follow-up ownership", async () => {
  const fix = await fixture();
  await reachStage(fix, "Close");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const attempt = state.attempts[state.attempts.length - 1];
  assert.equal(attempt.canonicalStage, "Close");

  const fullClose = `---
kind: myflow-close
workstream: eval-fixture
stage: Close
status: ready
---

## Verify precondition

Verify passed with green checks.

## Delivery decision

Deliver to main.

## Documentation

Updated README and docs.

## Git state

Final commit: \`def5678\`

## Follow-up

No unowned remainder. Follow-up tracked in next workstream.
`;
  await acceptArtifact(fix, "Close", "close.md", fullClose);
  const journal2 = await readLifecycleJournal(fix.journalPath);
  const state2 = reduceLifecycle(journal2.events);

  const results = await PREDICATE_SETS.Close({
    lifecycleState: state2,
    artifacts: state2.acceptedArtifacts.filter((a) => a.canonicalStage === "Close"),
    feedback: null,
    repositoryRoot: fix.dir,
  });

  for (const p of results) {
    assert.equal(p.result, "pass", `expected pass for ${p.id}, got ${p.result}: ${p.evidence.join("; ")}`);
  }

  await rm(fix.dir, { recursive: true, force: true });
});

// --- Outcome derivation ---

test("deriveOutcome maps predicate patterns to outcomes", () => {
  const allPass = [
    { id: "a", result: "pass", evidence: [] },
    { id: "b", result: "pass", evidence: [] },
  ];
  assert.equal(deriveOutcome("Scope", allPass, {}), "satisfied");

  const mixedNa = [
    { id: "a", result: "pass", evidence: [] },
    { id: "b", result: "not-applicable", evidence: [] },
  ];
  assert.equal(deriveOutcome("Scope", mixedNa, {}), "satisfied");

  const withFail = [
    { id: "a", result: "pass", evidence: [] },
    { id: "b", result: "fail", evidence: [] },
  ];
  assert.equal(deriveOutcome("Scope", withFail, {}), "unsatisfied");

  const withUnknown = [
    { id: "a", result: "pass", evidence: [] },
    { id: "b", result: "unknown", evidence: [] },
  ];
  assert.equal(deriveOutcome("Scope", withUnknown, {}), "incomplete");

  const mixedFailUnknown = [
    { id: "a", result: "fail", evidence: [] },
    { id: "b", result: "unknown", evidence: [] },
  ];
  assert.equal(deriveOutcome("Scope", mixedFailUnknown, {}), "incomplete");

  const blocked = [
    { id: "a", result: "pass", evidence: [] },
    { id: "scope.blocked", result: "pass", evidence: [] },
  ];
  assert.equal(deriveOutcome("Scope", blocked, {}), "blocked");
});

// --- Return assessment ---

test("validateReturnAssessmentInput validates nature and lateDiscovery fields", async () => {
  const fix = await fixture();
  await reachStage(fix, "Verify");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);

  // Open a return first.
  const verifyAttemptId = state.attempts[state.attempts.length - 1].attemptId;
  await fix.append("return.opened", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "ep-return",
    detectingStage: "Verify",
    detectingActivity: "verification",
    initialOwningStage: "Implement",
    initialOwningActivity: "phase",
    originAttemptId: verifyAttemptId,
    triggerSource: "verification-evidence",
    changeKind: "implementation",
    evidenceRefs: ["failure"],
  });
  const journal2 = await readLifecycleJournal(fix.journalPath);
  const state2 = reduceLifecycle(journal2.events);

  // Valid.
  const { episode } = validateReturnAssessmentInput(
    {
      episodeId: "ep-return",
      triggerSource: "verification-evidence",
      changeKind: "implementation",
      nature: "delivery-defect",
      lateDiscovery: "false",
      confidence: "high",
    },
    state2,
  );
  assert.equal(episode.episodeId, "ep-return");

  // Invalid nature.
  assert.throws(
    () =>
      validateReturnAssessmentInput(
        {
          episodeId: "ep-return",
          triggerSource: "verification-evidence",
          changeKind: "implementation",
          nature: "blame",
          lateDiscovery: "false",
          confidence: "high",
        },
        state2,
      ),
    /nature must be one of/,
  );

  // Missing episode in state.
  assert.throws(
    () =>
      validateReturnAssessmentInput(
        {
          episodeId: "nonexistent",
          triggerSource: "verification-evidence",
          changeKind: "implementation",
          nature: "necessary-learning",
          lateDiscovery: "false",
          confidence: "high",
        },
        state2,
      ),
    /unknown correction episode/,
  );

  // lateDiscovery=true without counterfactual fields.
  assert.throws(
    () =>
      validateReturnAssessmentInput(
        {
          episodeId: "ep-return",
          triggerSource: "verification-evidence",
          changeKind: "implementation",
          nature: "necessary-learning",
          lateDiscovery: "true",
          confidence: "high",
        },
        state2,
      ),
    /counterfactual/,
  );

  await rm(fix.dir, { recursive: true, force: true });
});

test("Return assessment covers all nature and lateDiscovery combinations", () => {
  const episode = { episodeId: "ep1", detectingStage: "Verify" };

  for (const nature of ["necessary-learning", "changed-intent", "delivery-defect", "external-change", "process-induced", "unclassified"]) {
    for (const lateDiscovery of ["true", "false", "unknown"]) {
      const baseOptions = {
        episodeId: "ep1",
        triggerSource: "verification-evidence",
        changeKind: "implementation",
        nature,
        lateDiscovery,
        confidence: "medium",
      };

      if (lateDiscovery === "true") {
        const fullOptions = {
          ...baseOptions,
          earliestDetectingStage: "Plan",
          earlierCheck: "review",
          requiredInformation: "docs",
          informationExisted: "yes",
          expectedSignal: "clear",
          costClass: "lower",
          falsePositiveRisk: "low",
          qualityGuardrail: "review",
        };
        const assessment = buildReturnAssessment(fullOptions, episode);
        assert.equal(assessment.nature, nature);
        assert.equal(assessment.lateDiscovery, "true");
        assert.equal(assessment.costClass, "lower");
      } else {
        const assessment = buildReturnAssessment(baseOptions, episode);
        assert.equal(assessment.nature, nature);
        assert.equal(assessment.lateDiscovery, lateDiscovery);
        assert.equal(assessment.earliestDetectingStage, undefined);
      }
    }
  }
});

// --- Counterfactual missing-field rejection ---

test("Counterfactual rejects late discovery when then-available information is missing", () => {
  const base = {
    episodeId: "ep1",
    triggerSource: "verification-evidence",
    changeKind: "implementation",
    nature: "delivery-defect",
    lateDiscovery: "true",
    confidence: "high",
    missingEvidence: [],
    counterevidence: [],
    earliestDetectingStage: "Plan",
    earlierCheck: "check",
    requiredInformation: "info",
    informationExisted: "yes",
    expectedSignal: "signal",
    costClass: "lower",
    falsePositiveRisk: "low",
    qualityGuardrail: "review",
  };

  assert.throws(
    () => validateCounterfactual({ ...base, requiredInformation: "" }),
    /requiredInformation/,
    "must reject empty requiredInformation",
  );
  assert.throws(
    () => validateCounterfactual({ ...base, informationExisted: "" }),
    /informationExisted/,
    "must reject empty informationExisted",
  );
  assert.throws(
    () => validateCounterfactual({ ...base, expectedSignal: undefined }),
    /expectedSignal/,
    "must reject missing expectedSignal",
  );
  assert.throws(
    () => validateCounterfactual({ ...base, costClass: "free" }),
    /costClass/,
    "must reject invalid costClass",
  );
  assert.throws(
    () => validateCounterfactual({ ...base, falsePositiveRisk: "" }),
    /falsePositiveRisk/,
    "must reject empty falsePositiveRisk",
  );
  assert.throws(
    () => validateCounterfactual({ ...base, qualityGuardrail: undefined }),
    /qualityGuardrail/,
    "must reject missing qualityGuardrail",
  );
});

// --- Public projection allowlist ---

test("public projection excludes comments, paths, evidence excerpts, prompts, commands, code, and identities", () => {
  const review = {
    schemaVersion: STAGE_REVIEW_SCHEMA_VERSION,
    reviewId: "rev_test123",
    createdAt: "2026-01-01T00:00:00.000Z",
    repository: { kind: "origin", value: "github.com/example/project" },
    workstreamId: "test-ws",
    attemptId: "attempt_abc",
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    revision: 1,
    inputs: {
      lifecycleEventCount: 5,
      lifecycleLastEventId: "evt_abc",
      lifecycleDigest: "abcdef1234567890",
      artifactDigests: [{ path: "/home/user/project/.myflow/workstreams/test/scope/scope.md", digest: "abcdef" }],
      feedbackStatus: "recorded",
      feedbackRef: "stage-feedback/events.jsonl#feedback_abc",
    },
    evaluator: {
      evaluatorVersion: EVALUATOR_VERSION,
      ruleSetVersion: RULE_SET_VERSION,
    },
    predicates: [
      { id: "scope.outcome-defined", result: "pass", evidence: ["Outcome section found in /path/to/artifact.md with content: 'The outcome is to migrate'"] },
      { id: "scope.developer-acceptance", result: "pass", evidence: ["Developer accepted at 2026-01-01"] },
    ],
    outcome: "satisfied",
    feedbackCoverage: "recorded",
    returnAssessment: {
      episodeId: "ep1",
      triggerSource: "developer-report",
      changeKind: "outcome-or-acceptance",
      nature: "changed-intent",
      lateDiscovery: "false",
      confidence: "high",
      missingEvidence: ["No session recording available"],
      counterevidence: ["Design was unclear"],
    },
    limitations: [
      "Mechanical only.",
      "Evidence excerpt: 'the design did not cover...' with code: `function foo()`",
    ],
  };

  const projected = publicProjection(review);

  // Allowed fields present.
  assert.equal(projected.schemaVersion, "myflow-stage-review-public/v1");
  assert.equal(projected.reviewId, "rev_test123");
  assert.equal(projected.workstreamId, "test-ws");
  assert.equal(projected.attemptId, "attempt_abc");
  assert.equal(projected.canonicalStage, "Scope");
  assert.equal(projected.outcome, "satisfied");
  assert.equal(projected.revision, 1);
  assert.equal(projected.limitationCount, 2);

  // Exclusion assertions.
  assert.equal("repository" in projected, false, "repository identity excluded");
  assert.equal("inputs" in projected, false, "inputs excluded");
  assert.equal("artifactDigests" in projected, false, "artifact digests excluded");
  assert.equal(projected.predicates[0].evidence, undefined, "predicate evidence excluded");
  assert.equal(projected.predicates[0].id, "scope.outcome-defined");
  assert.equal(projected.predicates[0].result, "pass");
  assert.equal(projected.returnAssessment.episodeId, undefined, "episodeId excluded from return");
  assert.equal(projected.returnAssessment.triggerSource, undefined, "triggerSource excluded from return");
  assert.equal(projected.returnAssessment.nature, "changed-intent");
  assert.equal(projected.returnAssessment.lateDiscovery, "false");
  assert.equal(projected.returnAssessment.confidence, "high");
  assert.equal(projected.returnAssessment.missingEvidence, undefined, "missingEvidence excluded");
  assert.equal(projected.returnAssessment.counterevidence, undefined, "counterevidence excluded");
  assert.equal(projected.limitations, undefined, "free-text limitations excluded");

  // Serialized form must not contain forbidden patterns.
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("/path/"), false, "paths excluded");
  assert.equal(serialized.includes("`function"), false, "code excluded");
  assert.equal(serialized.includes("github.com"), false, "repository identity excluded");
  assert.equal(serialized.includes("evidence excerpt"), false, "evidence excerpts excluded");
  assert.equal(serialized.includes("stage-feedback"), false, "private refs excluded");
});

test("public projection rejects forbidden content in serialized output", () => {
  // This test proves the FORBIDDEN_PUBLIC_PATTERNS guard works.
  // We'll construct a review that would put a path-like string into an allowed field.
  const review = {
    schemaVersion: STAGE_REVIEW_SCHEMA_VERSION,
    reviewId: "rev_test",
    createdAt: "2026-01-01T00:00:00.000Z",
    repository: { kind: "origin", value: "github.com/test/repo" },
    workstreamId: "test",
    attemptId: "attempt_test",
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    revision: 1,
    inputs: {
      lifecycleEventCount: 1,
      lifecycleLastEventId: null,
      lifecycleDigest: "abc",
      artifactDigests: [],
      feedbackStatus: "missing",
      feedbackRef: null,
    },
    evaluator: { evaluatorVersion: "1.0", ruleSetVersion: "1.0" },
    predicates: [{ id: "test", result: "pass", evidence: [] }],
    outcome: "satisfied",
    feedbackCoverage: "recorded",
    returnAssessment: null,
    limitations: [],
  };

  // A workstreamId that looks like a path.
  const withPath = { ...review, workstreamId: "/etc/passwd" };
  assert.throws(
    () => publicProjection(withPath),
    /forbidden content/,
  );

  // OK: clean workstreamId.
  publicProjection({ ...review, workstreamId: "clean-id" });
});

// --- Historical preservation ---

test("later correction creates a new review revision without rewriting prior result", async () => {
  const fix = await fixture();
  await reachStage(fix, "Scope");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const attemptId = state.attempts[0].attemptId;

  const fullScope = `---
kind: myflow-scope
workstream: eval-fixture
stage: Scope
status: ready
---

## Outcome
Clear.

## Beneficiaries
Devs.

## Non-goals
None.

## Acceptance criteria
- AC1.

## Risk
Low.

## Depth
Lightweight.

## Open questions
None.

## Next action
Plan.
`;
  await acceptArtifact(fix, "Scope", "scope.md", fullScope);

  // First review: satisfied with feedback.
  const stateRoot = join(fix.dir, "private-state");
  const { appendPrivateRecord } = await import("../../skills/myflow/scripts/lib/private-store.mjs");
  const journal2 = await readLifecycleJournal(fix.journalPath);
  const state2 = reduceLifecycle(journal2.events);

  const results1 = await PREDICATE_SETS.Scope({
    lifecycleState: state2,
    artifacts: state2.acceptedArtifacts.filter((a) => a.canonicalStage === "Scope"),
    feedback: { status: "recorded" },
    repositoryRoot: fix.dir,
  });
  const outcome1 = deriveOutcome("Scope", results1, state2);

  const review1 = {
    schemaVersion: STAGE_REVIEW_SCHEMA_VERSION,
    reviewId: reviewId({ attemptId, revision: 1, idempotencyKey: "review-1" }),
    createdAt: "2026-01-01T01:00:00.000Z",
    repository: fix.repository,
    workstreamId: fix.workstreamId,
    attemptId,
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    revision: 1,
    inputs: {
      lifecycleEventCount: journal2.events.length,
      lifecycleLastEventId: state2.lastEventId,
      lifecycleDigest: "abc",
      artifactDigests: [],
      feedbackStatus: "recorded",
      feedbackRef: null,
    },
    evaluator: { evaluatorVersion: EVALUATOR_VERSION, ruleSetVersion: RULE_SET_VERSION },
    predicates: results1,
    outcome: outcome1,
    feedbackCoverage: "recorded",
    returnAssessment: null,
    limitations: ["mechanical only"],
  };
  validateStageReview(review1);
  assert.equal(review1.outcome, "satisfied");

  // Store first review.
  review1.recordId = review1.reviewId;
  const stored1 = await appendPrivateRecord({
    repositoryRoot: fix.dir,
    stateRoot,
    workstreamId: fix.workstreamId,
    category: "stage-reviews",
    record: review1,
  });

  // Second review: same attempt, revision 2 (simulating re-evaluation after correction).
  const review2 = {
    ...review1,
    reviewId: reviewId({ attemptId, revision: 2, idempotencyKey: "review-2" }),
    revision: 2,
    createdAt: "2026-01-02T00:00:00.000Z",
    outcome: "satisfied", // Still satisfied.
  };
  validateStageReview(review2);

  review2.recordId = review2.reviewId;
  const stored2 = await appendPrivateRecord({
    repositoryRoot: fix.dir,
    stateRoot,
    workstreamId: fix.workstreamId,
    category: "stage-reviews",
    record: review2,
  });

  // Verify both reviews exist and the first is unchanged.
  const text = await readFile(stored2.path, "utf8");
  const records = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(records.length, 2);
  assert.equal(records[0].revision, 1);
  assert.equal(records[1].revision, 2);
  assert.equal(records[0].outcome, "satisfied");
  assert.equal(records[1].outcome, "satisfied");

  await rm(fix.dir, { recursive: true, force: true });
});

// --- Blocked stage ---

test("blocked stage produces blocked outcome", async () => {
  const fix = await fixture();
  await createAndEnterScope(fix);
  await fix.append("stage.blocked", {
    canonicalStage: "Scope",
    owningActivity: "scope",
    blockId: "external-block",
    reason: "external-dependency",
  });

  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);

  // Simulate predicates that include a blocked check.
  const results = [
    { id: "scope.blocked", result: "pass", evidence: ["stage is blocked"] },
    { id: "scope.outcome-defined", result: "not-applicable", evidence: [] },
  ];
  const outcome = deriveOutcome("Scope", results, state);
  assert.equal(outcome, "blocked");

  await rm(fix.dir, { recursive: true, force: true });
});

// --- CLI integration ---

test("evaluate-stage CLI validates lifecycle journal and returns review receipt", async () => {
  const fix = await fixture();
  await reachStage(fix, "Scope");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const attemptId = state.attempts[0].attemptId;

  const fullScope = `---
kind: myflow-scope
workstream: eval-fixture
stage: Scope
status: ready
---

## Outcome
Clear.

## Beneficiaries
Devs.

## Non-goals
None.

## Acceptance criteria
- AC1.

## Risk
Low.

## Depth
Lightweight.

## Open questions
None.

## Next action
Plan.
`;
  await acceptArtifact(fix, "Scope", "scope.md", fullScope);

  const stateRoot = join(fix.dir, "private-state");
  const { stdout } = await execFileAsync("node", [
    evaluateCli.pathname,
    "--repository-root", fix.dir,
    "--state-root", stateRoot,
    "--workstream-id", fix.workstreamId,
    "--stage", "Scope",
    "--attempt-id", attemptId,
    "--source", "test-cli",
    "--idempotency-key", "cli-eval-1",
  ]);

  const receipt = JSON.parse(stdout);
  assert.equal(receipt.schemaVersion, STAGE_REVIEW_SCHEMA_VERSION);
  assert.equal(receipt.attemptId, attemptId);
  assert.equal(receipt.canonicalStage, "Scope");
  assert.equal(receipt.duplicate, false);
  assert.match(receipt.privateRef, /stage-reviews\/events\.jsonl#rev_/);
  assert.equal(receipt.publicProjection.schemaVersion, "myflow-stage-review-public/v1");
  assert.equal(receipt.publicProjection.workstreamId, fix.workstreamId);
  assert.equal("repository" in receipt.publicProjection, false);

  // Re-evaluation with same key creates new revision (not duplicate).
  const { stdout: retryStdout } = await execFileAsync("node", [
    evaluateCli.pathname,
    "--repository-root", fix.dir,
    "--state-root", stateRoot,
    "--workstream-id", fix.workstreamId,
    "--stage", "Scope",
    "--attempt-id", attemptId,
    "--source", "test-cli",
    "--idempotency-key", "cli-eval-1b",
  ]);
  const retry = JSON.parse(retryStdout);
  assert.equal(retry.revision, 2);
  assert.notEqual(retry.reviewId, receipt.reviewId);

  await rm(fix.dir, { recursive: true, force: true });
});

test("evaluate-stage CLI accepts return assessment arguments", async () => {
  const fix = await fixture();
  await reachStage(fix, "Verify");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const verifyAttemptId = state.attempts[state.attempts.length - 1].attemptId;

  // Open a return.
  await fix.append("return.opened", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "ep-cli-return",
    detectingStage: "Verify",
    detectingActivity: "verification",
    initialOwningStage: "Implement",
    initialOwningActivity: "phase",
    originAttemptId: verifyAttemptId,
    triggerSource: "verification-evidence",
    changeKind: "implementation",
    evidenceRefs: ["failure"],
  });

  const fullVerify = `---
kind: myflow-verification
workstream: eval-fixture
stage: Verify
status: ready
verdict: pass
---

## Criterion coverage
Checked.

## Automated evidence
Tests passed.

## Independent review
Done.

## Deviations
None.

## Manual brief
N/A.

## Verdict
Pass.

## Next action
Close.
`;
  await acceptArtifact(fix, "Verify", "verification.md", fullVerify);

  const stateRoot = join(fix.dir, "private-state");
  const { stdout } = await execFileAsync("node", [
    evaluateCli.pathname,
    "--repository-root", fix.dir,
    "--state-root", stateRoot,
    "--workstream-id", fix.workstreamId,
    "--stage", "Verify",
    "--attempt-id", verifyAttemptId,
    "--source", "test-cli",
    "--idempotency-key", "cli-return-eval",
    "--return-episode-id", "ep-cli-return",
    "--trigger-source", "verification-evidence",
    "--change-kind", "implementation",
    "--nature", "necessary-learning",
    "--late-discovery", "true",
    "--confidence", "high",
    "--earliest-detecting-stage", "Plan",
    "--earlier-check", "review acceptance criteria",
    "--required-information", "full criteria list",
    "--information-existed", "document existed at Plan",
    "--expected-signal", "missing criterion",
    "--cost-class", "lower",
    "--false-positive-risk", "low",
    "--quality-guardrail", "second review",
    "--missing-evidence", "session recording",
    "--counterevidence", "design was ambiguous",
  ]);

  const receipt = JSON.parse(stdout);
  assert.equal(receipt.canonicalStage, "Verify");
  assert.equal(receipt.publicProjection.returnAssessment.nature, "necessary-learning");
  assert.equal(receipt.publicProjection.returnAssessment.lateDiscovery, "true");
  assert.equal(receipt.publicProjection.returnAssessment.confidence, "high");

  await rm(fix.dir, { recursive: true, force: true });
});

test("evaluate-stage CLI rejects invalid attempt or stage mismatch", async () => {
  const fix = await fixture();
  await reachStage(fix, "Scope");

  const stateRoot = join(fix.dir, "private-state");
  let stderr = "";
  try {
    await execFileAsync("node", [
      evaluateCli.pathname,
      "--repository-root", fix.dir,
      "--state-root", stateRoot,
      "--workstream-id", fix.workstreamId,
      "--stage", "Plan",
      "--attempt-id", "nonexistent",
      "--source", "test-cli",
      "--idempotency-key", "bad-eval",
    ]);
  } catch (error) {
    stderr = error.stderr || error.message;
  }
  assert.match(stderr, /not found|invalid/);

  await rm(fix.dir, { recursive: true, force: true });
});

// --- Revision tracking across reviews ---

test("evaluate-stage increments revision on subsequent reviews of the same attempt", async () => {
  const fix = await fixture();
  await reachStage(fix, "Scope");
  const { readLifecycleJournal } = await import("../../skills/myflow/scripts/lib/lifecycle-store.mjs");
  const journal = await readLifecycleJournal(fix.journalPath);
  const state = reduceLifecycle(journal.events);
  const attemptId = state.attempts[0].attemptId;

  const fullScope = `---
kind: myflow-scope
workstream: eval-fixture
stage: Scope
status: ready
---

## Outcome
Clear.

## Beneficiaries
Devs.

## Non-goals
None.

## Acceptance criteria
- AC1.

## Risk
Low.

## Depth
Lightweight.

## Open questions
None.

## Next action
Plan.
`;
  await acceptArtifact(fix, "Scope", "scope.md", fullScope);

  const stateRoot = join(fix.dir, "private-state");

  // First evaluation.
  const { stdout: out1 } = await execFileAsync("node", [
    evaluateCli.pathname,
    "--repository-root", fix.dir,
    "--state-root", stateRoot,
    "--workstream-id", fix.workstreamId,
    "--stage", "Scope",
    "--attempt-id", attemptId,
    "--source", "test-cli",
    "--idempotency-key", "revision-1",
  ]);
  const r1 = JSON.parse(out1);
  assert.equal(r1.revision, 1);

  // Second evaluation (different idempotency key).
  const { stdout: out2 } = await execFileAsync("node", [
    evaluateCli.pathname,
    "--repository-root", fix.dir,
    "--state-root", stateRoot,
    "--workstream-id", fix.workstreamId,
    "--stage", "Scope",
    "--attempt-id", attemptId,
    "--source", "test-cli",
    "--idempotency-key", "revision-2",
  ]);
  const r2 = JSON.parse(out2);
  assert.equal(r2.revision, 2);
  assert.notEqual(r2.reviewId, r1.reviewId);

  await rm(fix.dir, { recursive: true, force: true });
});

// --- Unknown predicate preservation ---

test("predicates preserve unknown without converting to failure", () => {
  const results = [
    { id: "a", result: "unknown", evidence: ["missing data"] },
    { id: "b", result: "pass", evidence: [] },
  ];
  const outcome = deriveOutcome("Scope", results, {});
  assert.equal(outcome, "incomplete");

  // Unknown does not become fail.
  const results2 = [
    { id: "a", result: "unknown", evidence: ["missing data"] },
    { id: "b", result: "fail", evidence: ["bad"] },
  ];
  const outcome2 = deriveOutcome("Scope", results2, {});
  // When there are both fail and unknown, it's still incomplete, not unsatisfied.
  assert.equal(outcome2, "incomplete");
});