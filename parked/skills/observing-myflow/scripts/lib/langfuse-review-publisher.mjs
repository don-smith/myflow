import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveRepositoryContext } from "../../../../../skills/myflow/scripts/lib/repository-context.mjs";
import { readLifecycleJournal, reduceJournalEvents } from "./attempt-economics.mjs";
import {
  privateObservationRoot,
} from "../../../../../skills/myflow/scripts/lib/private-store.mjs";
import {
  projectTrace,
  projectReturnDiagnosticScores,
  validatePayloadAllowlist,
  compatibilityReceipt,
  SYNTHETIC_TRACE_ROOT_NAME,
  SCORE_NAMES,
  buildStableTraceId,
  buildStableObservationId,
} from "./review-projection.mjs";
import {
  createOutboxEntry,
  storeOutboxEntry,
  updateOutboxSent,
  updateOutboxConfirmed,
  updateOutboxConflict,
  updateOutboxRetry,
  findExistingOutboxEntry,
  findConfirmedOutboxEntry,
  isNoOpReplay,
  OUTBOX_STATUSES,
} from "./publication-outbox.mjs";

const DEFAULT_BASE_URL = "https://cloud.langfuse.com";
const DEFAULT_INGESTION_DELAY_MS = 3000;
const DEFAULT_CONFIRM_TIMEOUT_MS = 15000;

function getCredentials() {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || DEFAULT_BASE_URL;

  if (!publicKey || !secretKey) {
    return null;
  }

  return { publicKey, secretKey, baseUrl };
}

