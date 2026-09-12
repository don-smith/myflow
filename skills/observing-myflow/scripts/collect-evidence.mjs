#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = "myflow-observation-evidence/v1";
const STATE_VERSION = "myflow-observation-state/v1";
const MAX_EXCERPT = 500;

function usage() {
  return `Usage: node collect-evidence.mjs <checkpoint|finalize> --target <worktree> --workstream <id> [options]

Options:
  --sessions-root <path>    Pi sessions root (default: ~/.pi/agent/sessions)
  --state-root <path>       Repository observation root override
                            (default: ~/.myflow/repositories/<identity>/observations)
  --observer-session <id>   Session to exclude (default: PI_SESSION_ID)
  --receipt-only            Print a bounded receipt; read snapshotPath for evidence
  --help                    Show this help
`;
}

function parseArgs(argv) {
  if (argv.includes("--help")) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const mode = argv[0];
  if (mode !== "checkpoint" && mode !== "finalize") throw new Error("First argument must be checkpoint or finalize.");
  const options = { mode, receiptOnly: false, observerSessions: [] };
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--receipt-only") {
      options.receiptOnly = true;
      continue;
    }
    if (!["--target", "--workstream", "--sessions-root", "--state-root", "--observer-session"].includes(arg)) {
      throw new Error(`Unknown option: ${arg}`);
    }
    const value = argv[++index];
    if (!value) throw new Error(`${arg} requires a value.`);
    if (arg === "--observer-session") options.observerSessions.push(value);
    else options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  if (!options.target) throw new Error("--target is required.");
  if (!options.workstream) throw new Error("--workstream is required.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(options.workstream)) throw new Error("--workstream must be filesystem-safe.");
  return options;
}

function canonical(path) {
  const absolute = resolve(path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function repositoryObservationRoot(target) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const resolver = resolve(scriptDirectory, "../../myflow/scripts/resolve-repository-map.mjs");
  let result;
  try {
    const output = execFileSync(process.execPath, [resolver, "target", "--cwd", target], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    result = JSON.parse(output);
  } catch (error) {
    const detail = String(error.stderr ?? error.message).trim();
    throw new Error(`Cannot resolve the repository observation directory: ${detail}`);
  }
  if (result.error || typeof result.mapPath !== "string") {
    throw new Error("Cannot resolve the repository observation directory.");
  }
  return join(dirname(result.mapPath), "observations");
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function listSessionFiles(root) {
  if (!existsSync(root)) throw new Error(`Pi sessions root does not exist: ${root}`);
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "subagent-artifacts") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path);
    }
  }
  walk(root);
  return files.sort();
}

