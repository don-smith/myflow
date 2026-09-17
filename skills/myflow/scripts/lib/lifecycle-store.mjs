import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  truncate,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  LIFECYCLE_SCHEMA_VERSION,
  assertRepositoryRelativePath,
  canonicalJson,
  comparableLifecycleIntent,
  lifecycleEventId,
  validateLifecycleEvent,
} from "./lifecycle-contract.mjs";
import {
  applyLifecycleEvent,
  eventAttemptMetadata,
  reduceLifecycle,
} from "./lifecycle-reducer.mjs";
import { acquireLock } from "./lock.mjs";

async function parseJournal(journalPath) {
  let buffer;
  try {
    buffer = await readFile(journalPath);
  } catch (error) {
    if (error.code === "ENOENT") return { events: [], crashTail: null, validBytes: 0 };
    throw error;
  }
  if (buffer.length === 0) return { events: [], crashTail: null, validBytes: 0 };

  const text = buffer.toString("utf8");
  const hasCrashTail = !text.endsWith("\n");
  const finalNewline = text.lastIndexOf("\n");
  const completeText = hasCrashTail ? text.slice(0, finalNewline + 1) : text;
  const crashTail = hasCrashTail ? text.slice(finalNewline + 1) : null;
  const lines = completeText.split("\n").filter((line) => line.length > 0);
  const events = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid lifecycle JSON at line ${index + 1}: ${error.message}`);
    }
  });
  return {
    events,
    crashTail,
    validBytes: Buffer.byteLength(completeText),
  };
}

export async function readLifecycleJournal(journalPath, { allowCrashTail = false } = {}) {
  const parsed = await parseJournal(journalPath);
  if (parsed.crashTail !== null && !allowCrashTail) {
    throw new Error("lifecycle journal has an incomplete crash tail");
  }
  return parsed;
}

async function artifactReference(repositoryRoot, artifactPath) {
  assertRepositoryRelativePath(artifactPath);
  const canonicalRoot = await realpath(repositoryRoot);
  const absolutePath = resolve(canonicalRoot, artifactPath);
  let canonicalArtifact;
  try {
    canonicalArtifact = await realpath(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`artifact does not exist: ${artifactPath}`);
    throw error;
  }
  if (canonicalArtifact !== canonicalRoot && !canonicalArtifact.startsWith(`${canonicalRoot}${sep}`)) {
    throw new Error("artifact path must remain inside the repository root");
  }
  const artifactStat = await stat(canonicalArtifact);
  if (!artifactStat.isFile()) throw new Error(`artifact is not a file: ${artifactPath}`);
  const contents = await readFile(canonicalArtifact);
  return {
    path: artifactPath,
    digest: createHash("sha256").update(contents).digest("hex"),
  };
}

async function buildEvent(input, state, previousEventId, existing) {
  const {
    journalPath,
    repositoryRoot,
    artifactPath,
    lockOptions,
    targetAttemptId,
    ...semanticInput
  } = input;
  const event = {
    schemaVersion: LIFECYCLE_SCHEMA_VERSION,
    ...semanticInput,
    occurredAt: existing?.occurredAt ?? semanticInput.occurredAt ?? new Date().toISOString(),
    previousEventId: existing?.previousEventId ?? previousEventId,
  };
  Object.assign(event, existing ? {
    attemptId: existing.attemptId,
    attemptOrdinal: existing.attemptOrdinal,
  } : eventAttemptMetadata(state, { ...event, targetAttemptId }));
  event.eventId = lifecycleEventId(event);
  if (artifactPath !== undefined) event.artifactRef = await artifactReference(repositoryRoot, artifactPath);
  return event;
}

export async function appendLifecycleEvent(input) {
  if (!input.journalPath) throw new Error("appendLifecycleEvent requires journalPath");
  if (!input.repositoryRoot) throw new Error("appendLifecycleEvent requires repositoryRoot");
  if (!input.idempotencyKey) throw new Error("appendLifecycleEvent requires idempotencyKey");
  await mkdir(dirname(input.journalPath), { recursive: true });
  const lockPath = `${input.journalPath}.lock`;
  const release = await acquireLock(lockPath, { ...input.lockOptions, description: `lifecycle journal: ${input.journalPath}` });

  try {
    const parsed = await parseJournal(input.journalPath);
    let recoveredCrashTail = false;
    if (parsed.crashTail !== null) {
      await truncate(input.journalPath, parsed.validBytes);
      recoveredCrashTail = true;
    }
    const state = reduceLifecycle(parsed.events);
    const eventId = lifecycleEventId(input);
    const existing = parsed.events.find((event) => event.eventId === eventId);
    const candidate = await buildEvent(input, state, state.lastEventId, existing);
    validateLifecycleEvent(candidate);

    if (existing) {
      if (
        canonicalJson(comparableLifecycleIntent(existing)) !==
        canonicalJson(comparableLifecycleIntent(candidate))
      ) {
        throw new Error(`idempotency key would rewrite a historical event: ${input.idempotencyKey}`);
      }
      return {
        schemaVersion: LIFECYCLE_SCHEMA_VERSION,
        journalPath: input.journalPath,
        event: existing,
        duplicate: true,
        recoveredCrashTail,
      };
    }

    applyLifecycleEvent(state, candidate);
    await appendFile(input.journalPath, `${JSON.stringify(candidate)}\n`, { encoding: "utf8", flag: "a" });
    const file = await open(input.journalPath, "r");
    try {
      await file.sync();
    } finally {
      await file.close();
    }
    return {
      schemaVersion: LIFECYCLE_SCHEMA_VERSION,
      journalPath: input.journalPath,
      event: candidate,
      duplicate: false,
      recoveredCrashTail,
    };
  } finally {
    await release();
  }
}

export async function validateLifecycleJournal(journalPath) {
  try {
    const { events, crashTail } = await parseJournal(journalPath);
    if (crashTail !== null) {
      return {
        valid: false,
        eventCount: events.length,
        errors: ["lifecycle journal has an incomplete crash tail"],
      };
    }
    const state = reduceLifecycle(events);
    return { valid: true, eventCount: events.length, errors: [], state };
  } catch (error) {
    return { valid: false, eventCount: 0, errors: [error.message] };
  }
}