function authHeader(credentials) {
  const encoded = Buffer.from(`${credentials.publicKey}:${credentials.secretKey}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

async function apiRequest(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let body = "";
    try { body = await response.text(); } catch { /* ignore */ }
    const truncated = body.length > 500 ? body.slice(0, 500) + "..." : body;
    throw new Error(`Langfuse API ${response.status}: ${truncated}`);
  }

  return response;
}

async function postObservation(credentials, observation) {
  const url = `${credentials.baseUrl}/api/public/observations`;
  const response = await apiRequest(url, {
    method: "POST",
    headers: authHeader(credentials),
    body: JSON.stringify(observation),
  });
  return response.json();
}

async function postScore(credentials, score) {
  const url = `${credentials.baseUrl}/api/public/scores`;
  const response = await apiRequest(url, {
    method: "POST",
    headers: authHeader(credentials),
    body: JSON.stringify(score),
  });
  return response.json();
}

async function getObservation(credentials, observationId) {
  const url = `${credentials.baseUrl}/api/public/observations/${observationId}`;
  const response = await apiRequest(url, {
    method: "GET",
    headers: authHeader(credentials),
  });
  return response.json();
}

async function checkScoreConfigs(credentials, scoreNames) {
  const results = [];
  for (const name of scoreNames) {
    try {
      const url = `${credentials.baseUrl}/api/public/score-configs?name=${encodeURIComponent(name)}`;
      const response = await apiRequest(url, {
        method: "GET",
        headers: authHeader(credentials),
      });
      const data = await response.json();
      results.push({ name, exists: data?.data?.length > 0, configs: data?.data ?? [] });
    } catch (error) {
      results.push({ name, exists: false, error: error.message });
    }
  }
  return results;
}

async function createScoreConfig(credentials, name, dataType) {
  const url = `${credentials.baseUrl}/api/public/score-configs`;
  const response = await apiRequest(url, {
    method: "POST",
    headers: authHeader(credentials),
    body: JSON.stringify({
      name,
      dataType,
      description: `MyFlow synthetic stage review score: ${name}`,
    }),
  });
  return response.json();
}

export async function dryRunPublish(review, { workstreamId, repositoryRoot, stateRoot, home } = {}) {
  let context = null;
  try {
    context = repositoryRoot ? resolveRepositoryContext(repositoryRoot) : null;
  } catch {
    // Non-git directory is acceptable for dry-run.
  }
  const repository = context?.identity ?? { kind: "unknown", value: "unknown" };

  const inputDigest = review.inputs?.lifecycleDigest ?? "unknown";
  const projection = projectTrace(repository, workstreamId ?? review.workstreamId, review.attemptId, review);

  for (const score of projection.scores) {
    validatePayloadAllowlist(score, `score ${score.scoreName}`);
  }
  validatePayloadAllowlist(projection.trace, "trace");
  validatePayloadAllowlist(projection.observation, "observation");

  const credentials = getCredentials();

  const receipt = {
    mode: "dry-run",
    projectionDigest: projection.projectionDigest,
    traceId: projection.traceId,
    observationId: projection.observationId,
    scoreCount: projection.scores.length,
    scoreIds: projection.scoreIds,
    wouldPublish: {
      trace: !!credentials,
      observation: !!credentials,
      scores: !!credentials ? projection.scores.map((s) => s.scoreName) : [],
    },
    credentialsAvailable: !!credentials,
    baseUrl: credentials?.baseUrl ?? "not configured",
    validation: {
      allowlistPassed: true,
      forbiddenContentDetected: false,
    },
    payloadSizes: {
      traceBytes: JSON.stringify(projection.trace).length,
      observationBytes: JSON.stringify(projection.observation).length,
      scoresBytes: JSON.stringify(projection.scores).length,
      totalBytes: JSON.stringify(projection).length,
    },
  };

  return { projection, receipt };
}

export async function publishReview(review, {
  workstreamId,
  repositoryRoot,
  stateRoot,
  home,
  publish = false,
  confirm = false,
  ingestionDelayMs = DEFAULT_INGESTION_DELAY_MS,
} = {}) {
  if (!publish) {
    return dryRunPublish(review, { workstreamId, repositoryRoot, stateRoot, home });
  }

  const credentials = getCredentials();
  if (!credentials) {
    throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required for publication");
  }

  const context = repositoryRoot ? resolveRepositoryContext(repositoryRoot) : null;
  const repository = context?.identity ?? { kind: "unknown", value: "unknown" };

  const projection = projectTrace(repository, workstreamId ?? review.workstreamId, review.attemptId, review);

  for (const score of projection.scores) {
    validatePayloadAllowlist(score, `score ${score.scoreName}`);
  }
  validatePayloadAllowlist(projection.trace, "trace");
  validatePayloadAllowlist(projection.observation, "observation");

  let entry = createOutboxEntry({
    repository: repository.value,
    workstreamId: workstreamId ?? review.workstreamId,
    attemptId: review.attemptId,
    attemptOrdinal: review.attemptOrdinal,
    canonicalStage: review.canonicalStage,
    revision: review.revision,
    traceId: projection.traceId,
    observationId: projection.observationId,
    projectionDigest: projection.projectionDigest,
    scoreIds: projection.scoreIds,
    idempotencyKey: `publish-${review.reviewId}`,
  });

  const stored = await storeOutboxEntry({
    repositoryRoot,
    stateRoot,
    home,
    workstreamId: workstreamId ?? review.workstreamId,
    entry,
  });

  entry = stored.record;

  if (stored.duplicate) {
    const confirmed = stored.record.status === "confirmed";
    return {
      mode: "publish",
      duplicate: true,
      status: stored.record.status,
      traceId: entry.traceId,
      observationId: entry.observationId,
      projectionDigest: projection.projectionDigest,
      scoreIds: entry.scoreIds,
      receipt: stored,
    };
  }

  if (entry.status !== "pending") {
    return {
      mode: "publish",
      status: entry.status,
      traceId: entry.traceId,
      observationId: entry.observationId,
      projectionDigest: projection.projectionDigest,
      scoreIds: entry.scoreIds,
      receipt: stored,
    };
  }

  let sendError = null;
  try {
    await postObservation(credentials, projection.observation);

    for (const score of projection.scores) {
      await postScore(credentials, score);
    }

    entry = updateOutboxSent(entry);
    const sent = await storeOutboxEntry({
      repositoryRoot,
      stateRoot,
      home,
      workstreamId: workstreamId ?? review.workstreamId,
      entry,
    });
    entry = sent.record;
  } catch (error) {
    sendError = error.message;
    entry = updateOutboxRetry(entry, error.message);
    const retried = await storeOutboxEntry({
      repositoryRoot,
      stateRoot,
      home,
      workstreamId: workstreamId ?? review.workstreamId,
      entry,
    });
    entry = retried.record;
  }

  const pubResult = {
    mode: "publish",
    status: entry.status,
    traceId: entry.traceId,
    observationId: entry.observationId,
    projectionDigest: projection.projectionDigest,
    scoreIds: entry.scoreIds,
    sentAt: entry.sentAt,
    sendError,
    retryCount: entry.retryCount,
  };

  if (confirm && entry.status === "sent-unconfirmed") {
    const confirmResult = await confirmPublication(entry, {
      credentials,
      ingestionDelayMs,
      repositoryRoot,
      stateRoot,
      home,
      workstreamId: workstreamId ?? review.workstreamId,
    });
    return { ...pubResult, confirmResult };
  }

  return pubResult;
}

export async function confirmPublication(entry, {
  credentials,
  ingestionDelayMs = DEFAULT_INGESTION_DELAY_MS,
  repositoryRoot,
  stateRoot,
  home,
  workstreamId,
  timeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS,
} = {}) {
  if (!credentials) {
    credentials = getCredentials();
  }
  if (!credentials) {
    throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required for confirmation");
  }

  const startTime = Date.now();
  let lastError = null;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const retrieved = await getObservation(credentials, entry.observationId);

      if (retrieved) {
        entry = updateOutboxConfirmed(entry);
        const confirmed = await storeOutboxEntry({
          repositoryRoot,
          stateRoot,
          home,
          workstreamId,
          entry,
        });
        return {
          status: "confirmed",
          confirmedAt: entry.confirmedAt,
          observationId: entry.observationId,
        };
      }
    } catch (error) {
      lastError = error.message;
    }

    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    const waitMs = Math.min(ingestionDelayMs, remaining);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    if (Date.now() - startTime >= timeoutMs) {
      break;
    }

    try {
      const retrieved = await getObservation(credentials, entry.observationId);
      if (retrieved) {
        entry = updateOutboxConfirmed(entry);
        const confirmed = await storeOutboxEntry({
          repositoryRoot,
          stateRoot,
          home,
          workstreamId,
          entry,
        });
        return {
          status: "confirmed",
          confirmedAt: entry.confirmedAt,
          observationId: entry.observationId,
        };
      }
    } catch (error) {
      lastError = error.message;
    }
  }

  return {
    status: "unconfirmed",
    timeoutMs,
    lastError,
    observationId: entry.observationId,
  };
}

export async function createMissingScoreConfigs({
  scoreNames = Object.values(SCORE_NAMES),
  dataTypes = {
    [SCORE_NAMES.DEVELOPER_STAGE_EXPERIENCE]: "CATEGORICAL",
    [SCORE_NAMES.STAGE_OUTCOME]: "CATEGORICAL",
    [SCORE_NAMES.STAGE_RETURNED]: "BOOLEAN",
    [SCORE_NAMES.RETURN_NATURE]: "CATEGORICAL",
    [SCORE_NAMES.RETURN_LATE_DISCOVERY]: "CATEGORICAL",
    [SCORE_NAMES.RETURN_OWNER_STAGE]: "CATEGORICAL",
    [SCORE_NAMES.RETURN_LOOP_MINUTES]: "NUMERIC",
    [SCORE_NAMES.RETURN_CALLS]: "NUMERIC",
    [SCORE_NAMES.RETURN_TOTAL_TOKENS]: "NUMERIC",
    [SCORE_NAMES.RETURN_RECORDED_COST_USD]: "NUMERIC",
    [SCORE_NAMES.RETURN_COST_COVERAGE]: "NUMERIC",
  },
} = {}) {
  const credentials = getCredentials();
  if (!credentials) {
    throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required");
  }

  const existing = await checkScoreConfigs(credentials, scoreNames);
  const created = [];
  const skipped = [];

  for (const result of existing) {
    if (result.error) {
      skipped.push({ name: result.name, reason: result.error });
      continue;
    }
    if (result.exists) {
      skipped.push({ name: result.name, reason: "already-exists" });
      continue;
    }

    try {
      const dataType = dataTypes[result.name] ?? "NUMERIC";
      await createScoreConfig(credentials, result.name, dataType);
      created.push({ name: result.name, dataType });
    } catch (error) {
      skipped.push({ name: result.name, reason: error.message });
    }
  }

  return {
    created,
    skipped,
    existing: existing.filter((e) => e.exists).map((e) => ({ name: e.name })),
    totalScoreNames: scoreNames.length,
  };
}

export function generateCompatibilityReceipt(packageTelemetryScores) {
  return compatibilityReceipt({ packageTelemetryScores });
}

export { buildStableTraceId, buildStableObservationId } from "./review-projection.mjs";
export { SCORE_NAMES } from "./review-projection.mjs";