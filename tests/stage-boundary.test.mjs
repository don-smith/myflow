import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { KNOWN_HOSTS, detectExecutionRef } from "../skills/myflow/scripts/lib/host-detection.mjs";
import { validateLifecycleJournal } from "../skills/myflow/scripts/lib/lifecycle-store.mjs";
import { stageBoundaryKey } from "../skills/myflow/scripts/stage-boundary.mjs";

const execFile = promisify(execFileCallback);
const boundary = new URL("../skills/myflow/scripts/stage-boundary.mjs", import.meta.url).pathname;
const cli = new URL("../skills/myflow/scripts/cli.mjs", import.meta.url).pathname;
const IDENTITY = ["github.com", "acme", "widgets"];
const WORKSTREAM = "boundary-demo";

/** The environment variables every known host reads, cleared so a test never inherits the developer's session. */
const HOST_VARIABLES = KNOWN_HOSTS.map(({ sessionVariable }) => sessionVariable);

async function git(cwd, env, ...args) {
  const { stdout } = await execFile("git", args, { cwd, env });
  return stdout.trim();
}

/** A temporary MyFlow home, product repository, and local bare remote, following `artifact-store.test.mjs`. */
async function fixture({ remote = true } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "myflow-stage-boundary-")));
  const home = join(root, "myflow-home");
  const globalConfig = join(root, "gitconfig");
  // Auto-gc in the bare remote outlives the push and races the fixture teardown.
  await writeFile(globalConfig, "[gc]\n\tauto = 0\n\tautoDetach = false\n");
  const env = { ...process.env };
  for (const name of HOST_VARIABLES) delete env[name];
  Object.assign(env, {
    MYFLOW_HOME: home,
    HOME: join(root, "user-home"),
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  });

  const repo = join(root, "project");
  await mkdir(repo);
  await git(repo, env, "init", "--quiet", "-b", "main");
  await git(repo, env, "remote", "add", "origin", "https://github.com/acme/widgets.git");
  await writeFile(join(repo, "README.md"), "product\n");
  await git(repo, env, "add", "README.md");
  await git(repo, env, "commit", "--quiet", "-m", "initial");

  let remotePath;
  if (remote) {
    remotePath = join(root, "artifacts.git");
    await git(root, env, "init", "--quiet", "--bare", "-b", "main", remotePath);
  }
  const workstreamRoot = join(home, "repositories", ...IDENTITY, "workstreams");
  const workstreamDirectory = join(workstreamRoot, WORKSTREAM);
  const context = {
    root,
    home,
    env,
    repo,
    remotePath,
    workstreamRoot,
    workstreamDirectory,
    journalPath: join(workstreamDirectory, "lifecycle", "events.jsonl"),
    feedbackPath: join(workstreamDirectory, "feedback", "events.jsonl"),
  };
  await mkdir(workstreamDirectory, { recursive: true });
  await writeFile(join(workstreamDirectory, "workstream.md"), "# Boundary demo\n");
  await execFile(process.execPath, [cli, "artifacts", "init", "--location", "home", ...(remote ? ["--remote", remotePath] : ["--no-remote"]), "--cwd", repo], { env });
  return context;
}

async function run(context, ...args) {
  const { stdout } = await execFile(
    process.execPath,
    [boundary, ...args, "--workstream", WORKSTREAM, "--repository-root", context.repo],
    { env: context.env, cwd: context.repo },
  );
  return JSON.parse(stdout);
}

const kinds = (receipt) => receipt.events.map(({ kind }) => kind);
const duplicates = (receipt) => receipt.events.map(({ duplicate }) => duplicate);

async function remoteFiles(context) {
  const output = await git(context.root, context.env, "--git-dir", context.remotePath, "ls-tree", "-r", "--name-only", "main");
  return output.split("\n").filter(Boolean);
}

test("enter, accept, and exit produce a valid journal", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  const entered = await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  assert.deepEqual(kinds(entered), ["workstream.created", "stage.entered", "activity.entered"]);

  await mkdir(join(context.workstreamDirectory, "scope"), { recursive: true });
  await writeFile(join(context.workstreamDirectory, "scope", "alignment.md"), "# Alignment\n");
  const accepted = await run(context, "accept", "--stage", "Scope", "--activity", "scope", "--artifact", "scope/alignment.md");
  assert.deepEqual(kinds(accepted), ["artifact.accepted"]);

  const exited = await run(context, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "smooth");
  assert.deepEqual(kinds(exited), [
    "feedback.requested",
    "feedback.recorded",
    "activity.completed",
    "stage.completed",
  ]);
  assert.equal(exited.feedback.status, "recorded");

  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.eventCount, 8);
  assert.equal(validation.state.attempts[0].terminalReason, "advanced");
});

