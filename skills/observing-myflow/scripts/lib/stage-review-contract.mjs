import { createHash } from "node:crypto";

import { CANONICAL_STAGES, canonicalJson } from "../../../myflow/scripts/lib/lifecycle-contract.mjs";

export const STAGE_REVIEW_SCHEMA_VERSION = "myflow-stage-review/v1";
export const PUBLIC_PROJECTION_SCHEMA_VERSION = "myflow-stage-review-public/v1";
export const EVALUATOR_VERSION = "0.1.0";
export const RULE_SET_VERSION = "0.1.0";

export const STAGE_REVIEW_OUTCOMES = Object.freeze([
  "satisfied",
  "unsatisfied",
  "blocked",
  "incomplete",
  "unknown",
]);

export const PREDICATE_RESULTS = Object.freeze([
  "pass",
  "fail",
  "unknown",
  "not-applicable",
]);

export const FEEDBACK_COVERAGE = Object.freeze([
  "recorded",
  "skipped",
  "pending",
  "missing",
]);

export const LATE_DISCOVERY_VALUES = Object.freeze([
  "true",
  "false",
  "unknown",
]);

export const CONFIDENCE_VALUES = Object.freeze([
  "high",
  "medium",
  "low",
]);

export const COST_CLASSES = Object.freeze([
  "lower",
  "similar",
  "higher",
]);

export const RETURN_NATURES = Object.freeze([
  "necessary-learning",
  "changed-intent",
  "delivery-defect",
  "external-change",
  "process-induced",
  "unclassified",
]);

const REQUIRED_REVIEW_FIELDS = [
  "schemaVersion",
  "reviewId",
  "createdAt",
  "repository",
  "workstreamId",
  "attemptId",
  "attemptOrdinal",
  "canonicalStage",
  "revision",
  "inputs",
  "evaluator",
  "predicates",
  "outcome",
  "feedbackCoverage",
  "returnAssessment",
  "limitations",
];

const ALLOWED_REVIEW_FIELDS = new Set([
  ...REQUIRED_REVIEW_FIELDS,
  "recordId",
  "developerExperience",
]);

export function reviewDigest(inputs) {
  return createHash("sha256")
    .update(typeof inputs === "string" ? inputs : canonicalJson(inputs))
    .digest("hex");
}

export function reviewId(inputs) {
  return `rev_${reviewDigest(inputs).slice(0, 32)}`;
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

export function validateStageReview(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new Error("stage review must be an object");
  }
  if (review.schemaVersion !== STAGE_REVIEW_SCHEMA_VERSION) {
    throw new Error(`schemaVersion must be ${STAGE_REVIEW_SCHEMA_VERSION}`);
  }

  for (const field of REQUIRED_REVIEW_FIELDS) {
    if (review[field] === undefined) throw new Error(`stage review requires ${field}`);
  }

  const unknownFields = Object.keys(review).filter((field) => !ALLOWED_REVIEW_FIELDS.has(field));
  if (unknownFields.length > 0) {
    throw new Error(`stage review contains unsupported fields: ${unknownFields.join(", ")}`);
  }

  requireString(review.reviewId, "reviewId");
  requireString(review.createdAt, "createdAt");
  requireString(review.workstreamId, "workstreamId");
  requireString(review.attemptId, "attemptId");
  requireNonNegativeInteger(review.attemptOrdinal, "attemptOrdinal");
  requireNonNegativeInteger(review.revision, "revision");
  if (review.revision < 1) throw new Error("revision must be a positive integer");

  if (!CANONICAL_STAGES.includes(review.canonicalStage)) {
    throw new Error("canonicalStage must be a canonical stage");
  }
  if (!STAGE_REVIEW_OUTCOMES.includes(review.outcome)) {
    throw new Error(`outcome must be one of ${STAGE_REVIEW_OUTCOMES.join(", ")}`);
  }
  if (!FEEDBACK_COVERAGE.includes(review.feedbackCoverage)) {
    throw new Error(`feedbackCoverage must be one of ${FEEDBACK_COVERAGE.join(", ")}`);
  }

  if (!review.repository || typeof review.repository.value !== "string" || !review.repository.value) {
    throw new Error("repository requires a canonical identity");
  }

  validateReviewInputs(review.inputs);
  validateReviewEvaluator(review.evaluator);
  validateReviewPredicates(review.predicates);

  if (review.returnAssessment !== null) {
    validateReturnAssessment(review.returnAssessment);
  }
  if (!Array.isArray(review.limitations)) {
    throw new Error("limitations must be an array");
  }

  return review;
}

