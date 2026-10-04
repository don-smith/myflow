import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

import {
  ACTIVITY_BY_STAGE,
  CANONICAL_STAGES,
  EVENT_KINDS,
  LIFECYCLE_SCHEMA_VERSION,
  TERMINAL_REASONS,
} from "../skills/myflow/scripts/lib/lifecycle-contract.mjs";
import { reduceLifecycle } from "../skills/myflow/scripts/lib/lifecycle-reducer.mjs";
import {
  appendLifecycleEvent,
  readLifecycleJournal,
  validateLifecycleJournal,
} from "../skills/myflow/scripts/lib/lifecycle-store.mjs";

const execFile = promisify(execFileCallback);
const lifecycleCli = new URL("../skills/myflow/scripts/lifecycle-journal.mjs", import.meta.url);

async function fixture() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "myflow-lifecycle-"));
  const workstreamId = "journal-fixture";
  const workstreamRoot = join(repositoryRoot, ".myflow", "workstreams", workstreamId);
  const journalPath = join(workstreamRoot, "lifecycle", "events.jsonl");
  await mkdir(workstreamRoot, { recursive: true });
  await writeFile(join(workstreamRoot, "workstream.md"), "# Fixture\n");
  let sequence = 0;

  const append = (kind, values = {}) => {
    sequence += 1;
    return appendLifecycleEvent({
      journalPath,
      repositoryRoot,
      repository: { kind: "origin", value: "github.com/example/project" },
      workstreamId,
      kind,
      source: "test",
      idempotencyKey: values.idempotencyKey ?? `event-${sequence}`,
      occurredAt: values.occurredAt ?? new Date(Date.UTC(2026, 0, 1, 0, sequence)).toISOString(),
      ...values,
    });
  };

  return { repositoryRoot, workstreamRoot, journalPath, workstreamId, append };
}

async function createAndEnterScope(context) {
  await context.append("workstream.created", {
    canonicalStage: "Scope",
    owningActivity: "scope",
  });
  await context.append("stage.entered", {
    canonicalStage: "Scope",
    owningActivity: "scope",
  });
}

async function advance(context, fromStage, fromActivity, toStage, toActivity) {
  await context.append("stage.completed", {
    canonicalStage: fromStage,
    owningActivity: fromActivity,
    terminalReason: "advanced",
  });
  await context.append("stage.entered", {
    canonicalStage: toStage,
    owningActivity: toActivity,
  });
}

async function reachVerify(context) {
  await createAndEnterScope(context);
  await advance(context, "Scope", "scope", "Plan", "planning");
  await advance(context, "Plan", "planning", "Implement", "phase");
  await advance(context, "Implement", "phase", "Verify", "verification");
}

test("deferred Implement feedback recorded at Verify entry stays on the closed Implement attempt", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  await advance(context, "Scope", "scope", "Plan", "planning");
  await advance(context, "Plan", "planning", "Implement", "phase");
  const beforePending = await validateLifecycleJournal(context.journalPath);
  const implementAttemptId = beforePending.state.currentAttemptId;

  await context.append("feedback.recorded", {
    canonicalStage: "Implement",
    owningActivity: "phase",
    feedbackStatus: "pending",
    privateRef: "stage-feedback/events.jsonl#pending",
  });
  await advance(context, "Implement", "phase", "Verify", "verification");
  await context.append("feedback.requested", {
    canonicalStage: "Implement",
    owningActivity: "phase",
    targetAttemptId: implementAttemptId,
  });
  await context.append("feedback.recorded", {
    canonicalStage: "Implement",
    owningActivity: "phase",
    targetAttemptId: implementAttemptId,
    feedbackStatus: "recorded",
    privateRef: "stage-feedback/events.jsonl#recorded",
  });

  const result = await validateLifecycleJournal(context.journalPath);
  assert.equal(result.valid, true);
  assert.equal(result.state.currentStage, "Verify");
  assert.deepEqual(
    result.state.feedback.map(({ attemptId, status }) => ({ attemptId, status })),
    [
      { attemptId: implementAttemptId, status: "pending" },
      { attemptId: implementAttemptId, status: "requested" },
      { attemptId: implementAttemptId, status: "recorded" },
    ],
  );
  assert.equal(result.state.feedback.every(({ attemptId }) => attemptId === implementAttemptId), true);
});

test("contract defines canonical lifecycle vocabulary", () => {
  assert.equal(LIFECYCLE_SCHEMA_VERSION, "myflow-lifecycle/v1");
  assert.deepEqual(CANONICAL_STAGES, ["Scope", "Plan", "Implement", "Verify", "Close"]);
  assert.deepEqual(TERMINAL_REASONS, ["advanced", "superseded", "abandoned", "workstream-closed"]);
  assert.ok(EVENT_KINDS.includes("return.rerouted"));
  assert.ok(ACTIVITY_BY_STAGE.Plan.includes("design"));
  assert.ok(ACTIVITY_BY_STAGE.Verify.includes("review"));
});