function completeRecords(path) {
  const bytes = readFileSync(path);
  const finalNewline = bytes.lastIndexOf(0x0a);
  if (finalNewline < 0) return { bytes, completeOffset: 0, records: [] };
  const records = [];
  let start = 0;
  let lineNumber = 0;
  for (let index = 0; index <= finalNewline; index++) {
    if (bytes[index] !== 0x0a) continue;
    lineNumber++;
    const raw = bytes.subarray(start, index).toString("utf8").trim();
    const endOffset = index + 1;
    if (raw) {
      try {
        records.push({ value: JSON.parse(raw), startOffset: start, endOffset, lineNumber });
      } catch {
        records.push({ value: undefined, startOffset: start, endOffset, lineNumber, parseError: true });
      }
    }
    start = endOffset;
  }
  return { bytes, completeOffset: finalNewline + 1, records };
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && typeof block === "object" && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function redact(value) {
  return String(value)
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[REDACTED]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

function excerpt(value, max = MAX_EXCERPT) {
  const compact = redact(value).replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 1)}…`;
}

function summarizeArguments(toolName, args) {
  if (!args || typeof args !== "object") return {};
  if (["read", "write", "edit"].includes(toolName)) return typeof args.path === "string" ? { path: args.path } : {};
  if (["web_fetch"].includes(toolName)) return typeof args.url === "string" ? { url: excerpt(args.url, 300) } : {};
  if (["web_search"].includes(toolName)) return typeof args.query === "string" ? { query: excerpt(args.query, 300) } : {};
  if (toolName === "bash") return typeof args.command === "string" ? { command: excerpt(args.command.split("\n")[0], 300) } : {};
  if (toolName === "subagent") return { action: args.action, agent: args.agent };
  return { keys: Object.keys(args).sort() };
}

function summarizeEntry(record, sessionId) {
  const entry = record.value;
  const summary = {
    sessionId,
    id: entry.id,
    parentId: entry.parentId ?? null,
    timestamp: entry.timestamp,
    type: entry.type,
    lineNumber: record.lineNumber,
  };
  if (entry.type === "compaction") return { ...summary, tokensBefore: entry.tokensBefore, note: "summary content omitted" };
  if (entry.type === "branch_summary") return { ...summary, fromId: entry.fromId, note: "summary content omitted" };
  if (entry.type !== "message" || !entry.message) return summary;
  const message = entry.message;
  summary.role = message.role;
  const text = contentText(message.content);
  if (text) summary.excerpt = excerpt(text);
  if (message.role === "assistant") {
    summary.stopReason = message.stopReason;
    summary.provider = typeof message.provider === "string" ? message.provider : null;
    summary.model = typeof message.model === "string" ? message.model : null;
    summary.toolCalls = (Array.isArray(message.content) ? message.content : [])
      .filter((block) => block && block.type === "toolCall")
      .map((block) => ({ id: block.id, name: block.name, arguments: summarizeArguments(block.name, block.arguments) }));
    if (message.usage) {
      const recordedCostUsd = typeof message.usage.cost?.total === "number" ? message.usage.cost.total : null;
      summary.usage = {
        input: message.usage.input ?? 0,
        output: message.usage.output ?? 0,
        totalTokens: message.usage.totalTokens ?? 0,
        ...(recordedCostUsd === null ? {} : { cost: recordedCostUsd }),
        uncachedInputTokens: message.usage.input ?? 0,
        cacheReadTokens: message.usage.cacheRead ?? 0,
        cacheWriteTokens: message.usage.cacheWrite ?? 0,
        outputTokens: message.usage.output ?? 0,
        reasoningTokens: message.usage.reasoning ?? 0,
        recordedCostUsd,
      };
    }
  }
  if (message.role === "toolResult") {
    summary.toolName = message.toolName;
    summary.toolCallId = message.toolCallId;
    summary.isError = Boolean(message.isError);
  }
  return summary;
}

function stageForPath(path, workstream) {
  if (typeof path !== "string") return undefined;
  const normalized = path.replaceAll("\\", "/");
  const marker = `/.myflow/workstreams/${workstream}/`;
  const relativePath = normalized.includes(marker) ? normalized.split(marker)[1] : normalized.startsWith(`.myflow/workstreams/${workstream}/`) ? normalized.slice(`.myflow/workstreams/${workstream}/`.length) : undefined;
  if (!relativePath) return undefined;
  const bucket = relativePath.split("/")[0];
  if (bucket === "scope" || bucket === "research") return { stage: "Scope", activity: bucket };
  if (bucket === "design" || bucket === "plan") return { stage: "Plan", activity: bucket };
  if (bucket === "implement") return { stage: "Implement", activity: bucket };
  if (bucket === "verify") return { stage: "Verify", activity: bucket };
  if (bucket === "close" || bucket === "observations") return { stage: "Close", activity: bucket };
  return undefined;
}

function stageSignals(entries, workstream) {
  const signals = [];
  for (const entry of entries) {
    for (const call of entry.toolCalls ?? []) {
      const paths = [];
      if (typeof call.arguments?.path === "string") paths.push(call.arguments.path);
      if (typeof call.arguments?.command === "string") paths.push(call.arguments.command);
      for (const path of paths) {
        const classified = stageForPath(path, workstream);
        if (classified) signals.push({ ...classified, timestamp: entry.timestamp, sessionId: entry.sessionId, entryId: entry.id, source: `tool:${call.name}` });
      }
    }
  }
  return signals;
}

function emptyUsageTotals() {
  return {
    calls: 0,
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    recordedCostUsd: 0,
    recordedCostCalls: 0,
  };
}

function addUsage(totals, usage) {
  totals.calls++;
  for (const key of ["uncachedInputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens", "reasoningTokens", "totalTokens"]) {
    totals[key] += typeof usage[key] === "number" ? usage[key] : 0;
  }
  if (typeof usage.recordedCostUsd === "number") {
    totals.recordedCostUsd += usage.recordedCostUsd;
    totals.recordedCostCalls++;
  }
}

function finishUsage(totals) {
  const { recordedCostCalls, ...usage } = totals;
  usage.recordedCostUsd = recordedCostCalls ? Number(usage.recordedCostUsd.toFixed(6)) : null;
  usage.costCoverage = {
    recordedCalls: recordedCostCalls,
    missingCalls: usage.calls - recordedCostCalls,
    ratio: usage.calls ? recordedCostCalls / usage.calls : null,
  };
  return usage;
}

function aggregateMetrics(sessions) {
  const roleCounts = {};
  const toolCalls = {};
  const timestamps = [];
  const turnaroundWindows = [];
  const unknownGaps = [];
  let totalTokens = 0;
  let cost = 0;
  let hasCost = false;
  const usageTotals = emptyUsageTotals();
  const usageGroups = new Map();
  let attributedProviderModelCalls = 0;

  for (const session of sessions) {
    const entries = session.allEntries;
    let pendingUser;
    let previous;
    for (const entry of entries) {
      if (entry.timestamp) {
        const time = Date.parse(entry.timestamp);
        if (!Number.isNaN(time)) {
          timestamps.push(time);
          if (previous) unknownGaps.push({ sessionId: session.sessionId, fromEntryId: previous.id, toEntryId: entry.id, durationMs: Math.max(0, time - previous.time), classification: "unknown" });
          previous = { id: entry.id, time };
        }
      }
      if (entry.role) roleCounts[entry.role] = (roleCounts[entry.role] ?? 0) + 1;
      if (entry.role === "user") pendingUser = entry;
      if (entry.role === "assistant") {
        if (entry.usage) {
          totalTokens += entry.usage.totalTokens ?? 0;
          if (typeof entry.usage.cost === "number") { cost += entry.usage.cost; hasCost = true; }
          addUsage(usageTotals, entry.usage);
          const provider = entry.provider ?? "unknown";
          const model = entry.model ?? "unknown";
          if (entry.provider && entry.model) attributedProviderModelCalls++;
          const key = `${provider}\u0000${model}`;
          if (!usageGroups.has(key)) usageGroups.set(key, { provider, model, totals: emptyUsageTotals() });
          addUsage(usageGroups.get(key).totals, entry.usage);
        }
        for (const call of entry.toolCalls ?? []) {
          toolCalls[call.name] ??= { total: 0, errors: 0 };
          toolCalls[call.name].total++;
        }
        if (pendingUser && entry.stopReason === "stop") {
          const start = Date.parse(pendingUser.timestamp);
          const end = Date.parse(entry.timestamp);
          if (!Number.isNaN(start) && !Number.isNaN(end)) turnaroundWindows.push({ sessionId: session.sessionId, userEntryId: pendingUser.id, assistantEntryId: entry.id, startedAt: pendingUser.timestamp, endedAt: entry.timestamp, durationMs: Math.max(0, end - start), classification: "observable-turnaround-not-active-time" });
          pendingUser = undefined;
        }
      }
      if (entry.role === "toolResult" && entry.toolName) {
        toolCalls[entry.toolName] ??= { total: 0, errors: 0 };
        if (entry.isError) toolCalls[entry.toolName].errors++;
      }
    }
  }

  unknownGaps.sort((left, right) => right.durationMs - left.durationMs);
  return {
    observableWindow: timestamps.length ? { startedAt: new Date(Math.min(...timestamps)).toISOString(), endedAt: new Date(Math.max(...timestamps)).toISOString(), durationMs: Math.max(...timestamps) - Math.min(...timestamps), classification: "wall-clock-observation-window" } : undefined,
    roleCounts,
    toolCalls,
    turnaroundWindows,
    largestUnknownGaps: unknownGaps.slice(0, 10),
    tokenUsage: { totalTokens, ...(hasCost ? { costUsd: Number(cost.toFixed(6)) } : {}) },
    usage: {
      ...finishUsage(usageTotals),
      providerModelCoverage: {
        attributedCalls: attributedProviderModelCalls,
        unattributedCalls: usageTotals.calls - attributedProviderModelCalls,
        ratio: usageTotals.calls ? attributedProviderModelCalls / usageTotals.calls : null,
      },
      byProviderModel: [...usageGroups.values()]
        .map(({ provider, model, totals }) => ({ provider, model, ...finishUsage(totals) }))
        .sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
    },
  };
}

function artifactSnapshot(root) {
  if (!existsSync(root)) throw new Error(`Workstream does not exist: ${root}`);
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        const bytes = readFileSync(path);
        files.push({ path: relative(root, path).replaceAll("\\", "/"), size: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  walk(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function parseManifest(path) {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const frontmatter = text.startsWith("---\n") ? text.split("---\n", 3)[1] : "";
  const value = (key) => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  return { currentStage: value("current_stage"), status: value("status"), updatedAt: value("updated_at") };
}

function gitSnapshot(target) {
  const run = (args) => {
    try { return execFileSync("git", ["-C", target, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
    catch { return ""; }
  };
  return {
    branch: run(["branch", "--show-current"]) || "unknown",
    head: run(["rev-parse", "--verify", "HEAD"]) || "unborn",
    statusPorcelainV2: run(["status", "--porcelain=v2", "--branch"]),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = canonical(options.target);
  const sessionsRoot = canonical(options.sessionsRoot ?? join(homedir(), ".pi", "agent", "sessions"));
  const stateRoot = resolve(
    options.stateRoot ?? process.env.MYFLOW_OBSERVATION_DIR ?? repositoryObservationRoot(target),
  );
  const workstreamRoot = join(target, ".myflow", "workstreams", options.workstream);
  const privateDir = join(stateRoot, options.workstream);
  const statePath = join(privateDir, "state.json");
  const accountPath = join(privateDir, "account.md");
  mkdirSync(privateDir, { recursive: true });
  if (!existsSync(accountPath)) writeFileSync(accountPath, "", { mode: 0o600, flag: "wx" });
  const previous = readJson(statePath, { schemaVersion: STATE_VERSION, observerSessionIds: [], sessions: {}, artifactHashes: {} });
  const observerIds = new Set(previous.observerSessionIds ?? []);
  for (const sessionId of [process.env.PI_SESSION_ID, process.env.PI_SUBAGENT_PARENT_SESSION, ...options.observerSessions]) {
    if (sessionId) observerIds.add(sessionId);
  }

  const excludedSessions = [];
  const included = [];
  for (const path of listSessionFiles(sessionsRoot)) {
    const parsed = completeRecords(path);
    const header = parsed.records.find((record) => record.value?.type === "session")?.value;
    if (!header?.id || !header.cwd) continue;
    if (canonical(header.cwd) !== target) continue;
    if (observerIds.has(header.id)) {
      excludedSessions.push({ sessionId: header.id, reason: "observer" });
      continue;
    }
    const completeText = parsed.bytes.subarray(0, parsed.completeOffset).toString("utf8");
    if (!completeText.includes(`.myflow/workstreams/${options.workstream}`)) {
      excludedSessions.push({ sessionId: header.id, reason: "no-workstream-evidence" });
      continue;
    }
    const entryRecords = parsed.records.filter((record) => record.value?.id && record.value.type !== "session");
    const old = previous.sessions?.[header.id];
    let integrity = "new";
    let newRecords = entryRecords;
    if (old) {
      const prefixMatches = parsed.completeOffset >= old.offset && sha256(parsed.bytes.subarray(0, old.offset)) === old.prefixSha256;
      if (prefixMatches) {
        integrity = "append-only";
        newRecords = entryRecords.filter((record) => record.endOffset > old.offset);
      } else {
        integrity = "reindexed";
        const processed = new Set(old.processedEntryIds ?? []);
        newRecords = entryRecords.filter((record) => !processed.has(record.value.id));
      }
    }
    const allEntries = entryRecords.map((record) => summarizeEntry(record, header.id));
    included.push({ path, sessionId: header.id, parsed, entryRecords, newRecords, allEntries, integrity });
  }

  const entries = included
    .flatMap((session) => session.newRecords.map((record) => summarizeEntry(record, session.sessionId)))
    .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)) || left.sessionId.localeCompare(right.sessionId));
  const artifacts = artifactSnapshot(workstreamRoot);
  const artifactHashes = Object.fromEntries(artifacts.map((artifact) => [artifact.path, artifact.sha256]));
  const changedArtifacts = artifacts.filter((artifact) => previous.artifactHashes?.[artifact.path] !== artifact.sha256);
  const artifactChangeBasis = Object.keys(previous.artifactHashes ?? {}).length === 0 ? "baseline" : "since-prior-checkpoint";
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const curatedDir = join(privateDir, "curated");
  const packet = {
    schemaVersion: SCHEMA_VERSION,
    analysisVersion: "observing-myflow-v1",
    mode: options.mode,
    source: "pi-jsonl",
    sourceCapabilities: { exactLifecycleSpans: false, persistedMessages: true, toolResults: true, branchesAndCompactions: true },
    generatedAt,
    targetCwd: target,
    workstreamId: options.workstream,
    includedSessionIds: included.map((session) => session.sessionId).sort(),
    excludedSessions: excludedSessions.sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
    newEntryCount: entries.length,
    entries,
    metrics: aggregateMetrics(included),
    stageSignals: stageSignals(entries, options.workstream),
    manifest: parseManifest(join(workstreamRoot, "workstream.md")),
    git: gitSnapshot(target),
    artifacts,
    changedArtifacts,
    artifactChangeBasis,
    limitations: [
      "JSONL timestamps provide observable ordering and turnaround windows, not active agent time.",
      "Unknown gaps cannot be assigned to human wait, provider time, tool time, or idle time without lifecycle telemetry.",
      "Session and artifact evidence cannot replace code review, verification, or product correctness checks.",
    ],
    private: { statePath, accountPath, snapshotPath: "", suggestedAnalysisPath: join(privateDir, "analysis", `${stamp}_${options.workstream}-analysis.json`) },
    curated: {
      suggestedReportPath: join(curatedDir, `${stamp}_${options.workstream}-flow-account.md`),
      suggestedTeamMetricsPath: join(curatedDir, `${stamp}_${options.workstream}-team-flow.json`),
    },
  };
  const snapshotId = `${stamp}_${sha256(JSON.stringify({ entries: entries.map((entry) => entry.id), artifactHashes, mode: options.mode })).slice(0, 10)}`;
  const snapshotPath = join(privateDir, "evidence", `${snapshotId}.json`);
  packet.private.snapshotPath = snapshotPath;
  writeJson(snapshotPath, packet);

  const nextState = {
    schemaVersion: STATE_VERSION,
    updatedAt: generatedAt,
    targetCwd: target,
    workstreamId: options.workstream,
    observerSessionIds: [...observerIds].sort(),
    artifactHashes,
    latestSnapshotPath: snapshotPath,
    sessions: Object.fromEntries(included.map((session) => {
      const processedEntryIds = session.entryRecords.map((record) => record.value.id);
      return [session.sessionId, {
        relativePath: relative(sessionsRoot, session.path).replaceAll("\\", "/"),
        offset: session.parsed.completeOffset,
        lineCount: session.parsed.records.length,
        lastEntryId: processedEntryIds.at(-1),
        prefixSha256: sha256(session.parsed.bytes.subarray(0, session.parsed.completeOffset)),
        processedEntryIds,
      }];
    })),
  };
  writeJson(statePath, nextState);

  const receipt = {
    schemaVersion: packet.schemaVersion,
    analysisVersion: packet.analysisVersion,
    mode: packet.mode,
    source: packet.source,
    generatedAt,
    workstreamId: packet.workstreamId,
    includedSessionIds: packet.includedSessionIds,
    excludedSessions: packet.excludedSessions,
    newEntryCount: packet.newEntryCount,
    changedArtifactCount: packet.changedArtifacts.length,
    artifactChangeBasis: packet.artifactChangeBasis,
    private: packet.private,
    curated: packet.curated,
    limitations: packet.limitations,
  };
  process.stdout.write(`${JSON.stringify(options.receiptOnly ? receipt : packet, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
  process.exitCode = 1;
}
