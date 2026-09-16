import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const collector = new URL("../skills/observing-myflow/scripts/collect-evidence.mjs", import.meta.url).pathname;
const derivation = new URL("../skills/observing-myflow/scripts/derive-team-flow.mjs", import.meta.url).pathname;
const rollup = new URL("../skills/observing-myflow/scripts/rollup-flow-metrics.mjs", import.meta.url).pathname;

const message = (id, parentId, timestamp, value) => ({ type: "message", id, parentId, timestamp, message: value });
const line = (value) => `${JSON.stringify(value)}\n`;

async function writeSession(root, directory, name, entries, trailing = "") {
  const path = join(root, directory, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, entries.map(line).join("") + trailing);
  return path;
}

async function runDerivation(root, evidence, analysis) {
  const evidencePath = join(root, "evidence.json");
  const analysisPath = join(root, "analysis.json");
  const outputPath = join(root, "team-flow.json");
  await writeFile(evidencePath, `${JSON.stringify(evidence)}\n`);
  await writeFile(analysisPath, `${JSON.stringify(analysis)}\n`);
  const { stdout } = await execFileAsync("node", [
    derivation,
    "--evidence", evidencePath,
    "--analysis", analysisPath,
    "--output", outputPath,
  ]);
  return { receipt: JSON.parse(stdout), output: JSON.parse(await readFile(outputPath, "utf8")) };
}