test("initial entry, supporting activity, block and resume, session switch, and same-stage revision keep one canonical attempt", async () => {
  const context = await fixture();
  await createAndEnterScope(context);

  await context.append("activity.entered", {
    canonicalStage: "Scope",
    owningActivity: "research",
    executionRef: { host: "pi", emittingSessionId: "session-1", groupingSessionId: "session-1" },
  });
  await context.append("stage.blocked", {
    canonicalStage: "Scope",
    owningActivity: "research",
    blockId: "source-access",
    reason: "external-dependency",
  });
  await context.append("stage.unblocked", {
    canonicalStage: "Scope",
    owningActivity: "research",
    blockId: "source-access",
  });
  await context.append("activity.completed", {
    canonicalStage: "Scope",
    owningActivity: "research",
  });
  await context.append("activity.entered", {
    canonicalStage: "Scope",
    owningActivity: "prototype",
    executionRef: { host: "pi", emittingSessionId: "session-2", groupingSessionId: "session-1" },
  });
  await context.append("activity.completed", {
    canonicalStage: "Scope",
    owningActivity: "prototype",
  });

  const firstArtifact = join(context.workstreamRoot, "scope", "v1.md");
  const secondArtifact = join(context.workstreamRoot, "scope", "v2.md");
  await mkdir(join(context.workstreamRoot, "scope"), { recursive: true });
  await writeFile(firstArtifact, "first\n");
  await writeFile(secondArtifact, "second\n");
  await context.append("artifact.accepted", {
    canonicalStage: "Scope",
    owningActivity: "scope",
    artifactPath: ".myflow/workstreams/journal-fixture/scope/v1.md",
  });
  await context.append("artifact.accepted", {
    canonicalStage: "Scope",
    owningActivity: "scope",
    artifactPath: ".myflow/workstreams/journal-fixture/scope/v2.md",
  });

  const { events } = await readLifecycleJournal(context.journalPath);
  const state = reduceLifecycle(events);
  assert.equal(state.attempts.length, 1);
  assert.equal(state.attempts[0].ordinal, 1);
  assert.equal(state.activities.length, 2);
  assert.equal(state.activities[0].status, "completed");
  assert.equal(state.blocks[0].status, "resumed");
  assert.equal(state.acceptedArtifacts.length, 2);
  assert.notEqual(state.acceptedArtifacts[0].artifactRef.digest, state.acceptedArtifacts[1].artifactRef.digest);
  assert.deepEqual(
    state.executionRefs.map((entry) => entry.executionRef.emittingSessionId),
    ["session-1", "session-2"],
  );
});

test("Plan to Design activity return stays in one attempt and counts one activity return", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  await advance(context, "Scope", "scope", "Plan", "planning");
  const planAttempt = (await readLifecycleJournal(context.journalPath)).events.at(-1).attemptId;

  await context.append("return.opened", {
    canonicalStage: "Plan",
    owningActivity: "planning",
    episodeId: "episode-design",
    detectingStage: "Plan",
    detectingActivity: "planning",
    initialOwningStage: "Plan",
    initialOwningActivity: "design",
    originAttemptId: planAttempt,
    triggerSource: "verification-evidence",
    changeKind: "architecture",
    evidenceRefs: ["design-review"],
  });

  const state = reduceLifecycle((await readLifecycleJournal(context.journalPath)).events);
  assert.equal(state.attempts.length, 2);
  assert.equal(state.returnEpisodeCount, 1);
  assert.equal(state.stageReturnCount, 0);
  assert.equal(state.activityReturnCount, 1);
  assert.equal(state.returns[0].owner.stage, "Plan");
  assert.equal(state.returns[0].owner.activity, "design");
});

