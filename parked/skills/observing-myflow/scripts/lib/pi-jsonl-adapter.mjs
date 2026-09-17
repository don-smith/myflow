import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { USAGE_DIMENSIONS } from "./normalized-evidence.mjs";

const numeric = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Pi JSONL recovery adapter.
 *
 * Reads Pi session JSONL files and emits normalized evidence rows
 * in the same contract as the Langfuse v2 adapter.
 *
 * Source capabilities: tool results present, persisted messages,
 * but no exact lifecycle spans.
 */
export function jsonlSourceCapabilities() {
  return {
    exactLifecycleSpans: false,
    persistedMessages: true,
    toolResults: true,
    branchesAndCompactions: true,
    rawInputOutput: false,
  };
}

/**
 * Validate that a workstream ID is filesystem-safe.
 */
function assertSafeId(value, name) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new Error(`${name} must be filesystem-safe`);
  }
}

/**
 * Walk a Pi sessions directory and find all .jsonl files,
 * excluding subagent-artifacts directories.
 */
export function listSessionFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  function walk(directory) {
    if (!existsSync(directory)) return;
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

/**
 * Read complete (non-truncated) records from a JSONL file.
 * Returns bytes, completeOffset, and parsed records with offsets.
 */
export function completeRecords(path) {
  const bytes = readFileSync(path);
  const finalNewline = bytes.lastIndexOf(0x0a);
  if (finalNewline < 0) {
    return { bytes, completeOffset: 0, records: [] };
  }

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
        records.push({
          value: JSON.parse(raw),
          startOffset: start,
          endOffset,
          lineNumber,
        });
      } catch {
        records.push({
          value: undefined,
          startOffset: start,
          endOffset,
          lineNumber,
          parseError: true,
        });
      }
    }
    start = endOffset;
  }

  return { bytes, completeOffset: finalNewline + 1, records };
}

/**
 * Check whether a Pi session header matches the target worktree.
 */
export function sessionMatchesWorktree(sessionHeader, target) {
  if (!sessionHeader?.id || !sessionHeader.cwd) return false;
  try {
    const sessionCwd = resolve(sessionHeader.cwd);
    const targetResolved = resolve(target);
    const sessionReal = existsSync(sessionCwd) ? realpathSync(sessionCwd) : sessionCwd;
    const targetReal = existsSync(targetResolved) ? realpathSync(targetResolved) : targetResolved;
    return sessionReal === targetReal;
  } catch {
    return false;
  }
}

/**
 * Check whether Pi session content references a workstream by looking
 * for the workstream path pattern in the complete text of the JSONL.
 */
export function sessionContainsWorkstream(
  bytes,
  completeOffset,
  workstreamId,
) {
  const completeText = bytes.subarray(0, completeOffset).toString("utf8");
  return completeText.includes(`.myflow/workstreams/${workstreamId}`);
}

/**
 * Parse the first record from a JSONL file (usually the session header).
 */
export function parseSessionHeader(path) {
  const parsed = completeRecords(path);
  const header = parsed.records.find(
    (record) => record.value?.type === "session",
  )?.value;
  return header || null;
}

/**
 * Normalize a Pi JSONL entry in model-usage or tool-event type
 * into a normalized evidence row.
 */
export function normalizeJsonlEntry(entry) {
  if (!entry) return null;

  // Handle model-usage entries
  if (entry.type === "model-usage" || (entry.role === "assistant" && entry.usage)) {
    const u = entry.usage || entry;
    return {
      source: "pi-jsonl",
      sourceId: entry.id,
      rowId: `pi-jsonl:${entry.id}`,
      traceId: null,
      parentObservationId: null,
      type: "GENERATION",
      knownType: true,
      name: "LLM Call",
      startTime: entry.timestamp || entry.startTime,
      endTime: null,
      isRootCapability: false,
      rootObservationId: undefined,
      emittingSessionId: entry.sessionId,
      groupingSessionId: entry.sessionId,
      turnNumber: numeric(entry.turnNumber),
      pluginName: undefined,
      pluginVersion: undefined,
      pluginCapability: undefined,
      provider: entry.provider || null,
      model: entry.model || null,
      assistantIndex: numeric(entry.assistantIndex),
      callOrder: numeric(entry.callOrder),
      toolCallId: undefined,
      level: null,
      statusMessage: null,
      state: "ok",
      usage: {
        uncachedInputTokens: numeric(u.input),
        cacheReadTokens: numeric(u.cacheRead),
        cacheWriteTokens: numeric(u.cacheWrite),
        outputTokens: numeric(u.output),
        reasoningTokens: numeric(u.reasoning),
        totalTokens: numeric(u.totalTokens),
      },
      cost: { recordedTotal: numeric(u.cost?.total) },
      costKnown: numeric(u.cost?.total) !== undefined,
      contextSources: { source: "pi-jsonl-entry" },
      provenance: [entry.id],
    };
  }

  // Handle tool-event entries
  if (entry.type === "tool-event" || entry.role === "toolResult") {
    return {
      source: "pi-jsonl",
      sourceId: entry.id,
      rowId: `pi-jsonl:${entry.id}`,
      traceId: null,
      parentObservationId: null,
      type: "TOOL",
      knownType: true,
      name: entry.toolName ? `Tool: ${entry.toolName}` : "Tool",
      startTime: entry.timestamp,
      endTime: null,
      isRootCapability: false,
      rootObservationId: undefined,
      emittingSessionId: entry.sessionId,
      groupingSessionId: entry.sessionId,
      turnNumber: numeric(entry.turnNumber),
      pluginName: undefined,
      pluginVersion: undefined,
      pluginCapability: undefined,
      provider: null,
      model: null,
      assistantIndex: undefined,
      callOrder: undefined,
      toolCallId: entry.toolCallId,
      level: null,
      statusMessage: null,
      state: entry.isError ? "error" : "ok",
      usage: {
        uncachedInputTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
        outputTokens: undefined,
        reasoningTokens: undefined,
        totalTokens: undefined,
      },
      cost: { recordedTotal: undefined },
      costKnown: false,
      contextSources: { source: "pi-jsonl-entry" },
      provenance: [entry.id],
    };
  }

  return null;
}

