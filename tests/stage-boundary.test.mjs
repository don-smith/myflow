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