test("Verify to Implement to Verify creates canonical attempts and closes after resumption and re-verification", async () => {
  const context = await fixture();
  await reachVerify(context);
  const verifyAttempt = (await readLifecycleJournal(context.journalPath)).events.at(-1).attemptId;

  await context.append("return.opened", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "episode-implementation",
    detectingStage: "Verify",
    detectingActivity: "verification",
    initialOwningStage: "Implement",
    initialOwningActivity: "phase",
    originAttemptId: verifyAttempt,
    triggerSource: "verification-evidence",
    changeKind: "implementation",
    evidenceRefs: ["failing-check"],
  });
  await context.append("stage.completed", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    terminalReason: "superseded",
  });
  await context.append("stage.entered", { canonicalStage: "Implement", owningActivity: "phase" });
  await context.append("return.owner-ready", {
    canonicalStage: "Implement",
    owningActivity: "phase",
    episodeId: "episode-implementation",
  });
  await context.append("stage.completed", {
    canonicalStage: "Implement",
    owningActivity: "phase",
    terminalReason: "advanced",
  });
  await context.append("stage.entered", { canonicalStage: "Verify", owningActivity: "verification" });
  await context.append("return.resumed", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "episode-implementation",
  });
  await context.append("verification.completed", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "episode-implementation",
    verificationStatus: "passed",
  });
  await context.append("return.closed", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "episode-implementation",
  });

  const state = reduceLifecycle((await readLifecycleJournal(context.journalPath)).events);
  assert.deepEqual(
    state.attempts.filter(({ canonicalStage }) => canonicalStage === "Implement").map(({ ordinal }) => ordinal),
    [1, 2],
  );
  assert.deepEqual(
    state.attempts.filter(({ canonicalStage }) => canonicalStage === "Verify").map(({ ordinal }) => ordinal),
    [1, 2],
  );
  assert.equal(state.returnEpisodeCount, 1);
  assert.equal(state.stageReturnCount, 1);
  assert.equal(state.activityReturnCount, 0);
  assert.equal(state.returns[0].status, "closed");
});

test("reroute from Plan to Scope stays one episode and counts both canonical backward edges", async () => {
  const context = await fixture();
  await reachVerify(context);
  const verifyAttempt = (await readLifecycleJournal(context.journalPath)).events.at(-1).attemptId;

  await context.append("return.opened", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "episode-reroute",
    detectingStage: "Verify",
    detectingActivity: "verification",
    initialOwningStage: "Plan",
    initialOwningActivity: "design",
    originAttemptId: verifyAttempt,
    triggerSource: "developer-report",
    changeKind: "architecture",
    evidenceRefs: ["review-note"],
  });
  await context.append("stage.completed", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    terminalReason: "superseded",
  });
  await context.append("stage.entered", { canonicalStage: "Plan", owningActivity: "design" });
  await context.append("return.rerouted", {
    canonicalStage: "Plan",
    owningActivity: "design",
    episodeId: "episode-reroute",
    owningStage: "Scope",
    routeActivity: "scope",
    changeKind: "outcome-or-acceptance",
    evidenceRefs: ["changed-acceptance"],
  });
  await context.append("stage.completed", {
    canonicalStage: "Plan",
    owningActivity: "design",
    terminalReason: "superseded",
  });
  await context.append("stage.entered", { canonicalStage: "Scope", owningActivity: "scope" });
  await context.append("return.owner-ready", {
    canonicalStage: "Scope",
    owningActivity: "scope",
    episodeId: "episode-reroute",
  });
  await context.append("stage.completed", {
    canonicalStage: "Scope",
    owningActivity: "scope",
    terminalReason: "advanced",
  });
  await context.append("stage.entered", { canonicalStage: "Plan", owningActivity: "planning" });
  await context.append("return.resumed", {
    canonicalStage: "Plan",
    owningActivity: "planning",
    episodeId: "episode-reroute",
  });
  await advance(context, "Plan", "planning", "Implement", "phase");
  await advance(context, "Implement", "phase", "Verify", "verification");
  await context.append("verification.completed", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "episode-reroute",
    verificationStatus: "passed",
  });
  await context.append("return.closed", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    episodeId: "episode-reroute",
  });

  const state = reduceLifecycle((await readLifecycleJournal(context.journalPath)).events);
  assert.equal(state.returnEpisodeCount, 1);
  assert.equal(state.stageReturnCount, 2);
  assert.equal(state.activityReturnCount, 0);
  assert.equal(state.returns[0].routes.length, 2);
  assert.deepEqual(state.returns[0].owner, { stage: "Scope", activity: "scope" });
  assert.equal(state.returns[0].resumedStage, "Plan");
  assert.equal(state.returns[0].status, "closed");
});

test("downstream re-entry increments ordinals and abandoned attempt is terminal", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  await context.append("stage.completed", {
    canonicalStage: "Scope",
    owningActivity: "scope",
    terminalReason: "abandoned",
  });
  await context.append("stage.entered", { canonicalStage: "Scope", owningActivity: "scope" });

  const state = reduceLifecycle((await readLifecycleJournal(context.journalPath)).events);
  assert.deepEqual(state.attempts.map(({ ordinal, status }) => [ordinal, status]), [
    [1, "abandoned"],
    [2, "open"],
  ]);
});