function validateReviewInputs(inputs) {
  if (!inputs || typeof inputs !== "object") throw new Error("inputs must be an object");
  requireNonNegativeInteger(inputs.lifecycleEventCount, "inputs.lifecycleEventCount");
  if (inputs.lifecycleLastEventId !== null) requireString(inputs.lifecycleLastEventId, "inputs.lifecycleLastEventId");
  requireString(inputs.lifecycleDigest, "inputs.lifecycleDigest");
  if (!Array.isArray(inputs.artifactDigests)) throw new Error("inputs.artifactDigests must be an array");
  if (!FEEDBACK_COVERAGE.includes(inputs.feedbackStatus)) {
    throw new Error(`inputs.feedbackStatus must be one of ${FEEDBACK_COVERAGE.join(", ")}`);
  }
  if (inputs.feedbackRef !== null) requireString(inputs.feedbackRef, "inputs.feedbackRef");
}

function validateReviewEvaluator(evaluator) {
  if (!evaluator || typeof evaluator !== "object") throw new Error("evaluator must be an object");
  requireString(evaluator.evaluatorVersion, "evaluatorVersion");
  requireString(evaluator.ruleSetVersion, "ruleSetVersion");
}

function validateReviewPredicates(predicates) {
  if (!Array.isArray(predicates)) throw new Error("predicates must be an array");
  if (predicates.length === 0) throw new Error("predicates must be non-empty");
  for (let index = 0; index < predicates.length; index++) {
    const predicate = predicates[index];
    requireString(predicate.id, `predicates[${index}].id`);
    if (!PREDICATE_RESULTS.includes(predicate.result)) {
      throw new Error(
        `predicates[${index}].result must be one of ${PREDICATE_RESULTS.join(", ")}`,
      );
    }
    if (!Array.isArray(predicate.evidence)) {
      throw new Error(`predicates[${index}].evidence must be an array`);
    }
  }
}

function validateReturnAssessment(assessment) {
  if (!assessment || typeof assessment !== "object") throw new Error("returnAssessment must be an object");
  requireString(assessment.episodeId, "returnAssessment.episodeId");
  requireString(assessment.triggerSource, "returnAssessment.triggerSource");
  requireString(assessment.changeKind, "returnAssessment.changeKind");
  if (!RETURN_NATURES.includes(assessment.nature)) {
    throw new Error(`returnAssessment.nature must be one of ${RETURN_NATURES.join(", ")}`);
  }
  if (!LATE_DISCOVERY_VALUES.includes(assessment.lateDiscovery)) {
    throw new Error(
      `returnAssessment.lateDiscovery must be one of ${LATE_DISCOVERY_VALUES.join(", ")}`,
    );
  }
  if (!CONFIDENCE_VALUES.includes(assessment.confidence)) {
    throw new Error(
      `returnAssessment.confidence must be one of ${CONFIDENCE_VALUES.join(", ")}`,
    );
  }
  if (!Array.isArray(assessment.missingEvidence)) {
    throw new Error("returnAssessment.missingEvidence must be an array");
  }
  if (!Array.isArray(assessment.counterevidence)) {
    throw new Error("returnAssessment.counterevidence must be an array");
  }

  if (assessment.lateDiscovery === "true") {
    validateCounterfactual(assessment);
  }
}

