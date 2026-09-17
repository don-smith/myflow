import { createHash } from "node:crypto";

import {
  PUBLIC_PROJECTION_SCHEMA_VERSION,
  STAGE_REVIEW_SCHEMA_VERSION,
  validateStageReview,
  publicProjection,
} from "./stage-review-contract.mjs";

export const SYNTHETIC_TRACE_ROOT_NAME = "myflow-stage-review";
export const EVALUATOR_OBSERVATION_TYPE = "EVALUATOR";
export const PROJECTION_VERSION = "0.1.0";

export const SCORE_NAMES = Object.freeze({
  DEVELOPER_STAGE_EXPERIENCE: "myflow.developer.stage-experience",
  STAGE_OUTCOME: "myflow.stage.outcome",
  STAGE_RETURNED: "myflow.stage.returned",
  RETURN_NATURE: "myflow.return.nature",
  RETURN_LATE_DISCOVERY: "myflow.return.late-discovery",
  RETURN_OWNER_STAGE: "myflow.return.owner-stage",
  RETURN_LOOP_MINUTES: "myflow.return.loop-minutes",
  RETURN_CALLS: "myflow.return.calls",
  RETURN_TOTAL_TOKENS: "myflow.return.total-tokens",
  RETURN_RECORDED_COST_USD: "myflow.return.recorded-cost-usd",
  RETURN_COST_COVERAGE: "myflow.return.cost-coverage",
});

const SCORE_DATA_TYPES = {
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
};

export const DEV_EXPERIENCE_VALUES = Object.freeze(["smooth", "some-friction", "rough"]);

const ALLOWED_PAYLOAD_FIELDS = new Set([
  "traceId",
  "traceName",
  "observationId",
  "observationName",
  "observationType",
  "parentObservationId",
  "startTime",
  "endTime",
  "metadata",
  "scoreId",
  "scoreName",
  "scoreValue",
  "scoreDataType",
  "scoreObservationId",
  "scoreTraceId",
  "scoreComment",
]);

const MAX_SERIALIZED_SIZE = 64 * 1024;