test("rerunning each command changes nothing", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  await mkdir(join(context.workstreamDirectory, "scope"), { recursive: true });
  await writeFile(join(context.workstreamDirectory, "scope", "alignment.md"), "# Alignment\n");

  const invocations = [
    ["enter", "--stage", "Scope", "--activity", "scope"],
    ["accept", "--stage", "Scope", "--activity", "scope", "--artifact", "scope/alignment.md"],
    ["exit", "--stage", "Scope", "--activity", "scope", "--feedback", "rough", "--note", "The resolver was hard to find."],
  ];
  for (const invocation of invocations) {
    await run(context, ...invocation);
    const journal = await readFile(context.journalPath, "utf8");
    const receipt = await run(context, ...invocation);
    assert.ok(
      duplicates(receipt).every(Boolean),
      `rerunning ${invocation[0]} must append nothing: ${JSON.stringify(receipt.events)}`,
    );
    assert.equal(await readFile(context.journalPath, "utf8"), journal, `${invocation[0]} rewrote the journal`);
  }
  const records = (await readFile(context.feedbackPath, "utf8")).trim().split("\n");
  assert.equal(records.length, 1, "the private feedback store holds one record for the attempt");
  assert.equal((await validateLifecycleJournal(context.journalPath)).valid, true);
});

test("Implement's pending feedback is reported and answered at Verify entry", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  await run(context, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "smooth");
  await run(context, "enter", "--stage", "Plan", "--activity", "planning");
  await run(context, "exit", "--stage", "Plan", "--activity", "planning", "--feedback", "smooth");

  await run(context, "enter", "--stage", "Implement", "--activity", "phase", "--label", "phase-1");
  const secondPhase = await run(context, "enter", "--stage", "Implement", "--activity", "phase", "--label", "phase-2");
  assert.deepEqual(kinds(secondPhase), ["stage.entered", "activity.completed", "activity.entered"]);
  assert.equal(secondPhase.events[0].duplicate, true, "the Implement attempt is entered once");

  const implementExit = await run(context, "exit", "--stage", "Implement", "--activity", "phase", "--feedback", "pending");
  assert.deepEqual(kinds(implementExit), ["feedback.recorded", "activity.completed", "stage.completed"]);
  assert.equal(implementExit.feedback.status, "pending");

  const verifyEntry = await run(context, "enter", "--stage", "Verify", "--activity", "verification");
  assert.equal(verifyEntry.pendingFeedback.canonicalStage, "Implement");
  assert.equal(verifyEntry.pendingFeedback.attemptOrdinal, 1);
  assert.ok(!verifyEntry.feedback, "entry only reports the deferred request; it does not answer it");

  const answered = await run(
    context,
    "enter",
    "--stage",
    "Verify",
    "--activity",
    "verification",
    "--feedback",
    "some-friction",
    "--note",
    "Two phases needed a rerun.",
  );
  assert.equal(answered.feedback.status, "recorded", JSON.stringify(answered.feedback));
  assert.equal(answered.feedback.attemptId, verifyEntry.pendingFeedback.attemptId);
  assert.deepEqual(kinds(answered), [
    "stage.entered",
    "feedback.requested",
    "feedback.recorded",
    "activity.entered",
  ]);

  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  const implementAttempt = validation.state.attempts.find(({ canonicalStage }) => canonicalStage === "Implement");
  const coverage = validation.state.feedback.filter(({ attemptId }) => attemptId === implementAttempt.attemptId);
  assert.deepEqual(coverage.map(({ status }) => status), ["pending", "requested", "recorded"]);

  const records = (await readFile(context.feedbackPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const answers = records.filter((record) => record.attemptId === implementAttempt.attemptId);
  assert.deepEqual(answers.map(({ status }) => status), ["pending", "recorded"]);
  assert.equal(answers[1].rating, "some-friction");
  assert.equal(answers[1].note, "Two phases needed a rerun.");
});

test("feedback lands under the workstream's feedback folder and syncs with it", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  const exited = await run(context, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "some-friction", "--note", "The map was stale.");

  assert.equal(exited.feedback.privateRef, `feedback/events.jsonl#${exited.feedback.privateRef.split("#")[1]}`);
  const record = JSON.parse((await readFile(context.feedbackPath, "utf8")).trim());
  assert.equal(record.rating, "some-friction");
  assert.equal(record.note, "The map was stale.");
  assert.equal(record.canonicalStage, "Scope");
  assert.equal(record.context.governingSkill.name, "scope");

  assert.equal(exited.sync.ok, true, JSON.stringify(exited.sync));
  const files = await remoteFiles(context);
  const prefix = `repositories/${IDENTITY.join("/")}/workstreams/${WORKSTREAM}`;
  assert.ok(files.includes(`${prefix}/feedback/events.jsonl`), files.join("\n"));
  assert.ok(files.includes(`${prefix}/lifecycle/events.jsonl`), files.join("\n"));

  // The rating and the note stay private: only coverage status and a reference reach the journal.
  const journal = await readFile(context.journalPath, "utf8");
  assert.doesNotMatch(journal, /some-friction|The map was stale/);
});

test("a failing remote reports the failure without failing the boundary", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  await rm(context.remotePath, { recursive: true, force: true });

  const exited = await run(context, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "smooth");
  assert.equal(exited.sync.ok, false);
  assert.ok(JSON.stringify(exited.sync).length > 0, "the sync failure is reported in the receipt");
  assert.deepEqual(kinds(exited), ["feedback.requested", "feedback.recorded", "activity.completed", "stage.completed"]);
  assert.equal((await validateLifecycleJournal(context.journalPath)).valid, true);

  const report = JSON.parse(
    (await execFile(process.execPath, [cli, "artifacts", "status", "--cwd", context.repo], { env: context.env })).stdout,
  );
  assert.deepEqual(report.unsynced, [WORKSTREAM], "the unsynced workstream is left for status");
});