export function validateCounterfactual(assessment) {
  const required = [
    ["earliestDetectingStage", "string"],
    ["earlierCheck", "string"],
    ["requiredInformation", "string"],
    ["informationExisted", "string"],
    ["expectedSignal", "string"],
    ["costClass", COST_CLASSES],
    ["falsePositiveRisk", "string"],
    ["qualityGuardrail", "string"],
  ];

  const missing = [];
  for (const [field, typeOrValues] of required) {
    if (assessment[field] === undefined || assessment[field] === null) {
      missing.push(field);
      continue;
    }
    if (Array.isArray(typeOrValues)) {
      if (!typeOrValues.includes(assessment[field])) {
        throw new Error(
          `returnAssessment.${field} must be one of ${typeOrValues.join(", ")}`,
        );
      }
    } else if (typeof assessment[field] !== typeOrValues || assessment[field].length === 0) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `lateDiscovery=true requires all counterfactual fields: ${missing.join(", ")}`,
    );
  }

  if (!CANONICAL_STAGES.includes(assessment.earliestDetectingStage)) {
    throw new Error("earliestDetectingStage must be a canonical stage");
  }
}

export function deriveOutcome(canonicalStage, predicates, lifecycleState) {
  const results = new Map(predicates.map((p) => [p.id, p.result]));

  if (results.has(`${canonicalStage.toLowerCase()}.blocked`) && results.get(`${canonicalStage.toLowerCase()}.blocked`) === "pass") {
    return "blocked";
  }

  const hasFail = predicates.some((p) => p.result === "fail");
  const hasUnknown = predicates.some((p) => p.result === "unknown");
  const allPassOrNa = predicates.every((p) => p.result === "pass" || p.result === "not-applicable");

  if (allPassOrNa) return "satisfied";

  if (hasFail && !hasUnknown) return "unsatisfied";

  if (hasUnknown && !hasFail) return "incomplete";

  if (hasFail && hasUnknown) return "incomplete";

  return "unknown";
}

const ALLOWED_PUBLIC_FIELDS = new Set([
  "schemaVersion",
  "reviewId",
  "createdAt",
  "workstreamId",
  "attemptId",
  "attemptOrdinal",
  "canonicalStage",
  "revision",
  "evaluator",
  "predicates",
  "outcome",
  "feedbackCoverage",
  "returnAssessment",
  "limitationCount",
]);

const ALLOWED_PUBLIC_PREDICATE_FIELDS = new Set(["id", "result"]);

const ALLOWED_PUBLIC_RETURN_FIELDS = new Set([
  "nature",
  "lateDiscovery",
  "confidence",
]);

const FORBIDDEN_PUBLIC_PATTERNS = [
  /(?:^|[\s"'])\/[a-zA-Z][^\s"']*\/[a-zA-Z]/, // paths with at least two segments
  /```/, // code blocks
  /(?:secret|credential|token|password)["\s:=]+[^\s,"'}]+/i, // credentials with values
  /"[^"]{80,}"/, // long quoted strings (potential evidence excerpts)
  /(?:prompt|command)\s*[:=]\s*["'`]/i, // prompt/command assignments
];

export function publicProjection(review) {
  validateStageReview(review);

  const projected = { schemaVersion: PUBLIC_PROJECTION_SCHEMA_VERSION };

  for (const field of ALLOWED_PUBLIC_FIELDS) {
    if (field === "schemaVersion") continue; // Already set above.
    if (field === "predicates") {
      projected.predicates = review.predicates.map((p) => {
        const cleaned = {};
        for (const pf of ALLOWED_PUBLIC_PREDICATE_FIELDS) {
          cleaned[pf] = p[pf];
        }
        return cleaned;
      });
    } else if (field === "returnAssessment") {
      if (review.returnAssessment === null) {
        projected.returnAssessment = null;
      } else {
        const cleaned = {};
        for (const rf of ALLOWED_PUBLIC_RETURN_FIELDS) {
          cleaned[rf] = review.returnAssessment[rf];
        }
        projected.returnAssessment = cleaned;
      }
    } else if (field === "limitationCount") {
      projected.limitationCount = review.limitations.length;
    } else if (Object.hasOwn(review, field)) {
      projected[field] = review[field];
    }
  }

  const serialized = JSON.stringify(projected);
  for (const pattern of FORBIDDEN_PUBLIC_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(`public projection contains forbidden content matching: ${pattern}`);
    }
  }

  return projected;
}