test("append is idempotent, serializes concurrent writers, and preserves its event chain", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  const duplicateInput = {
    canonicalStage: "Scope",
    owningActivity: "scope",
    idempotencyKey: "stable-retry",
    occurredAt: "2026-01-01T01:00:00.000Z",
  };
  const first = await context.append("feedback.requested", duplicateInput);
  const retry = await context.append("feedback.requested", duplicateInput);
  assert.equal(first.event.eventId, retry.event.eventId);
  assert.equal(retry.duplicate, true);

  await Promise.all([
    context.append("feedback.recorded", {
      canonicalStage: "Scope",
      owningActivity: "scope",
      idempotencyKey: "feedback-a",
      feedbackStatus: "recorded",
      privateRef: "private/feedback-a",
    }),
    context.append("artifact.accepted", {
      canonicalStage: "Scope",
      owningActivity: "scope",
      idempotencyKey: "artifact-concurrent",
      artifactPath: ".myflow/workstreams/journal-fixture/workstream.md",
    }),
  ]);

  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, true);
  assert.equal(validation.eventCount, 5);
});

test("crash-tail recovery truncates an incomplete final record before appending", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  await writeFile(context.journalPath, '{"schemaVersion":"myflow-lifecycle/v1"', { flag: "a" });

  const receipt = await context.append("stage.blocked", {
    canonicalStage: "Scope",
    owningActivity: "scope",
    blockId: "crash-recovery",
    reason: "external-dependency",
  });

  assert.equal(receipt.recoveredCrashTail, true);
  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, true);
  assert.equal(validation.eventCount, 3);
});

test("artifact validation accepts repository-relative files and rejects missing, absolute, and escaping paths", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  await assert.rejects(
    context.append("artifact.accepted", {
      canonicalStage: "Scope",
      owningActivity: "scope",
      artifactPath: "/tmp/outside.md",
    }),
    /repository-relative/,
  );
  await assert.rejects(
    context.append("artifact.accepted", {
      canonicalStage: "Scope",
      owningActivity: "scope",
      artifactPath: "../outside.md",
    }),
    /repository-relative/,
  );
  await assert.rejects(
    context.append("artifact.accepted", {
      canonicalStage: "Scope",
      owningActivity: "scope",
      artifactPath: "missing.md",
    }),
    /does not exist/,
  );
});

test("invalid routing, overlapping attempts, premature closure, and historical rewriting are rejected", async () => {
  const context = await fixture();
  await reachVerify(context);
  const verifyAttempt = (await readLifecycleJournal(context.journalPath)).events.at(-1).attemptId;

  await assert.rejects(
    context.append("stage.entered", { canonicalStage: "Implement", owningActivity: "phase" }),
    /overlapping open attempt/,
  );
  await assert.rejects(
    context.append("return.opened", {
      canonicalStage: "Verify",
      owningActivity: "verification",
      episodeId: "bad-route",
      detectingStage: "Verify",
      detectingActivity: "verification",
      initialOwningStage: "Scope",
      initialOwningActivity: "scope",
      originAttemptId: verifyAttempt,
      triggerSource: "verification-evidence",
      changeKind: "implementation",
      evidenceRefs: ["failure"],
    }),
    /implementation corrections route to Implement\/phase/,
  );

  await context.append("return.opened", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    idempotencyKey: "needs-reverification",
    episodeId: "needs-reverification",
    detectingStage: "Verify",
    detectingActivity: "verification",
    initialOwningStage: "Implement",
    initialOwningActivity: "phase",
    originAttemptId: verifyAttempt,
    triggerSource: "verification-evidence",
    changeKind: "implementation",
    evidenceRefs: ["failure"],
  });
  await assert.rejects(
    context.append("return.closed", {
      canonicalStage: "Verify",
      owningActivity: "verification",
      episodeId: "needs-reverification",
    }),
    /owner readiness, downstream resumption, and passing re-verification/,
  );

  await assert.rejects(
    context.append("return.opened", {
      canonicalStage: "Verify",
      owningActivity: "verification",
      idempotencyKey: "needs-reverification",
      episodeId: "different-history",
      detectingStage: "Verify",
      detectingActivity: "verification",
      initialOwningStage: "Implement",
      initialOwningActivity: "phase",
      originAttemptId: verifyAttempt,
      triggerSource: "verification-evidence",
      changeKind: "implementation",
      evidenceRefs: ["different"],
    }),
    /idempotency key would rewrite a historical event/,
  );
});