/**
 * Extract normalized evidence rows from Pi JSONL session records.
 * Accepts entry records (not session headers) and their session ID.
 */
export function extractEvidenceFromSession(entryRecords, sessionId) {
  const rows = [];

  for (const record of entryRecords) {
    const entry = record.value;
    if (!entry || !entry.id) continue;
    if (entry.type === "session") continue;

    // Enrich with session context before normalizing
    const enriched = {
      ...entry,
      sessionId: sessionId,
    };

    // Try to infer turn number from message parent
    if (entry.turnNumber === undefined && entry.type === "message") {
      enriched.turnNumber = undefined;
    }

    const normalized = normalizeJsonlEntry(enriched);
    if (normalized) rows.push(normalized);
  }

  return rows;
}

/**
 * Extract normalized evidence from a list of session file paths,
 * filtered to a target worktree and workstream.
 */
export function extractFromSessions({
  sessionsRoot,
  target,
  workstreamId,
  excludeSessionIds = [],
}) {
  assertSafeId(workstreamId, "workstreamId");

  const files = listSessionFiles(sessionsRoot);
  const included = [];
  const excluded = [];

  const excludeSet = new Set(excludeSessionIds);

  for (const path of files) {
    const parsed = completeRecords(path);
    const header = parsed.records.find(
      (record) => record.value?.type === "session",
    )?.value;

    if (!sessionMatchesWorktree(header, target)) continue;

    if (excludeSet.has(header.id)) {
      excluded.push({ sessionId: header.id, reason: "observer" });
      continue;
    }

    if (!sessionContainsWorkstream(parsed.bytes, parsed.completeOffset, workstreamId)) {
      excluded.push({ sessionId: header.id, reason: "no-workstream-evidence" });
      continue;
    }

    const entryRecords = parsed.records.filter(
      (record) => record.value?.id && record.value.type !== "session",
    );

    included.push({
      path,
      sessionId: header.id,
      entryRecords,
    });
  }

  const rows = [];
  for (const session of included) {
    const sessionRows = extractEvidenceFromSession(
      session.entryRecords,
      session.sessionId,
    );
    rows.push(...sessionRows);
  }

  return {
    rows,
    includedSessionIds: included.map((s) => s.sessionId).sort(),
    excludedSessions: excluded.sort((a, b) =>
      a.sessionId.localeCompare(b.sessionId),
    ),
    sourceCapabilities: jsonlSourceCapabilities(),
  };
}

/**
 * Compute parity comparison fields between a Langfuse normalized row
 * and a JSONL normalized row. Both must be normalized to the same contract.
 */
export function parityDimensions() {
  return [...USAGE_DIMENSIONS, "recordedCost"];
}

/**
 * Compare two normalized rows by their usage and cost dimensions.
 * Returns per-field comparison results.
 */
export function compareNormalizedRows(langfuseRow, jsonlRow) {
  const fields = parityDimensions();
  const results = [];

  for (const field of fields) {
    let a, b;
    if (field === "recordedCost") {
      a = langfuseRow.cost?.recordedTotal;
      b = jsonlRow.cost?.recordedTotal;
    } else {
      a = langfuseRow.usage[field];
      b = jsonlRow.usage[field];
    }

    const status =
      a === undefined || b === undefined
        ? "source-missing"
        : a === b
          ? "equal"
          : "different";

    results.push({ field, status, langfuse: a, jsonl: b });
  }

  return results;
}