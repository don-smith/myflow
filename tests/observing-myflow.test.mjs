import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const collector = new URL("../skills/observing-myflow/scripts/collect-evidence.mjs", import.meta.url).pathname;

const message = (id, parentId, timestamp, value) => ({ type: "message", id, parentId, timestamp, message: value });
const line = (value) => `${JSON.stringify(value)}\n`;

async function writeSession(root, directory, name, entries, trailing = "") {
  const path = join(root, directory, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, entries.map(line).join("") + trailing);
  return path;
}

async function runCollector({ target, sessionsRoot, stateRoot, observer = "observer-session", mode = "checkpoint", env = {} }) {
  const args = [
    collector,
    mode,
    "--target", target,
    "--workstream", "demo-flow",
    "--sessions-root", sessionsRoot,
  ];
  if (stateRoot) args.push("--state-root", stateRoot);
  for (const sessionId of observer === null ? [] : Array.isArray(observer) ? observer : [observer]) {
    args.push("--observer-session", sessionId);
  }
  const { stdout } = await execFileAsync("node", args, { env: { ...process.env, ...env } });
  return JSON.parse(stdout);
}

test("collector incrementally captures exact-cwd workstream evidence and excludes observer activity", async () => {
  const root = await mkdtemp(join(tmpdir(), "observing-myflow-"));
  const target = join(root, "project-worktree");
  const sessionsRoot = join(root, "sessions");
  const stateRoot = join(root, "private-state");
  const workstream = join(target, ".myflow/workstreams/demo-flow");
  const deliveryHeader = { type: "session", version: 3, id: "delivery-session", timestamp: "2026-01-01T00:00:00.000Z", cwd: target };
  const deliveryEntries = [
    deliveryHeader,
    message("u1", null, "2026-01-01T00:00:01.000Z", { role: "user", content: "Continue demo-flow Scope" }),
    message("a1", "u1", "2026-01-01T00:00:05.000Z", {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "private chain of thought must not be copied" },
        { type: "toolCall", id: "call-1", name: "write", arguments: { path: `${workstream}/scope/alignment.md`, content: "secret source" } },
      ],
      usage: { input: 10, output: 20, totalTokens: 30, cost: { total: 0.01 } },
      stopReason: "toolUse",
    }),
    message("t1", "a1", "2026-01-01T00:00:06.000Z", { role: "toolResult", toolCallId: "call-1", toolName: "write", content: [{ type: "text", text: "wrote alignment" }], isError: false }),
    message("a2", "t1", "2026-01-01T00:00:11.000Z", { role: "assistant", content: [{ type: "text", text: "Scope checkpoint complete" }], stopReason: "stop" }),
  ];
  const incomplete = JSON.stringify(message("u2", "a2", "2026-01-01T00:10:00.000Z", { role: "user", content: "Start Plan with token sk-secret-value" }));

  await mkdir(join(workstream, "scope"), { recursive: true });
  await writeFile(join(workstream, "workstream.md"), "---\nworkstream: demo-flow\ncurrent_stage: Scope\nstatus: active\n---\n");
  await writeFile(join(workstream, "scope/alignment.md"), "# Alignment\n");
  await execFileAsync("git", ["init", "-q", target]);

  const delivery = await writeSession(sessionsRoot, "project", "delivery.jsonl", deliveryEntries, incomplete);
  await writeSession(sessionsRoot, "project", "observer.jsonl", [
    { ...deliveryHeader, id: "observer-session" },
    message("ou1", null, "2026-01-01T00:00:02.000Z", { role: "user", content: "Observe demo-flow" }),
  ]);
  await writeSession(sessionsRoot, "project", "unrelated.jsonl", [
    { ...deliveryHeader, id: "unrelated-session" },
    message("xu1", null, "2026-01-01T00:00:03.000Z", { role: "user", content: "Discuss demo-flow metrics without opening its artifacts" }),
  ]);
  await writeSession(sessionsRoot, "other", "other.jsonl", [
    { ...deliveryHeader, id: "other-cwd", cwd: join(root, "other-project") },
    message("yu1", null, "2026-01-01T00:00:03.000Z", { role: "user", content: "Continue demo-flow" }),
  ]);

  try {
    const first = await runCollector({ target, sessionsRoot, stateRoot });
    assert.equal(first.source, "pi-jsonl");
    assert.deepEqual(first.includedSessionIds, ["delivery-session"]);
    assert.ok(first.excludedSessions.some((entry) => entry.sessionId === "observer-session" && entry.reason === "observer"));
    assert.ok(first.excludedSessions.some((entry) => entry.sessionId === "unrelated-session" && entry.reason === "no-workstream-evidence"));
    assert.equal(first.newEntryCount, 4);
    assert.equal(first.artifactChangeBasis, "baseline");
    assert.equal(first.metrics.turnaroundWindows[0].durationMs, 10_000);
    assert.equal(first.metrics.toolCalls.write.total, 1);
    assert.equal(first.metrics.toolCalls.write.errors, 0);
    assert.ok(first.stageSignals.some((signal) => signal.stage === "Scope" && signal.entryId === "a1"));
    assert.equal(JSON.stringify(first).includes("private chain of thought"), false);
    assert.equal(JSON.stringify(first).includes("secret source"), false);
    assert.ok(first.private.snapshotPath.startsWith(stateRoot));
    assert.equal((await stat(first.private.accountPath)).mode & 0o777, 0o600);
    assert.equal(first.curated.suggestedReportPath.startsWith(stateRoot), true);
    assert.equal(first.curated.suggestedReportPath.startsWith(first.targetCwd), false);

    await appendFile(delivery, `\n${line(message("a3", "u2", "2026-01-01T00:10:08.000Z", { role: "assistant", content: [{ type: "text", text: "Plan started" }], stopReason: "stop" }))}`);
    const second = await runCollector({ target, sessionsRoot, stateRoot });
    assert.equal(second.newEntryCount, 2);
    assert.equal(second.artifactChangeBasis, "since-prior-checkpoint");
    assert.ok(second.entries.some((entry) => entry.id === "u2" && entry.excerpt.includes("[REDACTED]")));

    const third = await runCollector({ target, sessionsRoot, stateRoot });
    assert.equal(third.newEntryCount, 0);
    assert.equal(third.changedArtifacts.length, 0);

    const parentAware = await runCollector({
      target,
      sessionsRoot,
      stateRoot: join(root, "parent-aware-state"),
      observer: null,
      env: { PI_SESSION_ID: "observer-child", PI_SUBAGENT_PARENT_SESSION: "observer-session" },
    });
    assert.ok(parentAware.excludedSessions.some((entry) => entry.sessionId === "observer-session" && entry.reason === "observer"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collector defaults to the canonical repository observation tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "observing-myflow-repository-state-"));
  const home = join(root, "home");
  const target = join(root, "project");
  const workstream = join(target, ".myflow/workstreams/demo-flow");
  const sessionsRoot = join(root, "sessions");
  const header = { type: "session", version: 3, id: "delivery-session", timestamp: "2026-01-01T00:00:00.000Z", cwd: target };

  await mkdir(workstream, { recursive: true });
  await writeFile(join(workstream, "workstream.md"), "---\nworkstream: demo-flow\ncurrent_stage: Scope\nstatus: active\n---\n");
  await writeFile(join(target, ".myflow/repository-map.md"), "# Local policy map\n");
  await execFileAsync("git", ["init", "-q", target]);
  await execFileAsync("git", ["-C", target, "remote", "add", "origin", "git@github.com:learn-ai-engineering/resonance.git"]);
  await writeSession(sessionsRoot, "project", "delivery.jsonl", [
    header,
    message("u1", null, "2026-01-01T00:00:01.000Z", { role: "user", content: "Observe .myflow/workstreams/demo-flow" }),
  ]);

  try {
    const result = await runCollector({ target, sessionsRoot, stateRoot: undefined, env: { HOME: home } });
    const observationRoot = join(
      home,
      ".myflow/repositories/github.com/learn-ai-engineering/resonance/observations/demo-flow",
    );
    assert.equal(result.private.statePath, join(observationRoot, "state.json"));
    assert.equal(result.private.accountPath, join(observationRoot, "account.md"));
    assert.equal(result.private.snapshotPath.startsWith(join(observationRoot, "evidence")), true);
    assert.equal(result.curated.suggestedReportPath.startsWith(join(observationRoot, "curated")), true);
    assert.equal(result.curated.suggestedTeamMetricsPath.startsWith(join(observationRoot, "curated")), true);
    await assert.rejects(stat(join(workstream, "observations")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collector discovers nested delivery sessions and accepts repeated observer exclusions", async () => {
  const root = await mkdtemp(join(tmpdir(), "observing-myflow-nested-"));
  const target = join(root, "project");
  const workstream = join(target, ".myflow/workstreams/demo-flow");
  const sessionsRoot = join(root, "sessions");
  await mkdir(workstream, { recursive: true });
  await writeFile(join(workstream, "workstream.md"), "---\nworkstream: demo-flow\ncurrent_stage: Implement\nstatus: active\n---\n");
  await execFileAsync("git", ["init", "-q", target]);
  const header = { type: "session", version: 3, id: "nested-delivery", timestamp: "2026-01-01T00:00:00.000Z", cwd: target };
  await writeSession(sessionsRoot, "project/parent/invocation/run-0", "session.jsonl", [
    header,
    message("n1", null, "2026-01-01T00:00:01.000Z", { role: "user", content: "Implement .myflow/workstreams/demo-flow/plan/plan.md" }),
  ]);
  await writeSession(sessionsRoot, "project", "observer-a.jsonl", [{ ...header, id: "observer-a" }]);
  await writeSession(sessionsRoot, "project", "observer-b.jsonl", [{ ...header, id: "observer-b" }]);

  try {
    const result = await runCollector({ target, sessionsRoot, stateRoot: join(root, "state"), observer: ["observer-a", "observer-b"] });
    assert.deepEqual(result.includedSessionIds, ["nested-delivery"]);
    assert.deepEqual(result.excludedSessions.filter((entry) => entry.reason === "observer").map((entry) => entry.sessionId), ["observer-a", "observer-b"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skill contract keeps timing conservative, raw state private, and Close output curated", async () => {
  const [skill, scenarios, readme, status] = await Promise.all([
    readFile(new URL("../skills/observing-myflow/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("./fixtures/observing-myflow-scenarios.md", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/myflow-workflow-status-and-alignment.md", import.meta.url), "utf8"),
  ]);

  assert.match(skill, /unknown gap|unknown interval/i);
  assert.match(skill, /not active agent time/i);
  assert.match(skill, /facts.*interpretations.*hypotheses/is);
  assert.match(skill, /do not perform.*code review|does not perform.*code review/i);
  assert.match(skill, /Langfuse/i);
  assert.match(skill, /team-safe/i);
  assert.match(skill, /Close/i);
  assert.match(skill, /observer.*session/i);
  assert.match(skill, /developer-reported friction|friction pulse/i);
  assert.match(skill, /backward transition|stage return/i);
  assert.match(skill, /necessary learning.*late discovery.*process-induced/is);
  assert.match(skill, /developer report.*private account|private account.*developer report/is);
  assert.match(skill, /\.myflow\/repositories\/<identity>\/observations/i);
  assert.match(skill, /do not write.*target worktree/is);
  assert.match(scenarios, /incremental checkpoint/i);
  assert.match(scenarios, /finalize at Close/i);
  assert.match(scenarios, /repository observation tree/i);
  assert.match(scenarios, /telemetry migration/i);
  assert.match(scenarios, /backward flow/i);
  assert.match(readme, /observing-myflow/i);
  assert.match(readme, /\.myflow\/repositories\/<identity>\/observations/i);
  assert.match(status, /observing-myflow/i);
});