test("workstream closure requires a terminal Close attempt and private feedback fields are rejected", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  await assert.rejects(
    context.append("feedback.recorded", {
      canonicalStage: "Scope",
      owningActivity: "scope",
      feedbackStatus: "recorded",
      privateRef: "private/feedback",
      rating: "rough",
    }),
    /unsupported fields: rating/,
  );
  await assert.rejects(
    context.append("workstream.closed", {
      canonicalStage: "Scope",
      owningActivity: "scope",
    }),
    /terminal stage attempt/,
  );

  await advance(context, "Scope", "scope", "Plan", "planning");
  await advance(context, "Plan", "planning", "Implement", "phase");
  await advance(context, "Implement", "phase", "Verify", "verification");
  await advance(context, "Verify", "verification", "Close", "closeout");
  await context.append("stage.completed", {
    canonicalStage: "Close",
    owningActivity: "closeout",
    terminalReason: "workstream-closed",
  });
  await context.append("workstream.closed", {
    canonicalStage: "Close",
    owningActivity: "closeout",
  });

  const state = reduceLifecycle((await readLifecycleJournal(context.journalPath)).events);
  assert.equal(state.closed, true);
});

test("lifecycle CLI exposes validation and every semantic mutation without accepting event JSON", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "myflow-lifecycle-cli-"));
  await execFile("git", ["init", "--quiet"], { cwd: repositoryRoot });
  await execFile("git", ["remote", "add", "origin", "https://github.com/example/project.git"], {
    cwd: repositoryRoot,
  });
  // The CLI runs from outside this temporary repository, so without
  // configuration it resolves the home store; keep that store temporary.
  const myflowHomeDirectory = join(repositoryRoot, "myflow-home");
  const cliOptions = { env: { ...process.env, MYFLOW_HOME: myflowHomeDirectory } };
  const cliSource = await readFile(lifecycleCli, "utf8");
  for (const command of [
    "workstream-created",
    "stage-entered",
    "activity-entered",
    "activity-completed",
    "artifact-accepted",
    "stage-blocked",
    "stage-unblocked",
    "stage-completed",
    "return-opened",
    "return-rerouted",
    "return-owner-ready",
    "return-resumed",
    "return-closed",
    "verification-completed",
    "workstream-closed",
    "feedback-requested",
    "feedback-recorded",
  ]) {
    assert.match(cliSource, new RegExp(`\\"${command}\\"`));
  }
  assert.match(cliSource, /--owning-activity/);
  assert.match(cliSource, /--attempt-id/);
  assert.doesNotMatch(cliSource, /--event-json/);

  const common = [
    "--repository-root",
    repositoryRoot,
    "--workstream-id",
    "cli-fixture",
    "--stage",
    "Scope",
    "--activity",
    "scope",
    "--source",
    "test-cli",
  ];
  await execFile(process.execPath, [
    lifecycleCli.pathname,
    "workstream-created",
    ...common,
    "--idempotency-key",
    "created",
  ], cliOptions);
  const duplicate = await execFile(process.execPath, [
    lifecycleCli.pathname,
    "workstream-created",
    ...common,
    "--idempotency-key",
    "created",
  ], cliOptions);
  assert.equal(JSON.parse(duplicate.stdout).duplicate, true);
  await execFile(process.execPath, [
    lifecycleCli.pathname,
    "stage-entered",
    ...common,
    "--idempotency-key",
    "scope-1",
  ], cliOptions);
  const { stdout } = await execFile(process.execPath, [
    lifecycleCli.pathname,
    "validate",
    "--repository-root",
    repositoryRoot,
    "--workstream-id",
    "cli-fixture",
  ], cliOptions);
  const validation = JSON.parse(stdout);
  assert.equal(validation.valid, true);
  assert.equal(validation.state.attempts[0].ordinal, 1);
  const workstreamDirectory = join(myflowHomeDirectory, "repositories", "github.com", "example", "project", "workstreams", "cli-fixture");
  await readFile(join(workstreamDirectory, "lifecycle", "events.jsonl"), "utf8");

  // Artifact paths may be relative to a workstream directory outside the checkout.
  await mkdir(join(workstreamDirectory, "scope"), { recursive: true });
  await writeFile(join(workstreamDirectory, "scope", "alignment.md"), "# Alignment\n");
  const accepted = await execFile(process.execPath, [
    lifecycleCli.pathname,
    "artifact-accepted",
    ...common,
    "--artifact",
    "scope/alignment.md",
    "--idempotency-key",
    "scope-accepted",
  ], cliOptions);
  assert.equal(JSON.parse(accepted.stdout).event.artifactRef.path, "scope/alignment.md");
  const observed = await execFile(process.execPath, [lifecycleCli.pathname, "action-observed", ...common,
    "--source-attempt-id", validation.state.currentAttemptId, "--actual-finding", "new research",
    "--intended-action", "revise", "--intended-stage", "Scope", "--intended-activity", "scope",
    "--intended-owner", "alignment owner", "--unresolved-reason", "awaiting decision",
    "--artifact", "scope/alignment.md", "--idempotency-key", "observed-cli"], cliOptions);
  const observation = JSON.parse(observed.stdout);
  assert.match(observation.event.observationId, /^observation_/);
  assert.equal(observation.event.attemptId, null);
  const observedRetry = await execFile(process.execPath, [lifecycleCli.pathname, "action-observed", ...common,
    "--source-attempt-id", validation.state.currentAttemptId, "--actual-finding", "new research",
    "--intended-action", "revise", "--intended-stage", "Scope", "--intended-activity", "scope",
    "--intended-owner", "alignment owner", "--unresolved-reason", "awaiting decision",
    "--artifact", "scope/alignment.md", "--idempotency-key", "observed-cli"], cliOptions);
  assert.equal(JSON.parse(observedRetry.stdout).duplicate, true);
  const afterObservation = await execFile(process.execPath, [lifecycleCli.pathname, "validate",
    "--repository-root", repositoryRoot, "--workstream-id", "cli-fixture"], cliOptions);
  assert.equal(JSON.parse(afterObservation.stdout).state.unresolvedObservations.length, 1);
});

