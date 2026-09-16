import { createHash } from "node:crypto";
import { isAbsolute, posix } from "node:path";

export const LIFECYCLE_SCHEMA_VERSION = "myflow-lifecycle/v1";
export const CANONICAL_STAGES = Object.freeze(["Scope", "Plan", "Implement", "Verify", "Close"]);
export const TERMINAL_REASONS = Object.freeze([
  "advanced",
  "superseded",
  "abandoned",
  "workstream-closed",
]);
export const ACTIVITY_BY_STAGE = Object.freeze({
  Scope: Object.freeze(["scope", "research", "prototype", "other"]),
  Plan: Object.freeze(["design", "planning", "other"]),
  Implement: Object.freeze(["phase", "other"]),
  Verify: Object.freeze(["verification", "review", "other"]),
  Close: Object.freeze(["closeout", "other"]),
});
export const EVENT_KINDS = Object.freeze([
  "workstream.created",
  "stage.entered",
  "activity.entered",
  "activity.completed",
  "artifact.accepted",
  "stage.blocked",
  "stage.unblocked",
  "stage.completed",
  "return.opened",
  "return.rerouted",
  "return.owner-ready",
  "return.resumed",
  "return.closed",
  "verification.completed",
  "workstream.closed",
  "feedback.requested",
  "feedback.recorded",
]);
export const TRIGGER_SOURCES = Object.freeze([
  "developer-report",
  "verification-evidence",
  "agent-observation",
  "external-evidence",
  "tool-or-infrastructure",
  "unknown",
]);
export const CHANGE_KINDS = Object.freeze([
  "outcome-or-acceptance",
  "architecture",
  "plan",
  "implementation",
  "unknown",
]);

const COMMON_FIELDS = new Set([
  "schemaVersion",
  "eventId",
  "occurredAt",
  "repository",
  "workstreamId",
  "kind",
  "canonicalStage",
  "owningActivity",
  "attemptId",
  "attemptOrdinal",
  "source",
  "idempotencyKey",
  "previousEventId",
  "artifactRef",
  "executionRef",
]);

const FIELDS_BY_KIND = Object.freeze({
  "workstream.created": [],
  "stage.entered": [],
  "activity.entered": [],
  "activity.completed": [],
  "artifact.accepted": [],
  "stage.blocked": ["blockId", "reason"],
  "stage.unblocked": ["blockId"],
  "stage.completed": ["terminalReason"],
  "return.opened": [
    "episodeId",
    "detectingStage",
    "detectingActivity",
    "initialOwningStage",
    "initialOwningActivity",
    "originAttemptId",
    "triggerSource",
    "changeKind",
    "evidenceRefs",
  ],
  "return.rerouted": ["episodeId", "owningStage", "routeActivity", "changeKind", "evidenceRefs"],
  "return.owner-ready": ["episodeId"],
  "return.resumed": ["episodeId"],
  "return.closed": ["episodeId"],
  "verification.completed": ["episodeId", "verificationStatus"],
  "workstream.closed": [],
  "feedback.requested": [],
  "feedback.recorded": ["feedbackStatus", "privateRef"],
});

const REQUIRED_BY_KIND = Object.freeze({
  "stage.completed": ["terminalReason"],
  "stage.blocked": ["blockId", "reason"],
  "stage.unblocked": ["blockId"],
  "artifact.accepted": ["artifactRef"],
  "return.opened": [
    "episodeId",
    "detectingStage",
    "detectingActivity",
    "initialOwningStage",
    "initialOwningActivity",
    "originAttemptId",
    "triggerSource",
    "changeKind",
    "evidenceRefs",
  ],
  "return.rerouted": ["episodeId", "owningStage", "routeActivity", "changeKind", "evidenceRefs"],
  "return.owner-ready": ["episodeId"],
  "return.resumed": ["episodeId"],
  "return.closed": ["episodeId"],
  "verification.completed": ["verificationStatus"],
  "feedback.recorded": ["feedbackStatus", "privateRef"],
});

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function lifecycleEventId({ repository, workstreamId, kind, source, idempotencyKey }) {
  return `evt_${digest({ repository, workstreamId, kind, source, idempotencyKey }).slice(0, 32)}`;
}

export function lifecycleAttemptId({ repository, workstreamId, canonicalStage, attemptOrdinal }) {
  return `attempt_${digest({ repository, workstreamId, canonicalStage, attemptOrdinal }).slice(0, 32)}`;
}

export function stageIndex(stage) {
  return CANONICAL_STAGES.indexOf(stage);
}

export function assertRepositoryRelativePath(path) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    isAbsolute(path) ||
    path.includes("\\") ||
    posix.normalize(path) !== path ||
    path === ".." ||
    path.startsWith("../")
  ) {
    throw new Error("artifact path must be a normalized repository-relative path");
  }
}

function requireString(event, field) {
  if (typeof event[field] !== "string" || event[field].length === 0) {
    throw new Error(`${event.kind} requires ${field}`);
  }
}