test("host detection records executionRef only when a known session variable is set", async (t) => {
  assert.equal(detectExecutionRef({}), undefined);
  assert.equal(detectExecutionRef({ PI_SESSION_ID: "   " }), undefined);
  assert.deepEqual(detectExecutionRef({ PI_SESSION_ID: "abc" }), { host: "pi", emittingSessionId: "abc" });
  for (const { host, sessionVariable } of KNOWN_HOSTS) {
    assert.deepEqual(detectExecutionRef({ [sessionVariable]: "session-1" }), { host, emittingSessionId: "session-1" });
  }

  const context = await fixture({ remote: false });
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  const withoutHost = await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  assert.equal(withoutHost.executionRef, undefined);

  context.env.PI_SESSION_ID = "pi-session-7";
  const withHost = await run(context, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "skipped");
  assert.deepEqual(withHost.executionRef, { host: "pi", emittingSessionId: "pi-session-7" });

  const events = (await readFile(context.journalPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events[0].executionRef, undefined);
  assert.deepEqual(events.at(-1).executionRef, { host: "pi", emittingSessionId: "pi-session-7" });
  assert.equal((await validateLifecycleJournal(context.journalPath)).valid, true);
});

test("idempotency keys are derived, stage-scoped where the stage owns the event, and bounded", async () => {
  const base = {
    workstreamId: "boundary-demo",
    canonicalStage: "Plan",
    attemptOrdinal: 1,
    owningActivity: "planning",
    action: "activity-entered",
  };
  assert.equal(stageBoundaryKey(base), "boundary-demo.plan.a1.planning.activity-entered");
  assert.equal(stageBoundaryKey({ ...base, attemptOrdinal: 2 }), "boundary-demo.plan.a2.planning.activity-entered");
  assert.notEqual(stageBoundaryKey({ ...base, detail: "phase-1" }), stageBoundaryKey({ ...base, detail: "phase-2" }));
  assert.equal(stageBoundaryKey({ ...base, detail: "phase-1" }), stageBoundaryKey({ ...base, detail: "phase-1" }));

  const long = stageBoundaryKey({ ...base, workstreamId: "w".repeat(120), detail: "x".repeat(400) });
  assert.ok(long.length <= 128, `derived key must stay within the private store's limit: ${long.length}`);
  assert.match(long, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
});

test("the return subcommand wraps a correction episode end to end", async (t) => {
  const context = await fixture({ remote: false });
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  await run(context, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "smooth");
  await run(context, "enter", "--stage", "Plan", "--activity", "planning");

  const opened = await run(
    context,
    "return",
    "--stage",
    "Plan",
    "--activity",
    "planning",
    "--owning-stage",
    "Scope",
    "--owning-activity",
    "scope",
    "--trigger-source",
    "developer-report",
    "--change-kind",
    "outcome-or-acceptance",
    "--evidence-ref",
    "plan/2026-09-17_demo.md",
  );
  assert.deepEqual(kinds(opened), ["return.opened"]);
  const reopened = await run(
    context,
    "return",
    "--stage",
    "Plan",
    "--activity",
    "planning",
    "--owning-stage",
    "Scope",
    "--owning-activity",
    "scope",
    "--trigger-source",
    "developer-report",
    "--change-kind",
    "outcome-or-acceptance",
    "--evidence-ref",
    "plan/2026-09-17_demo.md",
  );
  assert.equal(reopened.episodeId, opened.episodeId, "the episode ID is derived, so a rerun reuses it");
  assert.equal(reopened.events[0].duplicate, true);

  await run(context, "exit", "--stage", "Plan", "--activity", "planning", "--feedback", "rough", "--terminal-reason", "superseded");
  await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  const ready = await run(context, "return", "--event", "owner-ready", "--stage", "Scope", "--activity", "scope");
  assert.deepEqual(kinds(ready), ["return.owner-ready"]);
  assert.equal(ready.episodeId, opened.episodeId, "the open episode is found without being named");

  await run(context, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "smooth");
  await run(context, "enter", "--stage", "Plan", "--activity", "planning");
  const resumed = await run(context, "return", "--event", "resumed", "--stage", "Plan", "--activity", "planning");
  assert.deepEqual(kinds(resumed), ["return.resumed"]);

  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.state.returnEpisodeCount, 1);
  assert.equal(validation.state.stageReturnCount, 1);
});

test("a Close exit ends the workstream in one command", async (t) => {
  const context = await fixture({ remote: false });
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  for (const [stage, activity] of [
    ["Scope", "scope"],
    ["Plan", "planning"],
    ["Implement", "phase"],
    ["Verify", "verification"],
    ["Close", "closeout"],
  ]) {
    await run(context, "enter", "--stage", stage, "--activity", activity);
    const terminal = stage === "Close" ? ["--terminal-reason", "workstream-closed"] : [];
    await run(context, "exit", "--stage", stage, "--activity", activity, "--feedback", "smooth", ...terminal);
  }

  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(validation.state.closed, true);
  assert.equal(validation.state.feedback.filter(({ status }) => status === "recorded").length, 5);
});

test("one stage attempt takes a second activity, in Plan and in Verify", async (t) => {
  const context = await fixture();
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  // Scope: `scope` opens the attempt and `research` continues it, the pair
  // `skills/scope/SKILL.md` documents. It shares `stage.entered`'s duplicate path with the
  // other two stages, so it is asserted here rather than assumed from them.
  await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  const research = await run(context, "enter", "--stage", "Scope", "--activity", "research");
  assert.deepEqual(kinds(research), ["stage.entered", "activity.completed", "activity.entered"]);
  assert.equal(research.events[0].duplicate, true, "the Scope attempt is entered once, whatever the activity");
  await run(context, "exit", "--stage", "Scope", "--activity", "research", "--feedback", "smooth");

  // Plan: `design` opens the attempt and `planning` continues it, the sequence `design` and
  // `plan` both document. Its `source` differs between the two activities, so a second
  // `stage.entered` built from the passed activity misses the duplicate lookup entirely and
  // the reducer rejects it as an overlapping open attempt.
  await run(context, "enter", "--stage", "Plan", "--activity", "design");
  const planning = await run(context, "enter", "--stage", "Plan", "--activity", "planning");
  assert.deepEqual(kinds(planning), ["stage.entered", "activity.completed", "activity.entered"]);
  assert.equal(planning.events[0].duplicate, true, "the Plan attempt is entered once, whatever the activity");
  await run(context, "exit", "--stage", "Plan", "--activity", "planning", "--feedback", "smooth");

  await run(context, "enter", "--stage", "Implement", "--activity", "phase", "--label", "phase-1");
  await run(context, "exit", "--stage", "Implement", "--activity", "phase", "--feedback", "pending");

  // Verify: `verification` opens the attempt and `review` continues it. Here the two
  // activities share a `source`, so the duplicate is found and the failure was the
  // historical-rewrite guard instead.
  await run(context, "enter", "--stage", "Verify", "--activity", "verification");
  const review = await run(context, "enter", "--stage", "Verify", "--activity", "review");
  assert.deepEqual(kinds(review), ["stage.entered", "activity.completed", "activity.entered"]);
  assert.equal(review.events[0].duplicate, true, "the Verify attempt is entered once, whatever the activity");

  const validation = await validateLifecycleJournal(context.journalPath);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const attemptsFor = (stage) => validation.state.attempts.filter(({ canonicalStage }) => canonicalStage === stage);
  const activitiesFor = (stage) =>
    validation.state.activities
      .filter(({ canonicalStage }) => canonicalStage === stage)
      .map(({ owningActivity }) => owningActivity);

  assert.deepEqual(attemptsFor("Plan").map(({ openingActivity }) => openingActivity), ["design"]);
  assert.deepEqual(activitiesFor("Plan"), ["design", "planning"]);
  assert.deepEqual(attemptsFor("Verify").map(({ openingActivity }) => openingActivity), ["verification"]);
  assert.deepEqual(activitiesFor("Verify"), ["verification", "review"]);
  assert.deepEqual(attemptsFor("Scope").map(({ openingActivity }) => openingActivity), ["scope"]);
  assert.deepEqual(activitiesFor("Scope"), ["scope", "research"]);
});

test("rerunning a subcommand from a different host session is still a duplicate", async (t) => {
  const context = await fixture({ remote: false });
  t.after(() => rm(context.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }));

  // MyFlow stages span sessions by construction: a stage entered in one session is resumed
  // in another, and `executionRef` — the one field that varies between them — is set from
  // the environment with no option controlling it. Every other test in this file runs with
  // every host session variable deleted, which pins that field at the single value under
  // which a cross-session rerun cannot differ. These runs vary it deliberately.
  const runAs = (session, ...args) =>
    run({ ...context, env: { ...context.env, ...(session ? { CLAUDE_CODE_SESSION_ID: session } : {}) } }, ...args);
  const refOf = (session) => ({ host: "claude-code", emittingSessionId: session });

  // absent -> set. The workstream's first entry carries no execution reference at all.
  const opened = await run(context, "enter", "--stage", "Scope", "--activity", "scope");
  assert.equal(opened.executionRef, undefined);
  const reopened = await runAs("claude-session-a", "enter", "--stage", "Scope", "--activity", "scope");
  assert.deepEqual(reopened.executionRef, refOf("claude-session-a"));
  assert.ok(duplicates(reopened).every(Boolean), `the identical enter must be a duplicate: ${JSON.stringify(reopened.events)}`);

  // set -> a different set, the shape a resumed stage actually takes.
  const reopenedAgain = await runAs("claude-session-b", "enter", "--stage", "Scope", "--activity", "scope");
  assert.ok(duplicates(reopenedAgain).every(Boolean), `a third session must also be a duplicate: ${JSON.stringify(reopenedAgain.events)}`);

  // A non-`enter` subcommand, reran across two sessions.
  const alignment = join(context.workstreamDirectory, "scope", "alignment.md");
  await mkdir(join(context.workstreamDirectory, "scope"), { recursive: true });
  await writeFile(alignment, "# Alignment\n");
  const accept = ["accept", "--stage", "Scope", "--activity", "scope", "--artifact", "scope/alignment.md"];
  await runAs("claude-session-a", ...accept);
  const acceptedAgain = await runAs("claude-session-b", ...accept);
  assert.ok(duplicates(acceptedAgain).every(Boolean), `accept must be a duplicate across sessions: ${JSON.stringify(acceptedAgain.events)}`);

  // The load-bearing half of the same guard is untouched: when the artifact's bytes change,
  // the rerun is a rewrite of history and is refused, from any session.
  await writeFile(alignment, "# Alignment, revised\n");
  await assert.rejects(
    () => runAs("claude-session-c", ...accept),
    /would rewrite a historical event/,
    "accept after the artifact changes must still fail on the digest",
  );
  await writeFile(alignment, "# Alignment\n");

  // set -> absent, the direction that is not a workaround either.
  const exit = ["exit", "--stage", "Scope", "--activity", "scope", "--feedback", "smooth"];
  await runAs("claude-session-a", ...exit);
  const exitedAgain = await runAs(null, ...exit);
  assert.ok(duplicates(exitedAgain).every(Boolean), `exit must be a duplicate with the variable unset: ${JSON.stringify(exitedAgain.events)}`);

  // The documented mid-stage activity switch, across a session boundary.
  await runAs("claude-session-a", "enter", "--stage", "Plan", "--activity", "design");
  const planning = await runAs("claude-session-b", "enter", "--stage", "Plan", "--activity", "planning");
  assert.deepEqual(kinds(planning), ["stage.entered", "activity.completed", "activity.entered"]);
  assert.equal(planning.events[0].duplicate, true, "the Plan attempt is entered once, whatever session continues it");

  // The journal keeps the first emitter's provenance and discards every later candidate.
  const events = (await readFile(context.journalPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const entered = (stage) => events.find(({ kind, canonicalStage }) => kind === "stage.entered" && canonicalStage === stage);
  assert.equal(entered("Scope").executionRef, undefined, "the first Scope entry had no execution reference and keeps none");
  assert.deepEqual(entered("Plan").executionRef, refOf("claude-session-a"), "the Plan entry keeps its first emitter");
  assert.equal((await validateLifecycleJournal(context.journalPath)).valid, true);
});

async function evidence(context, path = "finding.md") {
  await writeFile(join(context.workstreamDirectory, path), `# ${path}\n`);
  return path;
}

async function journeyToVerify(context) {
  for (const [stage, activity] of [["Scope", "scope"], ["Plan", "planning"], ["Implement", "phase"]]) {
    await run(context, "enter", "--stage", stage, "--activity", activity);
    await run(context, "exit", "--stage", stage, "--activity", activity, "--feedback", "skipped");
  }
  return run(context, "enter", "--stage", "Verify", "--activity", "verification");
}

test("intent-first correction resumes Verify with an immutable observation and safe cross-session retry", async (t) => {
  const c = await fixture({ remote: false });
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await journeyToVerify(c);
  await evidence(c);
  const intent = ["correct", "--action", "route", "--stage", "Verify", "--activity", "verification", "--artifact", "finding.md", "--finding", "failed check", "--owner", "implementer", "--owning-stage", "Implement", "--owning-activity", "phase", "--trigger-source", "verification-evidence", "--change-kind", "implementation"];
  const initial = await run(c, ...intent);
  assert.equal(initial.disposition, "canonical");
  assert.deepEqual(kinds(initial).slice(0, 2), ["action.observed", "correction.opened"]);
  assert.match(initial.observationId, /^observation_/);
  assert.equal(initial.currentAttempt.canonicalStage, "Implement");
  const before = await readFile(c.journalPath, "utf8");
  c.env.PI_SESSION_ID = "later-session";
  const retry = await run(c, ...intent);
  assert.equal(retry.observationId, initial.observationId);
  assert.equal(retry.disposition, "canonical");
  assert.equal(await readFile(c.journalPath, "utf8"), before);
  await assert.rejects(run(c, ...intent.map((arg) => arg === "failed check" ? "changed finding" : arg)), /rewrite|conflict/);

  await run(c, "correct", "--action", "ready", "--stage", "Implement", "--activity", "phase", "--episode-id", initial.episodeId);
  await run(c, "exit", "--stage", "Implement", "--activity", "phase", "--feedback", "skipped");
  const afterOwnerExit = await run(c, ...intent);
  assert.equal(afterOwnerExit.disposition, "canonical", "retry after owner exit retains the original route");
  assert.equal(afterOwnerExit.observationId, initial.observationId);
  await run(c, "correct", "--action", "assess", "--stage", "Verify", "--activity", "verification", "--episode-id", initial.episodeId,
    "--artifact", "finding.md", "--disposition", "resume", "--rerun-check", "fresh check");
  const resumed = await run(c, "correct", "--action", "resume", "--stage", "Verify", "--activity", "verification", "--episode-id", initial.episodeId);
  assert.equal(resumed.currentAttempt.attemptId, initial.sourceAttempt.attemptId);
  const state = (await validateLifecycleJournal(c.journalPath)).state;
  assert.deepEqual(state.pendingVerificationEpisodeIds, [initial.episodeId]);
  await run(c, "correct", "--action", "pass", "--stage", "Verify", "--activity", "verification", "--episode-id", initial.episodeId);
  await run(c, "correct", "--action", "close", "--stage", "Verify", "--activity", "verification", "--episode-id", initial.episodeId);
  assert.equal((await validateLifecycleJournal(c.journalPath)).state.returns[0].status, "closed");
});

test("record-only provisional correction reconciles later truthful attempts, not historical bytes", async (t) => {
  const c = await fixture({ remote: false });
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await journeyToVerify(c);
  await evidence(c);
  const provisional = await run(c, "correct", "--action", "route", "--stage", "Verify", "--activity", "verification", "--artifact", "finding.md", "--finding", "uncertain owner", "--owner", "researcher", "--owning-stage", "Scope", "--owning-activity", "scope", "--trigger-source", "developer-report", "--change-kind", "implementation");
  assert.equal(provisional.disposition, "provisional");
  assert.deepEqual(kinds(provisional), ["action.observed"]);
  assert.equal(provisional.currentAttempt.canonicalStage, "Verify");
  assert.equal(provisional.unresolvedIds.length, 1);
  assert.ok(provisional.nextAction);
  const original = await readFile(c.journalPath, "utf8");
  const routed = await run(c, "correct", "--action", "route", "--stage", "Verify", "--activity", "verification", "--observation-id", provisional.observationId,
    "--owning-stage", "Implement", "--owning-activity", "phase", "--trigger-source", "developer-report", "--change-kind", "implementation");
  assert.equal(routed.disposition, "canonical");
  assert.ok((await readFile(c.journalPath, "utf8")).startsWith(original));
  assert.equal((await validateLifecycleJournal(c.journalPath)).state.unresolvedObservations.length, 1);
});

test("named next slice starts Plan without correction or invented acceptance", async (t) => {
  const c = await fixture({ remote: false });
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await evidence(c, "scope.md"); await evidence(c, "design.md"); await evidence(c, "plan.md");
  await run(c, "enter", "--stage", "Scope", "--activity", "scope");
  const scope = await run(c, "accept", "--stage", "Scope", "--activity", "scope", "--artifact", "scope.md");
  await run(c, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "skipped");
  await run(c, "enter", "--stage", "Plan", "--activity", "design");
  const design = await run(c, "accept", "--stage", "Plan", "--activity", "design", "--artifact", "design.md");
  await run(c, "enter", "--stage", "Plan", "--activity", "planning");
  const plan = await run(c, "accept", "--stage", "Plan", "--activity", "planning", "--artifact", "plan.md");
  await run(c, "exit", "--stage", "Plan", "--activity", "planning", "--feedback", "skipped");
  await run(c, "enter", "--stage", "Implement", "--activity", "phase");
  await run(c, "exit", "--stage", "Implement", "--activity", "phase", "--feedback", "skipped");
  await run(c, "enter", "--stage", "Verify", "--activity", "verification");
  const journal = new URL("../skills/myflow/scripts/lifecycle-journal.mjs", import.meta.url).pathname;
  await execFile(process.execPath, [journal, "verification-completed", "--workstream-id", WORKSTREAM, "--repository-root", c.repo, "--stage", "Verify", "--activity", "verification", "--source", "verify", "--idempotency-key", "initial-pass", "--verification-status", "passed"], { env: c.env });
  await run(c, "exit", "--stage", "Verify", "--activity", "verification", "--feedback", "skipped");
  const next = await run(c, "slice", "--stage", "Plan", "--activity", "planning", "--slice", "rollout-east", "--artifact", "plan.md",
    "--planning-basis", plan.events[0].eventId, "--scope-basis", scope.events[0].eventId, "--design-basis", design.events[0].eventId);
  assert.equal(next.disposition, "canonical");
  assert.deepEqual(kinds(next).slice(0, 2), ["action.observed", "slice.started"]);
  assert.equal(next.currentAttempt.canonicalStage, "Plan");
  const repeated = await run(c, "slice", "--stage", "Plan", "--activity", "planning", "--slice", "rollout-east", "--artifact", "plan.md",
    "--planning-basis", plan.events[0].eventId, "--scope-basis", scope.events[0].eventId, "--design-basis", design.events[0].eventId);
  assert.equal(repeated.observationId, next.observationId);
  assert.equal(repeated.disposition, "canonical");
  assert.equal((await validateLifecycleJournal(c.journalPath)).state.slices[0].status, "planning");
});

test("ended attempt rejects new accept, enter and exit without claiming a stage", async (t) => {
  const c = await fixture({ remote: false });
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await evidence(c);
  await run(c, "enter", "--stage", "Scope", "--activity", "scope");
  await run(c, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "skipped");
  const before = await readFile(c.journalPath, "utf8");
  await assert.rejects(run(c, "enter", "--stage", "Scope", "--activity", "scope"), /ended|terminal/);
  await assert.rejects(run(c, "accept", "--stage", "Scope", "--activity", "scope", "--artifact", "finding.md"), /ended|terminal/);
  await assert.rejects(run(c, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "smooth"), /conflict|ended|terminal/);
  assert.equal(await readFile(c.journalPath, "utf8"), before);
});

test("completed Scope revision and linked resolution have no fictional Plan visit", async (t) => {
  const c = await fixture({ remote: false });
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await evidence(c);
  await run(c, "enter", "--stage", "Scope", "--activity", "scope");
  await run(c, "exit", "--stage", "Scope", "--activity", "scope", "--feedback", "skipped");
  const original = (await validateLifecycleJournal(c.journalPath)).state.attempts[0].attemptId;
  const revised = await run(c, "correct", "--action", "revise", "--stage", "Scope", "--activity", "scope", "--artifact", "finding.md",
    "--finding", "new research", "--owner", "scope owner");
  assert.equal(revised.disposition, "canonical");
  assert.deepEqual(kinds(revised).slice(0, 3), ["action.observed", "revision.opened", "stage.entered"]);
  assert.equal(revised.currentAttempt.canonicalStage, "Scope");
  const accepted = await run(c, "accept", "--stage", "Scope", "--activity", "scope", "--artifact", "finding.md");
  const transition = revised.events.find(({ kind }) => kind === "stage.entered");
  const resolved = await run(c, "correct", "--action", "resolve", "--stage", "Scope", "--activity", "scope",
    "--observation-id", revised.observationId, "--linked-event", transition.eventId,
    "--linked-attempt", revised.currentAttempt.attemptId, "--linked-artifact-event", accepted.events[0].eventId);
  assert.deepEqual(resolved.unresolvedIds, []);
  const state = (await validateLifecycleJournal(c.journalPath)).state;
  assert.equal(state.attempts.length, 2);
  assert.equal(state.attempts[1].revisionSourceAttemptId, original);
  assert.equal(state.attempts[0].status, "advanced");
  assert.ok(state.attempts.every(({ canonicalStage }) => canonicalStage === "Scope"));
});

test("nested child validates locally before parent resumes and closes child-first", async (t) => {
  const c = await fixture({ remote: false });
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await journeyToVerify(c);
  await evidence(c); await evidence(c, "child.md");
  const route = async (stage, activity, artifact, ownerStage, ownerActivity, changeKind) => run(c,
    "correct", "--action", "route", "--stage", stage, "--activity", activity, "--artifact", artifact,
    "--finding", artifact, "--owner", "owner", "--owning-stage", ownerStage,
    "--owning-activity", ownerActivity, "--trigger-source", "verification-evidence", "--change-kind", changeKind);
  const parent = await route("Verify", "verification", "finding.md", "Implement", "phase", "implementation");
  const child = await route("Implement", "phase", "child.md", "Plan", "planning", "plan");
  assert.equal(child.disposition, "canonical");
  assert.equal(child.currentAttempt.canonicalStage, "Plan");
  await run(c, "correct", "--action", "ready", "--stage", "Plan", "--activity", "planning", "--episode-id", child.episodeId);
  await run(c, "exit", "--stage", "Plan", "--activity", "planning", "--feedback", "skipped");
  await run(c, "correct", "--action", "assess", "--stage", "Implement", "--activity", "phase", "--episode-id", child.episodeId,
    "--artifact", "child.md", "--disposition", "resume", "--rerun-check", "local test");
  await run(c, "correct", "--action", "resume", "--stage", "Implement", "--activity", "phase", "--episode-id", child.episodeId);
  await run(c, "correct", "--action", "ready", "--stage", "Implement", "--activity", "phase", "--episode-id", parent.episodeId);
  await assert.rejects(run(c, "exit", "--stage", "Implement", "--activity", "phase", "--feedback", "skipped"), /local validation|child/);
  // The child is validated in its resumed detecting attempt before that attempt advances.
  await run(c, "correct", "--action", "validate", "--stage", "Implement", "--activity", "phase", "--episode-id", child.episodeId, "--artifact", "child.md");
  await run(c, "exit", "--stage", "Implement", "--activity", "phase", "--feedback", "skipped");
  const feedback = (await readFile(c.feedbackPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(feedback.filter(({ canonicalStage }) => canonicalStage === "Implement").length, 2,
    "each terminal Implement attempt has one private response, including after a failed exit retry");
  await run(c, "correct", "--action", "assess", "--stage", "Verify", "--activity", "verification", "--episode-id", parent.episodeId,
    "--artifact", "finding.md", "--disposition", "resume", "--rerun-check", "full review");
  await run(c, "correct", "--action", "resume", "--stage", "Verify", "--activity", "verification", "--episode-id", parent.episodeId);
  for (const episodeId of [child.episodeId, parent.episodeId]) {
    await run(c, "correct", "--action", "pass", "--stage", "Verify", "--activity", "verification", "--episode-id", episodeId);
  }
  await assert.rejects(run(c, "correct", "--action", "close", "--stage", "Verify", "--activity", "verification", "--episode-id", parent.episodeId), /child first/);
  await run(c, "correct", "--action", "close", "--stage", "Verify", "--activity", "verification", "--episode-id", child.episodeId);
  await run(c, "correct", "--action", "close", "--stage", "Verify", "--activity", "verification", "--episode-id", parent.episodeId);
  const state = (await validateLifecycleJournal(c.journalPath)).state;
  assert.deepEqual(state.pendingVerificationEpisodeIds, []);
  assert.equal(state.returns[1].parentEpisodeId, parent.episodeId);
});

test("post-terminal finding routes independently of prior pending route", async (t) => {
  const c = await fixture({ remote: false });
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await journeyToVerify(c);
  await evidence(c);
  const older = await run(c, "return", "--stage", "Verify", "--activity", "verification",
    "--owning-stage", "Plan", "--owning-activity", "planning", "--trigger-source", "verification-evidence", "--change-kind", "plan");
  const terminal = await run(c, "exit", "--stage", "Verify", "--activity", "verification", "--feedback", "skipped", "--terminal-reason", "superseded");
  const routed = await run(c, "correct", "--action", "route", "--stage", "Verify", "--activity", "verification", "--artifact", "finding.md",
    "--finding", "separate implementation defect", "--owner", "implementer", "--owning-stage", "Implement", "--owning-activity", "phase",
    "--trigger-source", "developer-report", "--change-kind", "implementation");
  assert.equal(routed.disposition, "canonical");
  assert.equal(routed.sourceAttempt.attemptId, terminal.events.at(-1).attemptId);
  assert.equal(routed.currentAttempt.canonicalStage, "Implement");
  const state = (await validateLifecycleJournal(c.journalPath)).state;
  assert.equal(state.returns[0].episodeId, older.episodeId);
  assert.equal(state.returns[0].status, "open");
  assert.equal(state.returns[1].postTerminal, true);
  assert.equal(state.attempts.find(({ attemptId }) => attemptId === routed.sourceAttempt.attemptId).status, "superseded");
});

test("assessed supersession ends the detecting attempt with one private feedback pulse", async (t) => {
  const c = await fixture({ remote: false });
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await journeyToVerify(c);
  await evidence(c);
  const routed = await run(c, "correct", "--action", "route", "--stage", "Verify", "--activity", "verification",
    "--artifact", "finding.md", "--finding", "changed implementation", "--owner", "implementer",
    "--owning-stage", "Implement", "--owning-activity", "phase", "--trigger-source", "verification-evidence", "--change-kind", "implementation");
  await run(c, "correct", "--action", "ready", "--stage", "Implement", "--activity", "phase", "--episode-id", routed.episodeId);
  await run(c, "exit", "--stage", "Implement", "--activity", "phase", "--feedback", "skipped");
  await run(c, "correct", "--action", "assess", "--stage", "Verify", "--activity", "verification", "--episode-id", routed.episodeId,
    "--artifact", "finding.md", "--disposition", "supersede", "--rerun-check", "full review");
  const disposition = ["correct", "--action", "supersede", "--stage", "Verify", "--activity", "verification",
    "--episode-id", routed.episodeId, "--feedback", "rough", "--note", "The old basis changed."];
  const first = await run(c, ...disposition);
  assert.equal(first.feedback.status, "recorded");
  assert.notEqual(first.currentAttempt.attemptId, routed.sourceAttempt.attemptId);
  const retry = await run(c, ...disposition);
  assert.equal(retry.feedback.status, "already-final");
  await assert.rejects(run(c, ...disposition.map((arg) => arg === "rough" ? "smooth" : arg)), /conflicting feedback|note/);
  const state = (await validateLifecycleJournal(c.journalPath)).state;
  assert.equal(state.attempts.find(({ attemptId }) => attemptId === routed.sourceAttempt.attemptId).status, "superseded");
  assert.deepEqual(state.feedback.filter(({ attemptId, status }) => attemptId === routed.sourceAttempt.attemptId && status === "recorded").map(({ status }) => status), ["recorded"]);
  const privateRecords = (await readFile(c.feedbackPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(privateRecords.filter(({ attemptId }) => attemptId === routed.sourceAttempt.attemptId).length, 1);
  assert.doesNotMatch(await readFile(c.journalPath, "utf8"), /The old basis changed/);
});

test("observation remains local and reports remote sync failure", async (t) => {
  const c = await fixture();
  t.after(() => rm(c.root, { recursive: true, force: true }));
  await run(c, "enter", "--stage", "Scope", "--activity", "scope");
  await evidence(c);
  await rm(c.remotePath, { recursive: true, force: true });
  const observed = await run(c, "correct", "--action", "observe", "--stage", "Scope", "--activity", "scope",
    "--artifact", "finding.md", "--finding", "authorized work awaiting route", "--owner", "scope owner");
  assert.equal(observed.disposition, "provisional");
  assert.equal(observed.sync.ok, false);
  const validation = await validateLifecycleJournal(c.journalPath);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.state.unresolvedObservations.map(({ observationId }) => observationId), [observed.observationId]);
});