test("chain validation detects changed historical records", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  const text = await readFile(context.journalPath, "utf8");
  await writeFile(context.journalPath, text.replace('"source":"test"', '"source":"changed"'));

  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join("\n"), /eventId|integrity/i);
});

test("a journal that records a retired skill name as its source stays valid", async () => {
  const context = await fixture();
  await reachVerify(context);
  // The Verify skill was named `validate` until the core slimdown. Journals written
  // then carry that source and must keep validating and reducing.
  await context.append("verification.completed", {
    canonicalStage: "Verify",
    owningActivity: "verification",
    source: "validate",
    verificationStatus: "pass",
  });

  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(validation.state.currentStage, "Verify");
  const { events } = await readLifecycleJournal(context.journalPath);
  assert.equal(events.at(-1).source, "validate");
});

// New persisted records must be distinguishable from historical v1 transitions.
async function observed(context, overrides = {}) {
  const sourceAttemptId = overrides.sourceAttemptId ??
    (await validateLifecycleJournal(context.journalPath)).state.attempts.at(-1).attemptId;
  return context.append("action.observed", {
    schemaVersion: "myflow-lifecycle/v2",
    canonicalStage: "Scope", owningActivity: "scope", sourceAttemptId,
    actualFinding: "A later research result changed the premise",
    intendedAction: "revise", intendedStage: "Scope", intendedActivity: "scope",
    intendedOwner: "alignment owner", unresolvedReason: "awaiting correction route",
    artifactPath: ".myflow/workstreams/journal-fixture/workstream.md", ...overrides,
  });
}

test("a completed Scope can open a linked revision without a fictional Plan event", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  const source = (await validateLifecycleJournal(context.journalPath)).state.currentAttemptId;
  await context.append("stage.completed", { canonicalStage: "Scope", owningActivity: "scope", terminalReason: "advanced" });
  await context.append("revision.opened", { schemaVersion: "myflow-lifecycle/v2", canonicalStage: "Scope",
    owningActivity: "scope", revisionSourceAttemptId: source, reason: "new research",
    artifactPath: ".myflow/workstreams/journal-fixture/workstream.md" });
  await context.append("stage.entered", { canonicalStage: "Scope", owningActivity: "scope" });
  const state = (await validateLifecycleJournal(context.journalPath)).state;
  assert.deepEqual(state.attempts.map(({ canonicalStage }) => canonicalStage), ["Scope", "Scope"]);
  assert.equal(state.attempts[1].revisionSourceAttemptId, source);
  assert.equal(state.attempts[0].status, "advanced");
});