export function validateLifecycleEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("event must be an object");
  if (event.schemaVersion !== LIFECYCLE_SCHEMA_VERSION) {
    throw new Error(`schemaVersion must be ${LIFECYCLE_SCHEMA_VERSION}`);
  }
  for (const field of ["eventId", "occurredAt", "workstreamId", "kind", "source", "idempotencyKey"]) {
    requireString(event, field);
  }
  if (!EVENT_KINDS.includes(event.kind)) throw new Error(`unsupported lifecycle event kind: ${event.kind}`);
  const allowedFields = new Set([...COMMON_FIELDS, ...FIELDS_BY_KIND[event.kind]]);
  const unknownFields = Object.keys(event).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new Error(`${event.kind} contains unsupported fields: ${unknownFields.join(", ")}`);
  }
  if (!event.repository || typeof event.repository.value !== "string" || !event.repository.value) {
    throw new Error("event requires canonical repository identity");
  }
  if (Number.isNaN(Date.parse(event.occurredAt)) || new Date(event.occurredAt).toISOString() !== event.occurredAt) {
    throw new Error("occurredAt must be an ISO timestamp");
  }
  if (!CANONICAL_STAGES.includes(event.canonicalStage)) throw new Error("event requires a canonicalStage");
  if (!ACTIVITY_BY_STAGE[event.canonicalStage].includes(event.owningActivity)) {
    throw new Error(`${event.owningActivity} is not an owning activity for ${event.canonicalStage}`);
  }
  if (event.previousEventId !== null && typeof event.previousEventId !== "string") {
    throw new Error("previousEventId must be a string or null");
  }
  const outsideAttempt = event.kind === "workstream.created" || event.kind === "workstream.closed";
  if (outsideAttempt) {
    if (event.attemptId !== null || event.attemptOrdinal !== null) {
      throw new Error(`${event.kind} must not identify a stage attempt`);
    }
  } else if (
    typeof event.attemptId !== "string" ||
    !event.attemptId ||
    !Number.isInteger(event.attemptOrdinal) ||
    event.attemptOrdinal < 1
  ) {
    throw new Error(`${event.kind} requires a stable attempt ID and positive ordinal`);
  }
  if (event.executionRef !== undefined) {
    if (!event.executionRef || typeof event.executionRef !== "object" || Array.isArray(event.executionRef)) {
      throw new Error("executionRef must be an object");
    }
    const executionFields = new Set([
      "host",
      "emittingSessionId",
      "groupingSessionId",
      "traceId",
      "observationId",
      "turnId",
      "capability",
    ]);
    const unsupported = Object.keys(event.executionRef).filter((field) => !executionFields.has(field));
    if (unsupported.length > 0) throw new Error(`executionRef contains unsupported fields: ${unsupported.join(", ")}`);
  }
  const expectedEventId = lifecycleEventId(event);
  if (event.eventId !== expectedEventId) throw new Error(`eventId integrity mismatch for ${event.eventId}`);

  for (const field of REQUIRED_BY_KIND[event.kind] ?? []) {
    if (event[field] === undefined || event[field] === null) throw new Error(`${event.kind} requires ${field}`);
  }
  if (event.kind === "stage.completed" && !TERMINAL_REASONS.includes(event.terminalReason)) {
    throw new Error(`unsupported terminal reason: ${event.terminalReason}`);
  }
  if (event.kind === "artifact.accepted") {
    assertRepositoryRelativePath(event.artifactRef.path);
    if (!/^[a-f0-9]{64}$/.test(event.artifactRef.digest)) throw new Error("artifactRef requires a SHA-256 digest");
  }
  if (event.kind === "return.opened") {
    if (!CANONICAL_STAGES.includes(event.detectingStage) || !CANONICAL_STAGES.includes(event.initialOwningStage)) {
      throw new Error("return.opened requires canonical detecting and owning stages");
    }
    if (!ACTIVITY_BY_STAGE[event.detectingStage].includes(event.detectingActivity)) {
      throw new Error("return.opened has an invalid detecting activity");
    }
    if (!ACTIVITY_BY_STAGE[event.initialOwningStage].includes(event.initialOwningActivity)) {
      throw new Error("return.opened has an invalid owning activity");
    }
    if (!TRIGGER_SOURCES.includes(event.triggerSource)) throw new Error("return.opened has an invalid trigger source");
    if (!CHANGE_KINDS.includes(event.changeKind)) throw new Error("return.opened has an invalid change kind");
    if (!Array.isArray(event.evidenceRefs)) throw new Error("return.opened evidenceRefs must be an array");
  }
  if (event.kind === "return.rerouted") {
    if (!CANONICAL_STAGES.includes(event.owningStage)) throw new Error("return.rerouted requires owningStage");
    if (!ACTIVITY_BY_STAGE[event.owningStage].includes(event.routeActivity)) {
      throw new Error("return.rerouted has an invalid owning activity");
    }
    if (!CHANGE_KINDS.includes(event.changeKind)) throw new Error("return.rerouted has an invalid change kind");
    if (!Array.isArray(event.evidenceRefs)) throw new Error("return.rerouted evidenceRefs must be an array");
  }
  return event;
}

export function comparableLifecycleIntent(event) {
  const { occurredAt, previousEventId, ...intent } = event;
  return intent;
}