async function runRollup(root, exports, { startedAt = "2026-01-01T00:00:00.000Z", endedAt = "2026-01-10T00:00:00.000Z" } = {}) {
  const observationRoot = join(root, "observations");
  for (const [workstream, files] of Object.entries(exports)) {
    for (const [name, value] of Object.entries(files)) {
      const path = join(observationRoot, workstream, "curated", name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
    }
  }
  const outputPath = join(root, "rollup.json");
  const { stdout } = await execFileAsync("node", [
    rollup,
    "--observation-root", observationRoot,
    "--window-start", startedAt,
    "--window-end", endedAt,
    "--output", outputPath,
  ]);
  return { receipt: JSON.parse(stdout), output: JSON.parse(await readFile(outputPath, "utf8")) };
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

test("collector preserves complete usage and groups provider and model economics", async () => {
  const root = await mkdtemp(join(tmpdir(), "observing-myflow-usage-"));
  const target = join(root, "project");
  const workstream = join(target, ".myflow/workstreams/demo-flow");
  const sessionsRoot = join(root, "sessions");
  const header = { type: "session", version: 3, id: "usage-session", timestamp: "2026-01-01T00:00:00.000Z", cwd: target };

  await mkdir(workstream, { recursive: true });
  await writeFile(join(workstream, "workstream.md"), "---\nworkstream: demo-flow\ncurrent_stage: Implement\nstatus: active\n---\n");
  await execFileAsync("git", ["init", "-q", target]);
  await writeSession(sessionsRoot, "project", "usage.jsonl", [
    header,
    message("u1", null, "2026-01-01T00:00:01.000Z", { role: "user", content: "Read .myflow/workstreams/demo-flow/plan/plan.md" }),
    message("a1", "u1", "2026-01-01T00:00:02.000Z", {
      role: "assistant", provider: "anthropic", model: "claude-sonnet",
      content: [{ type: "text", text: "first" }], stopReason: "stop",
      usage: { input: 10, cacheRead: 20, cacheWrite: 5, output: 7, reasoning: 3, totalTokens: 42, cost: { total: 0.02 } },
    }),
    message("a2", "a1", "2026-01-01T00:00:03.000Z", {
      role: "assistant", provider: "openai", model: "gpt-test",
      content: [{ type: "text", text: "second" }], stopReason: "stop",
      usage: { input: 11, cacheRead: 4, cacheWrite: 0, output: 8, reasoning: 2, totalTokens: 25, cost: {} },
    }),
    message("a3", "a2", "2026-01-01T00:00:04.000Z", {
      role: "assistant", content: [{ type: "text", text: "unattributed" }], stopReason: "stop",
      usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0, totalTokens: 0, cost: {} },
    }),
  ]);

  try {
    const result = await runCollector({ target, sessionsRoot, stateRoot: join(root, "state") });
    assert.deepEqual(
      result.entries.filter((entry) => entry.usage).map((entry) => [entry.provider, entry.model, entry.usage.reasoningTokens, entry.usage.cacheReadTokens]),
      [["anthropic", "claude-sonnet", 3, 20], ["openai", "gpt-test", 2, 4], [null, null, 0, 0]],
    );
    assert.deepEqual(result.metrics.tokenUsage, { totalTokens: 67, costUsd: 0.02 });
    assert.equal(result.metrics.usage.calls, 3);
    assert.equal(result.metrics.usage.uncachedInputTokens, 21);
    assert.equal(result.metrics.usage.cacheReadTokens, 24);
    assert.equal(result.metrics.usage.cacheWriteTokens, 5);
    assert.equal(result.metrics.usage.outputTokens, 15);
    assert.equal(result.metrics.usage.reasoningTokens, 5);
    assert.equal(result.metrics.usage.totalTokens, 67);
    assert.deepEqual(result.metrics.usage.costCoverage, { recordedCalls: 1, missingCalls: 2, ratio: 1 / 3 });
    assert.deepEqual(result.metrics.usage.providerModelCoverage, { attributedCalls: 2, unattributedCalls: 1, ratio: 2 / 3 });
    assert.deepEqual(result.metrics.usage.byProviderModel.map(({ provider, model, calls, recordedCostUsd }) => [provider, model, calls, recordedCostUsd]), [
      ["anthropic", "claude-sonnet", 1, 0.02],
      ["openai", "gpt-test", 1, null],
      ["unknown", "unknown", 1, null],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("derivation filters explicit boundaries and attributes repeated non-overlapping stage intervals", async () => {
  const root = await mkdtemp(join(tmpdir(), "observing-myflow-derive-"));
  const usage = (totalTokens, recordedCostUsd = null) => ({
    uncachedInputTokens: totalTokens - 4,
    cacheReadTokens: 1,
    cacheWriteTokens: 1,
    outputTokens: 2,
    reasoningTokens: 1,
    totalTokens,
    recordedCostUsd,
  });
  const evidence = {
    schemaVersion: "myflow-observation-evidence/v1",
    entries: [
      { id: "precursor", timestamp: "2026-01-01T00:00:05.000Z", role: "assistant", provider: "anthropic", model: "claude", usage: usage(10, 0.01) },
      { id: "scope", timestamp: "2026-01-01T00:00:15.000Z", role: "assistant", provider: "anthropic", model: "claude", usage: usage(20, 0.02) },
      { id: "plan-1", timestamp: "2026-01-01T00:00:25.000Z", role: "assistant", provider: "openai", model: "gpt", usage: usage(30) },
      { id: "scope-return", timestamp: "2026-01-01T00:00:35.000Z", role: "assistant", provider: "anthropic", model: "claude", usage: usage(40, 0.04) },
      { id: "unassigned", timestamp: "2026-01-01T00:00:45.000Z", role: "assistant", provider: null, model: null, usage: usage(50, 0.05) },
      { id: "tail", timestamp: "2026-01-01T00:01:05.000Z", role: "assistant", provider: "openai", model: "gpt", usage: usage(60, 0.06) },
    ],
    metrics: { turnaroundWindows: [{ startedAt: "2026-01-01T00:00:12.000Z", endedAt: "2026-01-01T00:00:14.000Z", durationMs: 2000 }] },
  };
  const analysis = {
    schemaVersion: "myflow-observation-analysis/v1",
    project: "github.com/example/project",
    workstream: "demo-flow",
    startedAt: "2026-01-01T00:00:10.000Z",
    closedAt: "2026-01-01T00:01:00.000Z",
    boundarySemantics: "scope-to-close",
    classification: { risk: "medium", depth: "lightweight", flowItemType: "Feature" },
    stageIntervals: [
      { stage: "Scope", startedAt: "2026-01-01T00:00:10.000Z", endedAt: "2026-01-01T00:00:20.000Z" },
      { stage: "Plan", startedAt: "2026-01-01T00:00:20.000Z", endedAt: "2026-01-01T00:00:30.000Z" },
      { stage: "Scope", startedAt: "2026-01-01T00:00:30.000Z", endedAt: "2026-01-01T00:00:40.000Z" },
    ],
    activeTimeMs: null,
    waitTimeMs: null,
    executionFlow: { reworkEpisodes: 1, stageReturnCount: 1, lateDiscoveryCount: 0, returnLoopMs: 10_000, processFriction: { failedChecks: 1, corrections: 1 } },
    developerExperience: { selfReport: null, closeSatisfaction: null },
    outcomes: { verifyVerdict: "pass", acceptedPhaseCount: 1, toolSuccessRate: 1 },
    versions: { myflow: "test", pi: "test" },
    limitations: ["No active and wait classification was recorded."],
  };

  try {
    const { receipt, output } = await runDerivation(root, evidence, analysis);
    assert.equal(receipt.schemaVersion, "myflow-team-flow/v2");
    assert.equal(output.flowFrameworkContribution.scopeToCloseCycleTimeMs, 50_000);
    assert.equal(output.flowFrameworkContribution.flowTimeMs, null);
    assert.equal(output.flowFrameworkContribution.efficiency.value, null);
    assert.equal(output.flowFrameworkContribution.efficiency.coverage, "not-measured");
    assert.equal(output.executionFlow.stageResidenceMs.Scope, 20_000);
    assert.equal(output.executionFlow.stageResidenceMs.Plan, 10_000);
    assert.equal(output.executionFlow.stageIntervals.length, 3);
    assert.deepEqual(output.developerExperience, { selfReport: null, closeSatisfaction: null });
    assert.deepEqual(output.executionFlow.processFriction, { failedChecks: 1, corrections: 1 });
    assert.equal(output.aiEconomics.calls, 4);
    assert.equal(output.aiEconomics.totalTokens, 140);
    assert.equal(output.aiEconomics.recordedCostUsd, 0.11);
    assert.deepEqual(output.aiEconomics.costCoverage, { recordedCalls: 3, missingCalls: 1, ratio: 0.75 });
    assert.deepEqual(output.aiEconomics.attribution, {
      boundaryExcludedCalls: 2,
      assignedCalls: 3,
      unassignedCalls: 1,
      assignedRecordedCostUsd: 0.06,
      unassignedRecordedCostUsd: 0.05,
      assignedCostCoverage: { recordedCalls: 2, missingCalls: 1, ratio: 2 / 3 },
      unassignedCostCoverage: { recordedCalls: 1, missingCalls: 0, ratio: 1 },
    });
    assert.equal(output.aiEconomics.uncachedInputTokens, 124);
    assert.equal(output.aiEconomics.cacheReadTokens, 4);
    assert.equal(output.aiEconomics.cacheWriteTokens, 4);
    assert.equal(output.aiEconomics.outputTokens, 8);
    assert.equal(output.aiEconomics.reasoningTokens, 4);
    assert.deepEqual(output.aiEconomics.byStage.map(({ stage, calls, totalTokens, recordedCostUsd }) => [stage, calls, totalTokens, recordedCostUsd]), [
      ["Plan", 1, 30, null],
      ["Scope", 2, 60, 0.06],
    ]);
    assert.ok(output.aiEconomics.byProviderModel.some((group) => group.provider === "anthropic" && group.model === "claude" && group.totalTokens === 60 && group.recordedCostUsd === 0.06));
    assert.ok(output.aiEconomics.byProviderModel.some((group) => group.provider === "unknown" && group.model === "unknown" && group.calls === 1));
    assert.equal(JSON.stringify(output).includes("precursor"), false);
    assert.equal(JSON.stringify(output).includes("tail"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("derivation rejects overlapping stage intervals and derives qualified efficiency only from explicit active and wait evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "observing-myflow-validation-"));
  const evidence = { schemaVersion: "myflow-observation-evidence/v1", entries: [] };
  const base = {
    schemaVersion: "myflow-observation-analysis/v1",
    project: "project", workstream: "demo-flow",
    startedAt: "2026-01-01T00:00:00.000Z", closedAt: "2026-01-01T00:01:00.000Z",
    boundarySemantics: "value-stream-to-customer",
    classification: { risk: "low", depth: "lightweight", flowItemType: "Defect" },
    stageIntervals: [], activeTimeMs: 15_000, waitTimeMs: 5_000,
    executionFlow: { processFriction: {} },
    developerExperience: { selfReport: { value: "smooth", source: "developer-report" }, closeSatisfaction: null },
  };

  try {
    const { output } = await runDerivation(root, evidence, base);
    assert.equal(output.flowFrameworkContribution.flowTimeMs, 60_000);
    assert.equal(output.flowFrameworkContribution.efficiency.value, 0.75);
    assert.equal(output.flowFrameworkContribution.efficiency.coverage, "active-and-wait-measured");
    assert.deepEqual(output.developerExperience.selfReport, { value: "smooth", source: "developer-report" });

    await assert.rejects(
      runDerivation(root, evidence, {
        ...base,
        stageIntervals: [
          { stage: "Scope", startedAt: "2026-01-01T00:00:10.000Z", endedAt: "2026-01-01T00:00:30.000Z" },
          { stage: "Plan", startedAt: "2026-01-01T00:00:20.000Z", endedAt: "2026-01-01T00:00:40.000Z" },
        ],
      }),
      (error) => /overlap/i.test(error.stderr),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rollup selects the latest compatible export per workstream and preserves Flow Metric coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "observing-myflow-rollup-"));
  const teamFlow = ({ workstream, startedAt, closedAt, type, cycleTimeMs, flowTimeMs, efficiency, calls, tokens, cost }) => ({
    schemaVersion: "myflow-team-flow/v2",
    analysisVersion: "myflow-observation-analysis/v1",
    project: "github.com/example/project",
    workstream,
    classification: { risk: "medium", depth: "lightweight", flowItemType: type },
    boundaries: { startedAt, closedAt, boundarySemantics: flowTimeMs === null ? "scope-to-close" : "value-stream-to-customer", intervalConvention: "half-open [startedAt, closedAt)" },
    flowFrameworkContribution: {
      flowItemType: type,
      completionContribution: closedAt === null ? 0 : 1,
      loadInterval: { startedAt, closedAt },
      scopeToCloseCycleTimeMs: cycleTimeMs,
      flowTimeMs,
      efficiency: efficiency === null
        ? { value: null, activeTimeMs: null, waitTimeMs: null, coverage: "not-measured" }
        : { value: efficiency, activeTimeMs: 1, waitTimeMs: 1, coverage: "active-and-wait-measured" },
    },
    executionFlow: {},
    developerExperience: { selfReport: null, closeSatisfaction: null },
    aiEconomics: {
      calls,
      uncachedInputTokens: tokens - 4,
      cacheReadTokens: 1,
      cacheWriteTokens: 1,
      outputTokens: 2,
      reasoningTokens: 1,
      totalTokens: tokens,
      recordedCostUsd: cost,
      costCoverage: { recordedCalls: cost === null ? 0 : calls, missingCalls: cost === null ? calls : 0, ratio: calls ? (cost === null ? 0 : 1) : null },
      attribution: {},
      byStage: [],
      byProviderModel: [{ provider: "anthropic", model: "claude", calls, uncachedInputTokens: tokens - 4, cacheReadTokens: 1, cacheWriteTokens: 1, outputTokens: 2, reasoningTokens: 1, totalTokens: tokens, recordedCostUsd: cost, costCoverage: { recordedCalls: cost === null ? 0 : calls, missingCalls: cost === null ? calls : 0, ratio: calls ? (cost === null ? 0 : 1) : null } }],
    },
    outcomes: {}, versions: {}, limitations: [],
  });

  try {
    const oldA = teamFlow({ workstream: "a", startedAt: "2025-12-31T00:00:00.000Z", closedAt: "2026-01-02T00:00:00.000Z", type: "Feature", cycleTimeMs: 99, flowTimeMs: null, efficiency: null, calls: 9, tokens: 90, cost: 0.9 });
    const currentA = teamFlow({ workstream: "a", startedAt: "2025-12-31T00:00:00.000Z", closedAt: "2026-01-03T00:00:00.000Z", type: "Feature", cycleTimeMs: 2_000, flowTimeMs: null, efficiency: null, calls: 1, tokens: 10, cost: 0.1 });
    const unknownB = teamFlow({ workstream: "b", startedAt: "2026-01-04T00:00:00.000Z", closedAt: "2026-01-05T00:00:00.000Z", type: "Unknown", cycleTimeMs: 4_000, flowTimeMs: 4_000, efficiency: 0.5, calls: 2, tokens: 20, cost: null });
    const openC = teamFlow({ workstream: "c", startedAt: "2026-01-04T00:00:00.000Z", closedAt: null, type: "Debt", cycleTimeMs: null, flowTimeMs: null, efficiency: null, calls: 3, tokens: 30, cost: 0.3 });
    const laterD = teamFlow({ workstream: "d", startedAt: "2025-12-30T00:00:00.000Z", closedAt: "2026-01-11T00:00:00.000Z", type: "Defect", cycleTimeMs: 6_000, flowTimeMs: 6_000, efficiency: 0.75, calls: 4, tokens: 40, cost: 0.4 });
    const boundaryF = teamFlow({ workstream: "f", startedAt: "2026-01-09T00:00:00.000Z", closedAt: "2026-01-10T00:00:00.000Z", type: "Risk", cycleTimeMs: 1_000, flowTimeMs: null, efficiency: null, calls: 1, tokens: 10, cost: 0.1 });
    const invalidG = teamFlow({ workstream: "g", startedAt: "2026-01-05T00:00:00.000Z", closedAt: "2026-01-06T00:00:00.000Z", type: "Feature", cycleTimeMs: 1_000, flowTimeMs: 1_000, efficiency: null, calls: 1, tokens: 10, cost: 0.1 });
    invalidG.boundaries.boundarySemantics = "scope-to-close";
    const { receipt, output } = await runRollup(root, {
      a: {
        "20260101T000000Z_a-team-flow.json": oldA,
        "20260102T000000Z_a-team-flow.json": currentA,
        "20260103T000000Z_a-team-flow.json": { ...currentA, schemaVersion: "myflow-team-flow/v1" },
      },
      b: { "20260105T000000Z_b-team-flow.json": unknownB },
      c: { "20260106T000000Z_c-team-flow.json": openC },
      d: { "20260107T000000Z_d-team-flow.json": laterD },
      e: { "20260108T000000Z_e-team-flow.json": "{not-json\n" },
      f: { "20260109T000000Z_f-team-flow.json": boundaryF },
      g: { "20260109T000000Z_g-team-flow.json": invalidG },
    });

    assert.equal(receipt.schemaVersion, "myflow-flow-rollup/v1");
    assert.equal(output.selection.scannedExports, 9);
    assert.equal(output.selection.compatibleExports, 6);
    assert.equal(output.selection.selectedWorkstreams, 5);
    assert.deepEqual(output.selection.incompatibleExports, { malformed: 1, unsupportedSchema: 1, invalidV2: 1 });
    assert.equal(output.flowMetrics.velocity.completedItems, 2);
    assert.deepEqual(output.flowMetrics.distribution.Feature, { count: 1, ratio: 0.5 });
    assert.deepEqual(output.flowMetrics.distribution.Unknown, { count: 1, ratio: 0.5 });
    assert.deepEqual(output.flowMetrics.distribution.coverage, { knownItems: 1, unknownItems: 1, knownRatio: 0.5 });
    assert.deepEqual(output.flowMetrics.load.history.map(({ at, load }) => [at, load]), [
      ["2026-01-01T00:00:00.000Z", 2],
      ["2026-01-03T00:00:00.000Z", 1],
      ["2026-01-04T00:00:00.000Z", 3],
      ["2026-01-05T00:00:00.000Z", 2],
      ["2026-01-09T00:00:00.000Z", 3],
      ["2026-01-10T00:00:00.000Z", 2],
    ]);
    assert.deepEqual(output.flowMetrics.load.current, { asOf: "2026-01-10T00:00:00.000Z", value: 2, coverage: "includes-open-and-finalized-intervals" });
    assert.deepEqual(output.flowMetrics.cycleTime, { unit: "ms", summary: { count: 2, min: 2_000, max: 4_000, mean: 3_000, median: 3_000 }, coverage: { measuredItems: 2, missingItems: 0, ratio: 1 } });
    assert.deepEqual(output.flowMetrics.flowTime, { unit: "ms", summary: { count: 1, min: 4_000, max: 4_000, mean: 4_000, median: 4_000 }, coverage: { measuredItems: 1, missingItems: 1, ratio: 0.5 } });
    assert.deepEqual(output.flowMetrics.efficiency, { mean: 0.5, coverage: { measuredItems: 1, missingItems: 1, ratio: 0.5 } });
    assert.equal(output.aiEconomics.itemsIncluded, 2);
    assert.equal(output.aiEconomics.calls, 3);
    assert.equal(output.aiEconomics.totalTokens, 30);
    assert.equal(output.aiEconomics.recordedCostUsd, 0.1);
    assert.deepEqual(output.aiEconomics.costCoverage, { recordedCalls: 1, missingCalls: 2, ratio: 1 / 3 });
    assert.deepEqual(output.aiEconomics.byProviderModel.map(({ provider, model, calls, totalTokens, recordedCostUsd }) => [provider, model, calls, totalTokens, recordedCostUsd]), [
      ["anthropic", "claude", 3, 30, 0.1],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rollup rejects a target-worktree output reached through a symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "observing-myflow-rollup-output-"));
  const target = join(root, "project");
  const linkedOutput = join(root, "linked-output");
  const outputPath = join(linkedOutput, "rollup.json");

  try {
    await mkdir(join(target, "private"), { recursive: true });
    await execFileAsync("git", ["init", "-q", target]);
    await execFileAsync("git", ["-C", target, "remote", "add", "origin", "git@github.com:example/project.git"]);
    await symlink(join(target, "private"), linkedOutput, "dir");

    await assert.rejects(
      execFileAsync("node", [
        rollup,
        "--target", target,
        "--window-start", "2026-01-01T00:00:00.000Z",
        "--window-end", "2026-01-02T00:00:00.000Z",
        "--output", outputPath,
      ], { env: { ...process.env, HOME: join(root, "home") } }),
      (error) => /outside the target worktree/i.test(error.stderr),
    );
    await assert.rejects(stat(outputPath), { code: "ENOENT" });
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
  const [skill, scenarios, readme, status, boundaryContract, scopeSkill, workstreamTemplate, alignmentTemplate] = await Promise.all([
    readFile(new URL("../skills/observing-myflow/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("./fixtures/observing-myflow-scenarios.md", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/myflow-workflow-status-and-alignment.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/artifact-and-stage-boundary-contract.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/scope/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/myflow/templates/workstream.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/scope/templates/alignment.md", import.meta.url), "utf8"),
  ]);
  const contract = await readFile(new URL("../skills/observing-myflow/report-contract.md", import.meta.url), "utf8");

  assert.match(skill, /unknown gap|unknown interval/i);
  assert.match(skill, /not active agent time/i);
  assert.match(skill, /facts.*interpretations.*hypotheses/is);
  assert.match(skill, /do not perform.*code review|does not perform.*code review/i);
  assert.match(skill, /Langfuse/i);
  assert.match(skill, /team-safe/i);
  assert.match(skill, /Close/i);
  assert.match(skill, /observer.*session/i);
  assert.match(skill, /developer-reported friction|self-report|friction pulse/i);
  assert.match(skill, /myflow-observation-analysis\/v1/i);
  assert.match(skill, /derive-team-flow\.mjs/i);
  assert.match(skill, /rollup-flow-metrics\.mjs/i);
  assert.match(skill, /reporting window/i);
  assert.match(skill, /provider.*model|model.*provider/is);
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
  assert.match(scenarios, /boundary filtering/i);
  assert.match(scenarios, /missing cost/i);
  assert.match(scenarios, /repository rollup/i);
  assert.match(scenarios, /latest compatible/i);
  assert.match(contract, /myflow-team-flow\/v2/i);
  assert.match(contract, /Scope-to-Close/i);
  assert.match(contract, /customer-centric Flow Time/i);
  assert.match(contract, /token volume.*individual productivity|individual productivity.*token volume/is);
  assert.match(contract, /reasoning tokens.*subset|subset.*reasoning tokens/is);
  assert.match(contract, /myflow-flow-rollup\/v1/i);
  assert.match(contract, /historical Load/i);
  assert.match(contract, /finalized intervals only/i);
  assert.match(readme, /observing-myflow/i);
  assert.match(readme, /rollup-flow-metrics\.mjs/i);
  assert.match(readme, /longitudinal/i);
  assert.match(readme, /\.myflow\/repositories\/<identity>\/observations/i);
  assert.match(status, /observing-myflow/i);
  assert.match(status, /repository rollup/i);
  assert.match(boundaryContract, /flow_item_type/i);
  assert.match(boundaryContract, /implementation risk/i);
  assert.match(scopeSkill, /flow_item_type/i);
  assert.match(scopeSkill, /Feature.*Defect.*Debt.*Risk.*Unknown/is);
  assert.match(workstreamTemplate, /flow_item_type:.*unknown/i);
  assert.match(alignmentTemplate, /Flow Item type/i);
});

test("observer contract references local stage reviews and return assessment", async () => {
  const [skill, contract] = await Promise.all([
    readFile(new URL("../skills/observing-myflow/SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../skills/observing-myflow/report-contract.md", import.meta.url), "utf8"),
  ]);

  assert.match(skill, /stage-review/i);
  assert.match(skill, /evaluate-stage/i);
  assert.match(skill, /return assessment/i);
  assert.match(skill, /late discovery/i);
  assert.match(skill, /predicate/i);
  assert.match(skill, /public projection/i);
  assert.match(skill, /allowlist/i);
  assert.match(contract, /myflow-stage-review\/v1/i);
  assert.match(contract, /stage-review-public/i);
  assert.match(contract, /predicate.*result/i);
  assert.match(contract, /(?:return assessment|correction assessment)/i);
  assert.match(contract, /late.?discovery/i);
  assert.match(contract, /counterfactual/i);
  assert.match(contract, /public projection/i);
});