test("an observation after a terminal attempt remains unresolved until later actual links", async () => {
  const context = await fixture();
  await createAndEnterScope(context);
  await context.append("stage.completed", { canonicalStage: "Scope", owningActivity: "scope", terminalReason: "advanced" });
  const before = await readFile(context.journalPath);
  const observation = await observed(context);
  assert.equal(observation.event.attemptId, null);
  assert.equal(observation.event.schemaVersion, "myflow-lifecycle/v2");
  assert.equal((await validateLifecycleJournal(context.journalPath)).state.unresolvedObservations.length, 1);
  assert.deepEqual((await readFile(context.journalPath)).subarray(0, before.length), before);
  const source = observation.event.sourceAttemptId;
  await context.append("revision.opened", { schemaVersion: "myflow-lifecycle/v2", canonicalStage: "Scope",
    owningActivity: "scope", revisionSourceAttemptId: source, reason: "new research",
    artifactPath: ".myflow/workstreams/journal-fixture/workstream.md" });
  const entry = await context.append("stage.entered", { canonicalStage: "Scope", owningActivity: "scope" });
  const accepted = await context.append("artifact.accepted", { canonicalStage: "Scope", owningActivity: "scope",
    artifactPath: ".myflow/workstreams/journal-fixture/workstream.md" });
  await assert.rejects(context.append("action.resolved", { schemaVersion: "myflow-lifecycle/v2",
    canonicalStage: "Scope", owningActivity: "scope", observationId: observation.event.observationId,
    linkedEventIds: ["evt_missing"], linkedAttemptIds: [entry.event.attemptId],
    linkedArtifactEventIds: [accepted.event.eventId] }), /unknown linked event/);
  await assert.rejects(context.append("action.resolved", { schemaVersion: "myflow-lifecycle/v2",
    canonicalStage: "Scope", owningActivity: "scope", observationId: observation.event.observationId,
    linkedEventIds: [entry.event.eventId], linkedAttemptIds: [source],
    linkedArtifactEventIds: [accepted.event.eventId] }), /unrelated attempt/);
  const resolution = await context.append("action.resolved", { schemaVersion: "myflow-lifecycle/v2",
    canonicalStage: "Scope", owningActivity: "scope", observationId: observation.event.observationId,
    linkedEventIds: [entry.event.eventId], linkedAttemptIds: [entry.event.attemptId],
    linkedArtifactEventIds: [accepted.event.eventId] });
  assert.equal(resolution.event.attemptId, null);
  const state = (await validateLifecycleJournal(context.journalPath)).state;
  assert.equal(state.unresolvedObservations.length, 0);
  assert.deepEqual(state.observations[0].resolution.linkedAttemptIds, [entry.event.attemptId]);
  assert.deepEqual((await readFile(context.journalPath)).subarray(0, before.length), before);
});

test("observations reject invalid sources, evidence, false completion, and conflicting retries", async () => {
  const context = await fixture(); await createAndEnterScope(context);
  await assert.rejects(observed(context, { sourceAttemptId: "attempt_missing" }), /unknown source attempt/);
  await assert.rejects(observed(context, { intendedAction: "stage.completed" }), /completion claim/);
  await assert.rejects(observed(context, { actualFinding: "" }), /actualFinding/);
  const first = await observed(context, { idempotencyKey: "same-observation" });
  const retry = await observed(context, { idempotencyKey: "same-observation" });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.event.observationId, first.event.observationId);
  await assert.rejects(observed(context, { idempotencyKey: "same-observation", actualFinding: "different" }),
    /rewrite a historical event/);
  const text = await readFile(context.journalPath, "utf8");
  await writeFile(context.journalPath, text.replace('"unresolvedReason":"awaiting correction route"',
    '"unresolvedReason":"altered"'));
  assert.equal((await validateLifecycleJournal(context.journalPath)).valid, false);
});

test("a suspended detecting attempt resumes only after a digested impact assessment; route is not its pending Verify gate", async () => {
  const context = await fixture(); await reachVerify(context);
  const verify = (await validateLifecycleJournal(context.journalPath)).state.currentAttemptId;
  await context.append("return.opened", { canonicalStage: "Verify", owningActivity: "verification",
    episodeId: "return-1", detectingStage: "Verify", detectingActivity: "verification",
    initialOwningStage: "Implement", initialOwningActivity: "phase", originAttemptId: verify,
    triggerSource: "verification-evidence", changeKind: "implementation", evidenceRefs: ["failed check"] });
  await context.append("attempt.suspended", { schemaVersion: "myflow-lifecycle/v2", canonicalStage: "Verify",
    owningActivity: "verification", episodeId: "return-1" });
  await context.append("stage.entered", { canonicalStage: "Implement", owningActivity: "phase" });
  await context.append("return.owner-ready", { canonicalStage: "Implement", owningActivity: "phase", episodeId: "return-1" });
  await context.append("stage.completed", { canonicalStage: "Implement", owningActivity: "phase", terminalReason: "advanced" });
  await assert.rejects(context.append("attempt.resumed", { schemaVersion: "myflow-lifecycle/v2",
    canonicalStage: "Verify", owningActivity: "verification", episodeId: "return-1" }), /assessment/);
  await context.append("attempt.assessed", { schemaVersion: "myflow-lifecycle/v2", canonicalStage: "Verify",
    owningActivity: "verification", episodeId: "return-1", disposition: "resume",
    reusableEvidence: ["previous plan"], invalidatedEvidence: ["failing check"], rerunChecks: ["test"],
    artifactPath: ".myflow/workstreams/journal-fixture/workstream.md" });
  await context.append("attempt.resumed", { schemaVersion: "myflow-lifecycle/v2", canonicalStage: "Verify",
    owningActivity: "verification", episodeId: "return-1" });
  await context.append("return.resumed", { canonicalStage: "Verify", owningActivity: "verification", episodeId: "return-1" });
  const state = (await validateLifecycleJournal(context.journalPath)).state;
  assert.equal(state.currentAttemptId, verify);
  assert.equal(state.attempts.filter(({ canonicalStage }) => canonicalStage === "Verify").length, 1);
  assert.equal(state.activeRouteEpisodeId, null);
  assert.deepEqual(state.pendingVerificationEpisodeIds, ["return-1"]);
  assert.deepEqual(state.nextLegalActions, ["verification.completed"]);
  await assert.rejects(context.append("return.closed", { canonicalStage: "Verify", owningActivity: "verification",
    episodeId: "return-1" }), /passing re-verification/);
  await context.append("verification.completed", { canonicalStage: "Verify", owningActivity: "verification",
    episodeId: "return-1", verificationStatus: "passed" });
  await context.append("return.closed", { canonicalStage: "Verify", owningActivity: "verification",
    episodeId: "return-1" });
  assert.deepEqual((await validateLifecycleJournal(context.journalPath)).state.pendingVerificationEpisodeIds, []);
  await context.append("stage.completed", { canonicalStage: "Verify", owningActivity: "verification",
    terminalReason: "advanced" });
  await context.append("stage.entered", { canonicalStage: "Close", owningActivity: "closeout" });
  assert.equal((await validateLifecycleJournal(context.journalPath)).state.currentStage, "Close");
});

