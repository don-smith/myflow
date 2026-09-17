import { createHash } from "node:crypto";

import { appendPrivateRecord } from "../../../../../skills/myflow/scripts/lib/private-store.mjs";
import { canonicalJson } from "../../../../../skills/myflow/scripts/lib/lifecycle-contract.mjs";

export const OUTBOX_STATUSES = Object.freeze([
  "pending",
  "sent-unconfirmed",
  "confirmed",
  "conflicted",
]);

export const OUTBOX_SCHEMA_VERSION = "myflow-publication-outbox/v1";

function entryId(traceId, observationId, revision, suffix) {
  const key = `outbox:${traceId}:${observationId}:${revision}:${suffix ?? Date.now()}`;
  return `out_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

function payloadDigest(projection) {
  return createHash("sha256").update(canonicalJson(projection)).digest("hex");
}

export function createOutboxEntry({
  repository,
  workstreamId,
  attemptId,
  attemptOrdinal,
  canonicalStage,
  revision,
  traceId,
  observationId,
  projectionDigest,
  scoreIds,
  idempotencyKey,
}) {
  const entry = {
    schemaVersion: OUTBOX_SCHEMA_VERSION,
    entryId: entryId(traceId, observationId, revision),
    repository: typeof repository === "string" ? repository : repository.value,
    workstreamId,
    attemptId,
    attemptOrdinal,
    canonicalStage,
    revision,
    traceId,
    observationId,
    scoreIds,
    projectionDigest,
    idempotencyKey,
    status: "pending",
    createdAt: new Date().toISOString(),
    sentAt: null,
    confirmedAt: null,
    conflictedAt: null,
    conflictEvidence: null,
    retryCount: 0,
    lastError: null,
  };

  return entry;
}

export function updateOutboxSent(entry, sentAt) {
  return {
    ...entry,
    entryId: entryId(entry.traceId, entry.observationId, entry.revision, "sent"),
    status: "sent-unconfirmed",
    sentAt: sentAt ?? new Date().toISOString(),
    retryCount: entry.retryCount,
  };
}

export function updateOutboxConfirmed(entry, confirmedAt) {
  return {
    ...entry,
    entryId: entryId(entry.traceId, entry.observationId, entry.revision, "confirmed"),
    status: "confirmed",
    confirmedAt: confirmedAt ?? new Date().toISOString(),
  };
}

export function updateOutboxConflict(entry, evidence) {
  return {
    ...entry,
    entryId: entryId(entry.traceId, entry.observationId, entry.revision, "conflicted"),
    status: "conflicted",
    conflictedAt: new Date().toISOString(),
    conflictEvidence: evidence,
  };
}

export function updateOutboxRetry(entry, error) {
  return {
    ...entry,
    entryId: entryId(entry.traceId, entry.observationId, entry.revision, `retry-${(entry.retryCount ?? 0) + 1}`),
    status: "pending",
    sentAt: null,
    retryCount: (entry.retryCount ?? 0) + 1,
    lastError: typeof error === "string" ? error : error?.message ?? "unknown error",
  };
}

export async function storeOutboxEntry({
  repositoryRoot,
  stateRoot,
  home,
  workstreamId,
  entry,
}) {
  entry.recordId = entry.entryId;
  const result = await appendPrivateRecord({
    repositoryRoot,
    stateRoot,
    home,
    workstreamId,
    category: "publication-outbox",
    record: entry,
    validateExisting: (existing, candidate) => {
      const existingEntry = existing.find((e) => e.attemptId === candidate.attemptId && e.revision === candidate.revision);
      if (existingEntry && existingEntry.status === "confirmed") {
        throw new Error(`outbox entry for attempt ${candidate.attemptId} revision ${candidate.revision} is already confirmed`);
      }
    },
  });
  return result;
}

export function findExistingOutboxEntry(existingRecords, attemptId, revision) {
  return existingRecords.find((e) => e.attemptId === attemptId && e.revision === revision);
}

export function findConfirmedOutboxEntry(existingRecords, attemptId) {
  return existingRecords
    .filter((e) => e.attemptId === attemptId)
    .find((e) => e.status === "confirmed");
}

export function isNoOpReplay(entry, projectionOrDigest) {
  const digest = typeof projectionOrDigest === "string"
    ? projectionOrDigest
    : payloadDigest(projectionOrDigest);
  return entry.projectionDigest === digest && entry.status === "confirmed";
}