const FORBIDDEN_PAYLOAD_PATTERNS = [
  /(?:^|[\s"'])\/[a-zA-Z][^\s"']*\/[a-zA-Z]/,
  /```/,
  /(?:secret|credential|token|password)["\s:=]+[^\s,"'}]+/i,
  /"[^"]{80,}"/,
  /(?:prompt|command)\s*[:=]\s*["'`]/i,
  /(?:response|reasoning|tool.*(?:argument|result))[^"]{40,}/i,
  /(?:function\s*\(|=>\s*\{|import\s+.*\s+from)/,
];

const LANGFUSE_SOURCE = "myflow-synthetic-review-publisher";
const SCORE_COMMENT_MAX = 200;

export function buildStableTraceId(repository, workstreamId, attemptId) {
  const key = `trace:${repository.kind}:${repository.value}:${workstreamId}:${attemptId}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export function buildStableObservationId(traceId, evaluatorVersion, inputDigest, revision) {
  const key = `obs:${traceId}:${evaluatorVersion}:${inputDigest}:${revision}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export function buildStableScoreId(observationId, scoreName) {
  const key = `score:${observationId}:${scoreName}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

function projectionDigest(projection) {
  return createHash("sha256").update(JSON.stringify(projection, Object.keys(projection).sort())).digest("hex");
}

const ALLOWED_TOP_LEVEL = new Set([
  "traceId", "traceName", "startTime", "endTime", "metadata",
  "observationId", "observationName", "observationType", "parentObservationId",
  "scoreId", "scoreName", "scoreValue", "scoreDataType", "scoreObservationId",
  "scoreTraceId", "scoreComment",
]);

export function validatePayloadAllowlist(payload, name) {
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_SERIALIZED_SIZE) {
    throw new Error(`${name} payload exceeds ${MAX_SERIALIZED_SIZE} bytes`);
  }
  for (const pattern of FORBIDDEN_PAYLOAD_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`${name} payload contains forbidden content matching: ${pattern}`);
    }
  }
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      throw new Error(`${name} payload contains unlisted field: ${key}`);
    }
  }
}

function truncateComment(comment) {
  if (!comment) return undefined;
  return comment.length > SCORE_COMMENT_MAX ? comment.slice(0, SCORE_COMMENT_MAX - 3) + "..." : comment;
}

export function projectTrace(repository, workstreamId, attemptId, review) {
  validateStageReview(review);

  const traceId = buildStableTraceId(repository, workstreamId, attemptId);
  const inputDigest = review.inputs?.lifecycleDigest ?? createHash("sha256").update(JSON.stringify(review)).digest("hex");
  const observationId = buildStableObservationId(traceId, review.evaluator.evaluatorVersion, inputDigest, review.revision);

  const publicProj = publicProjection(review);

  const trace = {
    traceId,
    traceName: SYNTHETIC_TRACE_ROOT_NAME,
    startTime: review.createdAt,
    endTime: review.createdAt,
    metadata: {
      source: LANGFUSE_SOURCE,
      projectionVersion: PROJECTION_VERSION,
      workstreamId,
      attemptId: review.attemptId,
      attemptOrdinal: review.attemptOrdinal,
      canonicalStage: review.canonicalStage,
      revision: review.revision,
    },
  };

  const observation = {
    observationId,
    observationName: `${SYNTHETIC_TRACE_ROOT_NAME}-${review.canonicalStage.toLowerCase()}-r${review.revision}`,
    observationType: EVALUATOR_OBSERVATION_TYPE,
    traceId,
    startTime: review.createdAt,
    endTime: review.createdAt,
    metadata: {
      source: LANGFUSE_SOURCE,
      projectionVersion: PROJECTION_VERSION,
      evaluatorVersion: review.evaluator.evaluatorVersion,
      ruleSetVersion: review.evaluator.ruleSetVersion,
      stageReviewRevision: review.revision,
    },
  };

  const scores = [];
  const baseComment = `myflow-stage-review revision ${review.revision}`;

  const devExp = review.developerExperience ?? null;
  if (devExp && DEV_EXPERIENCE_VALUES.some((v) => v === devExp)) {
    scores.push({
      scoreId: buildStableScoreId(observationId, SCORE_NAMES.DEVELOPER_STAGE_EXPERIENCE),
      scoreName: SCORE_NAMES.DEVELOPER_STAGE_EXPERIENCE,
      scoreValue: devExp,
      scoreDataType: "CATEGORICAL",
      scoreObservationId: observationId,
      scoreTraceId: traceId,
    });
  }

  scores.push({
    scoreId: buildStableScoreId(observationId, SCORE_NAMES.STAGE_OUTCOME),
    scoreName: SCORE_NAMES.STAGE_OUTCOME,
    scoreValue: publicProj.outcome,
    scoreDataType: "CATEGORICAL",
    scoreObservationId: observationId,
    scoreTraceId: traceId,
    scoreComment: truncateComment(baseComment),
  });

  const hasReturn = publicProj.returnAssessment !== null && publicProj.returnAssessment !== undefined;
  scores.push({
    scoreId: buildStableScoreId(observationId, SCORE_NAMES.STAGE_RETURNED),
    scoreName: SCORE_NAMES.STAGE_RETURNED,
    scoreValue: hasReturn,
    scoreDataType: "BOOLEAN",
    scoreObservationId: observationId,
    scoreTraceId: traceId,
  });

  if (hasReturn) {
    scores.push({
      scoreId: buildStableScoreId(observationId, SCORE_NAMES.RETURN_NATURE),
      scoreName: SCORE_NAMES.RETURN_NATURE,
      scoreValue: publicProj.returnAssessment.nature,
      scoreDataType: "CATEGORICAL",
      scoreObservationId: observationId,
      scoreTraceId: traceId,
    });

    scores.push({
      scoreId: buildStableScoreId(observationId, SCORE_NAMES.RETURN_LATE_DISCOVERY),
      scoreName: SCORE_NAMES.RETURN_LATE_DISCOVERY,
      scoreValue: publicProj.returnAssessment.lateDiscovery,
      scoreDataType: "CATEGORICAL",
      scoreObservationId: observationId,
      scoreTraceId: traceId,
    });

    if (review.returnAssessment?.initialOwningStage) {
      scores.push({
        scoreId: buildStableScoreId(observationId, SCORE_NAMES.RETURN_OWNER_STAGE),
        scoreName: SCORE_NAMES.RETURN_OWNER_STAGE,
        scoreValue: review.returnAssessment.initialOwningStage,
        scoreDataType: "CATEGORICAL",
        scoreObservationId: observationId,
        scoreTraceId: traceId,
      });
    }
  }

  const payload = { trace, observation, scores };
  const digest = projectionDigest(payload);

  return {
    traceId,
    observationId,
    projectionDigest: digest,
    inputDigest,
    trace,
    observation,
    scores,
    scoreIds: scores.map((s) => s.scoreId),
  };
}

export function projectReturnDiagnosticScores(observationId, traceId, economics) {
  if (!economics) return [];

  const diag = [];
  if (economics.returnLoopMs !== undefined && economics.returnLoopMs !== null) {
    diag.push({
      scoreId: buildStableScoreId(observationId, SCORE_NAMES.RETURN_LOOP_MINUTES),
      scoreName: SCORE_NAMES.RETURN_LOOP_MINUTES,
      scoreValue: Math.round(economics.returnLoopMs / 60_000 * 100) / 100,
      scoreDataType: "NUMERIC",
      scoreObservationId: observationId,
      scoreTraceId: traceId,
    });
  }
  if (economics.calls !== undefined && economics.calls !== null) {
    diag.push({
      scoreId: buildStableScoreId(observationId, SCORE_NAMES.RETURN_CALLS),
      scoreName: SCORE_NAMES.RETURN_CALLS,
      scoreValue: economics.calls,
      scoreDataType: "NUMERIC",
      scoreObservationId: observationId,
      scoreTraceId: traceId,
    });
  }
  if (economics.totalTokens !== undefined && economics.totalTokens !== null) {
    diag.push({
      scoreId: buildStableScoreId(observationId, SCORE_NAMES.RETURN_TOTAL_TOKENS),
      scoreName: SCORE_NAMES.RETURN_TOTAL_TOKENS,
      scoreValue: economics.totalTokens,
      scoreDataType: "NUMERIC",
      scoreObservationId: observationId,
      scoreTraceId: traceId,
    });
  }
  if (economics.recordedCostUsd !== undefined && economics.recordedCostUsd !== null) {
    diag.push({
      scoreId: buildStableScoreId(observationId, SCORE_NAMES.RETURN_RECORDED_COST_USD),
      scoreName: SCORE_NAMES.RETURN_RECORDED_COST_USD,
      scoreValue: economics.recordedCostUsd,
      scoreDataType: "NUMERIC",
      scoreObservationId: observationId,
      scoreTraceId: traceId,
    });
  }
  if (economics.costCoverage !== undefined && economics.costCoverage !== null) {
    diag.push({
      scoreId: buildStableScoreId(observationId, SCORE_NAMES.RETURN_COST_COVERAGE),
      scoreName: SCORE_NAMES.RETURN_COST_COVERAGE,
      scoreValue: economics.costCoverage,
      scoreDataType: "NUMERIC",
      scoreObservationId: observationId,
      scoreTraceId: traceId,
    });
  }
  return diag;
}

export function compatibilityReceipt({ packageTelemetryScores, existingScoreConfigs }) {
  const inventory = {
    phase: 6,
    schemaVersion: "myflow-score-compatibility-receipt/v1",
    createdAt: new Date().toISOString(),
    recordedScoreNames: {
      existing: {
        friction: Object.keys(packageTelemetryScores?.friction ?? {}),
        work: Object.keys(packageTelemetryScores?.work ?? {}),
        flow: Object.keys(packageTelemetryScores?.flow ?? {}),
      },
      newPhase6: Object.values(SCORE_NAMES),
    },
    assertions: {
      noNameConflict: Object.values(SCORE_NAMES).every(
        (name) =>
          !(packageTelemetryScores?.friction?.[name]) &&
          !(packageTelemetryScores?.work?.[name]) &&
          !(packageTelemetryScores?.flow?.[name]),
      ),
      noSilentReuse: true,
      existingDashboardsUnknown: true,
    },
    notes: [
      "Existing score names (myflow.friction.*, myflow.work.*, myflow.flow.*) were inventoried from packages/telemetry source.",
      "No in-repository dashboard or score-config consumer was found for the existing names.",
      "External dashboard use is unknown. Treat retirement as an explicit compatibility decision.",
      "Phase 6 score names use a distinct myflow.developer.* and myflow.return.* prefix; myflow.stage.* is a new top-level group.",
    ],
  };
  return inventory;
}