test("legacy v1 retry after terminal transition leaves original bytes and receipt unchanged", async () => {
  const context = await fixture(); await createAndEnterScope(context);
  const values = { canonicalStage: "Scope", owningActivity: "scope", idempotencyKey: "v1-retry" };
  const original = await context.append("feedback.requested", values);
  await context.append("stage.completed", { canonicalStage: "Scope", owningActivity: "scope", terminalReason: "advanced" });
  const bytes = await readFile(context.journalPath);
  const retry = await context.append("feedback.requested", values);
  assert.equal(retry.duplicate, true);
  assert.deepEqual(retry.event, original.event);
  assert.deepEqual(await readFile(context.journalPath), bytes);
});

test("assessed suspension can supersede the old Verify and enter a linked new Verify", async () => {
  const context = await fixture(); await reachVerify(context);
  const previous = (await validateLifecycleJournal(context.journalPath)).state.currentAttemptId;
  await context.append("return.opened", { canonicalStage: "Verify", owningActivity: "verification",
    episodeId: "return-new-verify", detectingStage: "Verify", detectingActivity: "verification",
    initialOwningStage: "Implement", initialOwningActivity: "phase", originAttemptId: previous,
    triggerSource: "verification-evidence", changeKind: "implementation", evidenceRefs: ["failure"] });
  await context.append("attempt.suspended", { canonicalStage: "Verify", owningActivity: "verification", episodeId: "return-new-verify" });
  await context.append("stage.entered", { canonicalStage: "Implement", owningActivity: "phase" });
  await context.append("return.owner-ready", { canonicalStage: "Implement", owningActivity: "phase", episodeId: "return-new-verify" });
  await context.append("stage.completed", { canonicalStage: "Implement", owningActivity: "phase", terminalReason: "advanced" });
  await context.append("attempt.assessed", { canonicalStage: "Verify", owningActivity: "verification",
    episodeId: "return-new-verify", disposition: "supersede", reusableEvidence: [],
    invalidatedEvidence: ["review"], rerunChecks: ["full review"],
    artifactPath: ".myflow/workstreams/journal-fixture/workstream.md" });
  await assert.rejects(context.append("attempt.resumed", { canonicalStage: "Verify", owningActivity: "verification",
    episodeId: "return-new-verify" }), /matching assessment/);
  await context.append("attempt.superseded", { canonicalStage: "Verify", owningActivity: "verification",
    episodeId: "return-new-verify" });
  await context.append("stage.entered", { canonicalStage: "Verify", owningActivity: "verification" });
  await context.append("return.resumed", { canonicalStage: "Verify", owningActivity: "verification", episodeId: "return-new-verify" });
  const state = (await validateLifecycleJournal(context.journalPath)).state;
  assert.equal(state.attempts.find(({ attemptId }) => attemptId === previous).status, "superseded");
  assert.equal(state.attempts.filter(({ canonicalStage }) => canonicalStage === "Verify").length, 2);
  assert.deepEqual(state.pendingVerificationEpisodeIds, ["return-new-verify"]);
});
