import { CANONICAL_STAGES } from "../../../myflow/scripts/lib/lifecycle-contract.mjs";
import {
  CONFIDENCE_VALUES,
  COST_CLASSES,
  LATE_DISCOVERY_VALUES,
  RETURN_NATURES,
  validateCounterfactual,
} from "./stage-review-contract.mjs";

const TRIGGER_SOURCES = Object.freeze([
  "developer-report",
  "verification-evidence",
  "agent-observation",
  "external-evidence",
  "tool-or-infrastructure",
  "unknown",
]);

const CHANGE_KINDS = Object.freeze([
  "outcome-or-acceptance",
  "architecture",
  "plan",
  "implementation",
  "unknown",
]);

export { RETURN_NATURES, LATE_DISCOVERY_VALUES, CONFIDENCE_VALUES, COST_CLASSES };

export function validateReturnAssessmentInput(options, lifecycleState) {
  for (const [name, value] of [
    ["episodeId", options.episodeId],
    ["triggerSource", options.triggerSource],
    ["changeKind", options.changeKind],
    ["nature", options.nature],
    ["lateDiscovery", options.lateDiscovery],
    ["confidence", options.confidence],
  ]) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`return assessment requires ${name}`);
    }
  }

  if (!TRIGGER_SOURCES.includes(options.triggerSource)) {
    throw new Error(`triggerSource must be one of ${TRIGGER_SOURCES.join(", ")}`);
  }
  if (!CHANGE_KINDS.includes(options.changeKind)) {
    throw new Error(`changeKind must be one of ${CHANGE_KINDS.join(", ")}`);
  }
  if (!RETURN_NATURES.includes(options.nature)) {
    throw new Error(`nature must be one of ${RETURN_NATURES.join(", ")}`);
  }
  if (!LATE_DISCOVERY_VALUES.includes(options.lateDiscovery)) {
    throw new Error(
      `lateDiscovery must be one of ${LATE_DISCOVERY_VALUES.join(", ")}`,
    );
  }
  if (!CONFIDENCE_VALUES.includes(options.confidence)) {
    throw new Error(
      `confidence must be one of ${CONFIDENCE_VALUES.join(", ")}`,
    );
  }

  const missingEvidence = options.missingEvidence ?? [];
  const counterevidence = options.counterevidence ?? [];
  if (!Array.isArray(missingEvidence)) throw new Error("missingEvidence must be an array");
  if (!Array.isArray(counterevidence)) throw new Error("counterevidence must be an array");

  if (options.lateDiscovery === "true") {
    const assessmentForValidation = {
      episodeId: options.episodeId,
      triggerSource: options.triggerSource,
      changeKind: options.changeKind,
      nature: options.nature,
      lateDiscovery: options.lateDiscovery,
      confidence: options.confidence,
      missingEvidence,
      counterevidence,
      earliestDetectingStage: options.earliestDetectingStage,
      earlierCheck: options.earlierCheck,
      requiredInformation: options.requiredInformation,
      informationExisted: options.informationExisted,
      expectedSignal: options.expectedSignal,
      costClass: options.costClass,
      falsePositiveRisk: options.falsePositiveRisk,
      qualityGuardrail: options.qualityGuardrail,
    };
    validateCounterfactual(assessmentForValidation);
  }

  if (!lifecycleState) {
    throw new Error("lifecycle state is required for return assessment validation");
  }
  const episode = lifecycleState.returns.find(
    (candidate) => candidate.episodeId === options.episodeId,
  );
  if (!episode) {
    throw new Error(`unknown correction episode: ${options.episodeId}`);
  }

  return { episode };
}

export function buildReturnAssessment(options, episode) {
  const missingEvidence = options.missingEvidence ?? [];
  const counterevidence = options.counterevidence ?? [];

  const assessment = {
    episodeId: options.episodeId,
    triggerSource: options.triggerSource,
    changeKind: options.changeKind,
    nature: options.nature,
    lateDiscovery: options.lateDiscovery,
    confidence: options.confidence,
    missingEvidence,
    counterevidence,
  };

  if (options.lateDiscovery === "true") {
    assessment.earliestDetectingStage = options.earliestDetectingStage;
    assessment.earlierCheck = options.earlierCheck;
    assessment.requiredInformation = options.requiredInformation;
    assessment.informationExisted = options.informationExisted;
    assessment.expectedSignal = options.expectedSignal;
    assessment.costClass = options.costClass;
    assessment.falsePositiveRisk = options.falsePositiveRisk;
    assessment.qualityGuardrail = options.qualityGuardrail;
  }

  return assessment;
}