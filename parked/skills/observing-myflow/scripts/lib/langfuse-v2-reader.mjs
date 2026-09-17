/**
 * Langfuse v2 Observations API reader.
 *
 * Bounded reads against GET /api/public/v2/observations with:
 * - Exact field groups (core, basic, time, metadata, model, usage, metrics, trace_context).
 * - Full cursor chains for a fixed time window.
 * - Overlap and duplicate/conflict detection.
 * - Structured session filtering.
 * - Source capability negotiation.
 *
 * Does NOT request `io` field group by default.
 * Raw I/O is fetched only on explicit private analysis paths.
 */

import { createHash } from "node:crypto";

export const DEFAULT_BASE_URL = "http://localhost:13000";
export const DEFAULT_LIMIT = 50;
export const DEFAULT_FIELDS = [
  "core",
  "basic",
  "time",
  "metadata",
  "model",
  "usage",
  "metrics",
  "trace_context",
];

const numeric = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/**
 * Build a v2 observations URL for a bounded query.
 */
export function buildObservationsUrl({
  baseUrl = DEFAULT_BASE_URL,
  fromStartTime,
  toStartTime,
  fields = DEFAULT_FIELDS,
  limit = DEFAULT_LIMIT,
  cursor,
  filter,
  sessionId,
} = {}) {
  if (!fromStartTime) throw new Error("fromStartTime is required");

  const params = new URLSearchParams();
  params.set("fromStartTime", fromStartTime);
  if (toStartTime) params.set("toStartTime", toStartTime);
  params.set("fields", fields.join(","));
  params.set("limit", String(limit));

  if (cursor) params.set("cursor", cursor);

  // Structured session filter (preferred over first-class sessionId on 4.1.0)
  if (filter) params.set("filter", typeof filter === "string" ? filter : JSON.stringify(filter));
  else if (sessionId) params.set("filter", buildSessionFilter(sessionId));

  return `${baseUrl}/api/public/v2/observations?${params.toString()}`;
}

/**
 * Build a structured session-filter string for Langfuse 4.1.0+.
 */
export function buildSessionFilter(sessionId) {
  return JSON.stringify([
    {
      type: "string",
      column: "sessionId",
      operator: "=",
      value: sessionId,
    },
  ]);
}

/**
 * Read a single page of observations.
 * Returns parsed JSON on success, throws on non-200 or malformed response.
 */
export async function readObservationsPage(url, options = {}) {
  const { fetch: fetchImpl = globalThis.fetch, authHeader } = options;

  if (!authHeader) {
    throw new Error("authHeader is required (Basic base64 or equivalent)");
  }

  const headers = {
    Authorization: authHeader,
    Accept: "application/json",
  };

  const response = await fetchImpl(url, {
    method: "GET",
    headers,
    redirect: "error",
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const afterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
    throw Object.assign(
      new Error(`rate limited (Retry-After: ${retryAfter || "unknown"})`),
      {
        status: 429,
        retryAfterSeconds: afterSeconds,
      },
    );
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(`Langfuse API returned ${response.status}`),
      { status: response.status },
    );
  }

  return response.json();
}

/**
 * Read all observations in a bounded time window by following
 * the cursor chain to completion.
 *
 * Returns rows, page count, and overlap/duplicate detection state.
 */
export async function readBoundedWindow({
  baseUrl,
  fromStartTime,
  toStartTime,
  fields,
  limit = DEFAULT_LIMIT,
  sessionId,
  fetch: fetchImpl,
  authHeader,
  onPage,
} = {}) {
  const rows = [];
  const seenIds = new Set();
  const duplicates = [];
  const conflicts = [];
  const pages = [];
  let cursor = undefined;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const url = buildObservationsUrl({
      baseUrl,
      fromStartTime,
      toStartTime,
      fields,
      limit,
      cursor,
      sessionId,
    });

    const response = await readObservationsPage(url, { fetch: fetchImpl, authHeader });

    const pageRows = response.data || [];
    pages.push({ count: pageRows.length, meta: response.meta });

    for (const row of pageRows) {
      if (seenIds.has(row.id)) {
        // Already seen this row; check for duplicate vs conflict
        const existing = rows.find((r) => r.id === row.id);
        const sig = (x) =>
          createHash("sha256")
            .update(JSON.stringify({ type: x.type, name: x.name, level: x.level }))
            .digest("hex");

        if (existing && sig(existing) === sig(row)) {
          duplicates.push({ id: row.id, page: pageCount });
        } else {
          conflicts.push({
            id: row.id,
            page: pageCount,
            existingType: existing?.type,
            newType: row.type,
          });
        }
      } else {
        seenIds.add(row.id);
        rows.push(row);
      }
    }

    if (onPage) {
      onPage({ page: pageCount, rows: pageRows, meta: response.meta });
    }

    cursor = response.meta?.cursor;
    if (!cursor) break;
  }

  return {
    rows,
    pageCount,
    totalSeen: rows.length + duplicates.length,
    duplicates,
    conflicts,
    pages,
    cursorChainComplete: true,
  };
}

/**
 * Query source capabilities from the server.
 * Returns information about supported features (session filtering,
 * metadata expansion, rate limits).
 */
export function sourceCapabilities({
  serverVersion,
  supportsStructuredSessionFilter,
}) {
  return {
    serverVersion: serverVersion || "unknown",
    structuredSessionFilter: supportsStructuredSessionFilter !== false,
    firstClassSessionFilter: false, // Ignored on 4.1.0 per prototype
    expandMetadata: serverVersion ? true : "unknown",
    fieldGroups: DEFAULT_FIELDS,
    maxLimit: 1000,
    defaultLimit: DEFAULT_LIMIT,
    rateLimit: "server-dependent",
  };
}

/**
 * Build the authorization header from Langfuse credentials.
 * Uses Basic auth with public key as username and secret key as password.
 */
export function buildAuthHeader({ publicKey, secretKey }) {
  if (!publicKey || !secretKey) {
    throw new Error("Langfuse public key and secret key are required");
  }
  const credentials = Buffer.from(`${publicKey}:${secretKey}`).toString(
    "base64",
  );
  return `Basic ${credentials}`;
}

/**
 * Check whether Langfuse credentials are available from environment.
 */
export function credentialsAvailable() {
  return !!(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
  );
}

/**
 * Read credentials from environment.
 */
export function readCredentials() {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || DEFAULT_BASE_URL;

  if (!publicKey || !secretKey) return null;

  return { publicKey, secretKey, baseUrl };
}

/**
 * Build a bounded metadata-only query receipt without fetching raw I/O.
 * Used for the manual verification step to confirm connectivity and
 * session presence without extracting sensitive data.
 */
export async function buildAdapterReceipt({
  baseUrl,
  fromStartTime,
  toStartTime,
  sessionId,
  authHeader,
  fetch: fetchImpl,
} = {}) {
  // Query only metadata fields, no I/O
  const metadataFields = ["core", "basic", "time"];

  const result = await readBoundedWindow({
    baseUrl,
    fromStartTime: fromStartTime || new Date(0).toISOString(),
    toStartTime: toStartTime || new Date().toISOString(),
    fields: metadataFields,
    limit: 1,
    sessionId,
    fetch: fetchImpl,
    authHeader,
  });

  return {
    schemaVersion: "myflow-adapter-receipt/v1",
    generatedAt: new Date().toISOString(),
    source: "langfuse-v2",
    baseUrl,
    sessionId: sessionId || "not-specified",
    window: { fromStartTime, toStartTime },
    observationCount: result.rows.length,
    pageCount: result.pageCount,
    fieldGroups: metadataFields,
    rawIoFetched: false,
    metadataOnly: true,
  };
}