import {
  ACTIVITY_BY_STAGE,
  CANONICAL_STAGES,
  lifecycleAttemptId,
  stageIndex,
  validateLifecycleEvent,
} from "./lifecycle-contract.mjs";

const ROUTE_BY_CHANGE_KIND = Object.freeze({
  "outcome-or-acceptance": { stage: "Scope", activity: "scope" },
  architecture: { stage: "Plan", activity: "design" },
  plan: { stage: "Plan", activity: "planning" },
  implementation: { stage: "Implement", activity: "phase" },
});

export function initialLifecycleState() {
  return {
    created: false,
    closed: false,
    repository: null,
    workstreamId: null,
    currentStage: null,
    currentAttemptId: null,
    lastTerminalAttemptId: null,
    currentActivityId: null,
    currentBlockId: null,
    lastEventId: null,
    attempts: [],
    activities: [],
    blocks: [],
    acceptedArtifacts: [],
    executionRefs: [],
    returns: [],
    feedback: [],
    observations: [],
    unresolvedObservations: [],
    revision: null,
    activeRouteEpisodeId: null,
    pendingVerificationEpisodeIds: [],
    slices: [],
    pendingSlice: null,
    nextLegalActions: [],
    eventLinks: [],
    returnEpisodeCount: 0,
    stageReturnCount: 0,
    activityReturnCount: 0,
  };
}

function currentAttempt(state) {
  return state.attempts.find(({ attemptId }) => attemptId === state.currentAttemptId);
}

function findEpisode(state, episodeId) {
  const episode = state.returns.find((candidate) => candidate.episodeId === episodeId);
  if (!episode) throw new Error(`unknown correction episode: ${episodeId}`);
  return episode;
}

function assertRoute(changeKind, stage, activity) {
  const expected = ROUTE_BY_CHANGE_KIND[changeKind];
  if (expected && (stage !== expected.stage || activity !== expected.activity)) {
    throw new Error(`${changeKind} corrections route to ${expected.stage}/${expected.activity}`);
  }
}

function classifyBackwardEdge(fromStage, fromActivity, toStage, toActivity) {
  const fromIndex = stageIndex(fromStage);
  const toIndex = stageIndex(toStage);
  if (toIndex < fromIndex) return "stage";
  if (toIndex > fromIndex) throw new Error("correction routes must not move forward");
  const activities = ACTIVITY_BY_STAGE[fromStage];
  if (activities.indexOf(toActivity) < activities.indexOf(fromActivity)) return "activity";
  throw new Error("same-stage correction must return to an earlier owning activity");
}

function assertAttemptMetadata(state, event) {
  if (["workstream.created", "workstream.closed", "action.observed", "action.resolved", "revision.opened", "slice.started"].includes(event.kind) ||
      (event.kind === "correction.opened" && event.attemptId === null)) return;
  if (["attempt.assessed", "attempt.resumed", "attempt.superseded"].includes(event.kind)) {
    const episode = findEpisode(state, event.episodeId);
    const target = state.attempts.find(({ attemptId }) => attemptId === episode.originAttemptId);
    if (event.attemptId !== target?.attemptId || event.attemptOrdinal !== target.ordinal ||
        event.canonicalStage !== target.canonicalStage || event.owningActivity !== episode.detectingActivity) {
      throw new Error("target attempt metadata is invalid");
    }
    return;
  }
  const attempt = currentAttempt(state);
  if (event.kind === "stage.entered") return;
  if (event.kind === "feedback.requested" || event.kind === "feedback.recorded") {
    const target = state.attempts.find(({ attemptId }) => attemptId === event.attemptId);
    if (!target || target.ordinal !== event.attemptOrdinal || target.canonicalStage !== event.canonicalStage) {
      throw new Error(`${event.kind} target attempt metadata is invalid`);
    }
    if (target.attemptId !== state.currentAttemptId) {
      if (
        target.canonicalStage !== "Implement" ||
        state.currentStage !== "Verify" ||
        attempt?.canonicalStage !== "Verify"
      ) {
        throw new Error("closed-attempt feedback is allowed only for Implement at Verify entry");
      }
    }
    return;
  }
  if (!attempt) throw new Error(`${event.kind} requires an open stage attempt`);
  if (event.attemptId !== attempt.attemptId || event.attemptOrdinal !== attempt.ordinal) {
    throw new Error(`${event.kind} attempt metadata does not match the open attempt`);
  }
  if (event.canonicalStage !== attempt.canonicalStage) {
    throw new Error(`${event.kind} stage does not match the open attempt`);
  }
}

export function eventAttemptMetadata(state, input) {
  if (["workstream.created", "workstream.closed", "action.observed", "action.resolved", "revision.opened", "slice.started"].includes(input.kind) ||
      (input.kind === "correction.opened" && !state.currentAttemptId)) {
    return { attemptId: null, attemptOrdinal: null };
  }
  if (["attempt.assessed", "attempt.resumed", "attempt.superseded"].includes(input.kind)) {
    const episode = findEpisode(state, input.episodeId);
    const target = state.attempts.find(({ attemptId }) => attemptId === episode.originAttemptId);
    return { attemptId: target.attemptId, attemptOrdinal: target.ordinal };
  }
  if (input.kind === "stage.entered") {
    const ordinal = state.attempts.filter(({ canonicalStage }) => canonicalStage === input.canonicalStage).length + 1;
    return {
      attemptId: lifecycleAttemptId({
        repository: input.repository,
        workstreamId: input.workstreamId,
        canonicalStage: input.canonicalStage,
        attemptOrdinal: ordinal,
      }),
      attemptOrdinal: ordinal,
    };
  }
  if (
    (input.kind === "feedback.requested" || input.kind === "feedback.recorded") &&
    input.targetAttemptId
  ) {
    const target = state.attempts.find(({ attemptId }) => attemptId === input.targetAttemptId);
    if (!target) throw new Error(`unknown feedback target attempt: ${input.targetAttemptId}`);
    return { attemptId: target.attemptId, attemptOrdinal: target.ordinal };
  }
  const attempt = currentAttempt(state);
  if (!attempt) return { attemptId: null, attemptOrdinal: null };
  return { attemptId: attempt.attemptId, attemptOrdinal: attempt.ordinal };
}

export function applyLifecycleEvent(previousState, event) {
  validateLifecycleEvent(event);
  const state = structuredClone(previousState);

  if (event.previousEventId !== state.lastEventId) {
    throw new Error(`event chain mismatch: expected ${state.lastEventId ?? "null"}`);
  }
  if (state.created) {
    if (event.workstreamId !== state.workstreamId) throw new Error("journal cannot mix workstreams");
    if (JSON.stringify(event.repository) !== JSON.stringify(state.repository)) {
      throw new Error("journal cannot mix repository identities");
    }
  }
  if (state.closed) throw new Error("workstream is already closed");
  assertAttemptMetadata(state, event);

  switch (event.kind) {
    case "slice.started": {
      if (state.currentAttemptId || state.activeRouteEpisodeId || state.pendingSlice ||
          state.pendingVerificationEpisodeIds.length || state.returns.some(({ status }) => status !== "closed")) {
        throw new Error("slice start requires no open attempt or outstanding correction");
      }
      const verify = state.attempts.find(({ attemptId }) => attemptId === event.precedingVerifyAttemptId);
      if (!verify || verify.attemptId !== state.lastTerminalAttemptId || verify.canonicalStage !== "Verify" ||
          verify.status !== "advanced" || !verify.passingVerificationAt) {
        throw new Error("slice start requires the latest completed passing Verify");
      }
      const basis = (id, stage, activity) => state.acceptedArtifacts.find(({ eventId, canonicalStage, owningActivity }) =>
        eventId === id && canonicalStage === stage && owningActivity === activity);
      const scope = basis(event.scopeArtifactEventId, "Scope", "scope");
      const design = basis(event.designArtifactEventId, "Plan", "design");
      const plan = basis(event.planningBasisEventId, "Plan", "planning");
      if (!plan || plan.attemptId === verify.attemptId || !scope || !design ||
          !state.attempts.some(({ attemptId, status }) => attemptId === plan.attemptId && status === "advanced")) {
        throw new Error("slice start requires accepted planning basis and reused Scope and Design artifacts");
      }
      if (state.slices.some(({ name }) => name === event.sliceName)) throw new Error("slice name has already been used");
      state.pendingSlice = event.sliceName;
      state.slices.push({ name: event.sliceName, eventId: event.eventId,
        precedingVerifyAttemptId: verify.attemptId, planningBasisEventId: plan.eventId,
        scopeArtifactEventId: scope.eventId, designArtifactEventId: design.eventId,
        planAttemptId: null, implementAttemptId: null, verifyAttemptId: null, status: "awaiting-plan" });
      break;
    }
    case "correction.validated": {
      const episode = findEpisode(state, event.episodeId);
      const origin = state.attempts.find(({ attemptId }) => attemptId === episode.originAttemptId);
      const validDetector = event.attemptId === episode.originAttemptId ||
        (origin.status === "superseded" && episode.replacementAttemptId === event.attemptId);
      if (episode.parentEpisodeId === null || !episode.resumedAt || !episode.disposedAt ||
          episode.detectingStage !== event.canonicalStage || !validDetector ||
          episode.localValidation ||
          !state.pendingVerificationEpisodeIds.includes(episode.episodeId) ||
          (state.activeRouteEpisodeId && state.activeRouteEpisodeId !== episode.parentEpisodeId)) {
        throw new Error("local validation requires resumed child detecting attempt and evidence disposition");
      }
      episode.localValidation = { eventId: event.eventId, artifactRef: event.artifactRef };
      break;
    }
    case "action.observed": {
      if (!state.created) throw new Error("observation requires a workstream");
      const source = state.attempts.find(({ attemptId }) => attemptId === event.sourceAttemptId);
      if (!source) throw new Error("unknown source attempt");
      if (event.sourceAttemptId !== (state.currentAttemptId ?? state.lastTerminalAttemptId)) {
        throw new Error("observation must identify the current or last completed attempt");
      }
      if (event.canonicalStage !== source.canonicalStage) throw new Error("observation source stage mismatch");
      state.observations.push({ observationId: event.observationId, eventId: event.eventId,
        sourceAttemptId: source.attemptId, actualFinding: event.actualFinding,
        intendedAction: event.intendedAction, intendedOwner: event.intendedOwner,
        intendedStage: event.intendedStage, intendedActivity: event.intendedActivity,
        evidence: event.artifactRef, unresolvedReason: event.unresolvedReason, resolution: null });
      break;
    }
    case "action.resolved": {
      const observation = state.observations.find(({ observationId }) => observationId === event.observationId);
      if (!observation || observation.resolution) throw new Error("unknown or already resolved observation");
      const findLink = (id) => {
        const link = state.eventLinks.find(({ eventId }) => eventId === id);
        if (!link || state.eventLinks.findIndex(({ eventId }) => eventId === id) <=
            state.eventLinks.findIndex(({ eventId }) => eventId === observation.eventId)) {
          throw new Error(`unknown linked event after observation: ${id}`);
        }
        return link;
      };
      const transitions = event.linkedEventIds.map(findLink);
      if (transitions.some(({ kind }) => !["stage.entered", "attempt.resumed", "attempt.superseded"].includes(kind))) {
        throw new Error("resolution links must name actual attempt transitions");
      }
      const artifacts = event.linkedArtifactEventIds.map(findLink);
      if (artifacts.some(({ kind }) => kind !== "artifact.accepted")) throw new Error("resolution requires accepted artifact events");
      for (const id of event.linkedAttemptIds) {
        if (!state.attempts.some(({ attemptId }) => attemptId === id) ||
            ![...transitions, ...artifacts].some(({ attemptId }) => attemptId === id)) {
          throw new Error(`resolution links an unrelated attempt: ${id}`);
        }
      }
      if ([...transitions, ...artifacts].some(({ attemptId }) => !event.linkedAttemptIds.includes(attemptId))) {
        throw new Error("resolution must identify every linked attempt");
      }
      observation.resolution = { eventId: event.eventId, linkedEventIds: event.linkedEventIds,
        linkedAttemptIds: event.linkedAttemptIds, linkedArtifactEventIds: event.linkedArtifactEventIds };
      break;
    }
    case "revision.opened": {
      if (!state.created || state.currentAttemptId || state.revision || state.activeRouteEpisodeId) {
        throw new Error("revision requires no open attempt or active route");
      }
      const source = state.attempts.find(({ attemptId }) => attemptId === state.lastTerminalAttemptId);
      if (!source || source.attemptId !== event.revisionSourceAttemptId || source.status !== "advanced" ||
          source.canonicalStage !== event.canonicalStage || source.openingActivity !== event.owningActivity) {
        throw new Error("revision must link the last completed stage attempt");
      }
      state.revision = { sourceAttemptId: source.attemptId, eventId: event.eventId,
        reason: event.reason, evidence: event.artifactRef };
      break;
    }
    case "attempt.suspended": {
      const episode = findEpisode(state, event.episodeId);
      if (state.activeRouteEpisodeId !== episode.episodeId || episode.originAttemptId !== event.attemptId ||
          episode.suspendedAt || event.owningActivity !== episode.detectingActivity ||
          state.currentActivityId || state.currentBlockId) {
        throw new Error("suspension requires the active detecting attempt without open activity or block");
      }
      const attempt = currentAttempt(state);
      attempt.status = "suspended";
      episode.suspendedAt = event.occurredAt;
      state.currentAttemptId = null;
      break;
    }
    case "attempt.assessed": {
      const episode = findEpisode(state, event.episodeId);
      const attempt = state.attempts.find(({ attemptId }) => attemptId === event.attemptId);
      if (state.activeRouteEpisodeId !== episode.episodeId || !episode.suspendedAt || !episode.ownerReadyAt || episode.assessment || attempt.status !== "suspended" ||
          state.currentAttemptId || event.owningActivity !== episode.detectingActivity) {
        throw new Error("assessment requires completed owner work and a suspended detecting attempt");
      }
      episode.assessment = { eventId: event.eventId, disposition: event.disposition,
        artifactRef: event.artifactRef, reusableEvidence: event.reusableEvidence,
        invalidatedEvidence: event.invalidatedEvidence, rerunChecks: event.rerunChecks };
      break;
    }
    case "attempt.resumed":
    case "attempt.superseded": {
      const episode = findEpisode(state, event.episodeId);
      const attempt = state.attempts.find(({ attemptId }) => attemptId === event.attemptId);
      const disposition = event.kind === "attempt.resumed" ? "resume" : "supersede";
      if (state.currentAttemptId || attempt.status !== "suspended" || episode.assessment?.disposition !== disposition ||
          state.activeRouteEpisodeId !== episode.episodeId || episode.disposedAt) {
        throw new Error("attempt disposition requires a matching assessment and no active attempt");
      }
      episode.disposedAt = event.occurredAt;
      if (disposition === "resume") {
        attempt.status = "open";
        state.currentAttemptId = attempt.attemptId;
        state.currentStage = attempt.canonicalStage;
      } else {
        attempt.status = "superseded";
        attempt.terminalReason = "superseded";
        attempt.completedAt = event.occurredAt;
        attempt.completedEventId = event.eventId;
        state.lastTerminalAttemptId = attempt.attemptId;
      }
      break;
    }
    case "workstream.created": {
      if (state.created) throw new Error("workstream.created must be the first event");
      if (event.canonicalStage !== "Scope" || event.owningActivity !== "scope") {
        throw new Error("workstream.created must initialize Scope/scope");
      }
      state.created = true;
      state.repository = event.repository;
      state.workstreamId = event.workstreamId;
      state.currentStage = event.canonicalStage;
      break;
    }
    case "stage.entered": {
      if (!state.created) throw new Error("stage.entered requires workstream.created");
      if (state.currentAttemptId) throw new Error("overlapping open attempt is not allowed");
      const expectedMetadata = eventAttemptMetadata(state, event);
      if (
        event.attemptId !== expectedMetadata.attemptId ||
        event.attemptOrdinal !== expectedMetadata.attemptOrdinal
      ) {
        throw new Error("stage.entered attempt identity does not match its canonical ordinal");
      }
      if (state.attempts.length === 0 && event.canonicalStage !== "Scope") {
        throw new Error("the first canonical stage attempt must be Scope");
      }
      const activeEpisode = state.returns.find(({ episodeId }) => episodeId === state.activeRouteEpisodeId);
      const prior = state.attempts.find(({ attemptId }) => attemptId === state.lastTerminalAttemptId) ?? state.attempts.at(-1);
      const detector = state.attempts.find(({ attemptId }) => attemptId === activeEpisode?.originAttemptId);
      const routePrior = detector?.status === "suspended" && !activeEpisode.disposedAt && !activeEpisode.ownerReadyAt ? detector : prior;
      if (state.pendingSlice) {
        if (event.canonicalStage !== "Plan" || event.owningActivity !== "planning") {
          throw new Error("planned slice must enter Plan/planning");
        }
      } else if (state.revision) {
        if (prior?.attemptId !== state.revision.sourceAttemptId || event.canonicalStage !== prior.canonicalStage ||
            event.owningActivity !== prior.openingActivity) throw new Error("revision must enter its source stage");
      } else if (activeEpisode) {
        const ownerIndex = stageIndex(activeEpisode.owner.stage);
        const enteredIndex = stageIndex(event.canonicalStage);
        const priorIndex = stageIndex(routePrior.canonicalStage);
        const entersOwner =
          enteredIndex < priorIndex &&
          enteredIndex === ownerIndex &&
          (routePrior.status === "superseded" || routePrior.status === "suspended");
        const advancesDownstream = enteredIndex === priorIndex + 1 && routePrior.status === "advanced";
        const postTerminalOwner = activeEpisode.postTerminal && !activeEpisode.disposedAt &&
          routePrior.attemptId === activeEpisode.originAttemptId &&
          enteredIndex === ownerIndex && enteredIndex < priorIndex;
        const replacesSuspendedDetector = activeEpisode.disposedAt &&
          detector.status === "superseded" && (routePrior.status === "advanced" || routePrior.attemptId === detector.attemptId) &&
          event.canonicalStage === activeEpisode.detectingStage &&
          state.attempts.slice(state.attempts.findIndex(({ attemptId }) => attemptId === activeEpisode.originAttemptId) + 1)
            .some(({ canonicalStage, status }) => canonicalStage === activeEpisode.owner.stage && status === "advanced");
        if (
          enteredIndex < ownerIndex ||
          enteredIndex > stageIndex("Verify") ||
          (!entersOwner && !advancesDownstream && !replacesSuspendedDetector && !postTerminalOwner)
        ) {
          throw new Error("stage entry must follow the active correction route one canonical stage at a time");
        }
      } else if (prior) {
        if (event.canonicalStage === "Close" && state.returns.some(({ status }) => status !== "closed")) {
          throw new Error("Close requires all correction obligations resolved");
        }
        const sameAbandonedStage =
          prior.status === "abandoned" && prior.canonicalStage === event.canonicalStage;
        const normalAdvance =
          prior.status === "advanced" && stageIndex(event.canonicalStage) === stageIndex(prior.canonicalStage) + 1;
        if (!sameAbandonedStage && !normalAdvance) {
          throw new Error("stage entry must advance normally or follow an active correction route");
        }
      }
      state.attempts.push({
        attemptId: event.attemptId,
        canonicalStage: event.canonicalStage,
        ordinal: event.attemptOrdinal,
        openingActivity: event.owningActivity,
        enteredAt: event.occurredAt,
        enteredEventId: event.eventId,
        status: "open",
        revisionSourceAttemptId: state.revision?.sourceAttemptId ?? null,
        terminalReason: null,
        completedAt: null,
        completedEventId: null,
      });
      state.currentStage = event.canonicalStage;
      state.currentAttemptId = event.attemptId;
      if (activeEpisode?.disposedAt && detector?.status === "superseded" &&
          event.canonicalStage === activeEpisode.detectingStage) {
        activeEpisode.replacementAttemptId = event.attemptId;
      }
      if (state.pendingSlice) {
        state.slices.at(-1).planAttemptId = event.attemptId;
        state.slices.at(-1).status = "planning";
        state.pendingSlice = null;
      } else {
        const slice = state.slices.at(-1);
        if (slice && slice.status === "planned" && event.canonicalStage === "Implement") {
          slice.implementAttemptId = event.attemptId; slice.status = "implementing";
        } else if (slice && slice.status === "implemented" && event.canonicalStage === "Verify") {
          slice.verifyAttemptId = event.attemptId; slice.status = "verifying";
        }
      }
      state.revision = null;
      break;
    }
    case "activity.entered": {
      if (state.currentActivityId) throw new Error("overlapping activities are not allowed");
      const activityId = `activity_${event.eventId.slice(4)}`;
      state.activities.push({
        activityId,
        attemptId: event.attemptId,
        canonicalStage: event.canonicalStage,
        owningActivity: event.owningActivity,
        enteredAt: event.occurredAt,
        completedAt: null,
        status: "open",
      });
      state.currentActivityId = activityId;
      break;
    }
    case "activity.completed": {
      const activity = state.activities.find(({ activityId }) => activityId === state.currentActivityId);
      if (!activity || activity.owningActivity !== event.owningActivity) {
        throw new Error("activity.completed requires the matching open activity");
      }
      if (state.currentBlockId) throw new Error("a blocked activity must resume before completion");
      activity.completedAt = event.occurredAt;
      activity.status = "completed";
      state.currentActivityId = null;
      break;
    }
    case "artifact.accepted":
      state.acceptedArtifacts.push({
        eventId: event.eventId,
        attemptId: event.attemptId,
        canonicalStage: event.canonicalStage,
        owningActivity: event.owningActivity,
        artifactRef: event.artifactRef,
        acceptedAt: event.occurredAt,
      });
      break;
    case "stage.blocked": {
      if (state.currentBlockId) throw new Error("stage is already blocked");
      state.blocks.push({
        blockId: event.blockId,
        attemptId: event.attemptId,
        owningActivity: event.owningActivity,
        reason: event.reason,
        blockedAt: event.occurredAt,
        resumedAt: null,
        status: "blocked",
      });
      state.currentBlockId = event.blockId;
      break;
    }
    case "stage.unblocked": {
      if (state.currentBlockId !== event.blockId) throw new Error("stage.unblocked requires the active blockId");
      const block = state.blocks.find(({ blockId, status }) => blockId === event.blockId && status === "blocked");
      block.resumedAt = event.occurredAt;
      block.status = "resumed";
      state.currentBlockId = null;
      break;
    }
    case "stage.completed": {
      if (state.currentActivityId) throw new Error("open activity must complete before its stage attempt");
      if (state.currentBlockId) throw new Error("blocked stage must resume before completion");
      if (event.terminalReason === "workstream-closed" && event.canonicalStage !== "Close") {
        throw new Error("only a Close attempt may end with workstream-closed");
      }
      const attempt = currentAttempt(state);
      const slice = state.slices.at(-1);
      if (event.terminalReason === "advanced" && slice) {
        const evidence = state.acceptedArtifacts.some(({ attemptId }) => attemptId === attempt.attemptId);
        const detailedPlan = state.acceptedArtifacts.some(({ attemptId, owningActivity }) =>
          attemptId === attempt.attemptId && owningActivity === "planning");
        if (slice.planAttemptId === attempt.attemptId && !detailedPlan) throw new Error("slice requires accepted plan artifact");
        if (slice.implementAttemptId === attempt.attemptId && !evidence) throw new Error("slice requires accepted Implement evidence");
        if (slice.verifyAttemptId === attempt.attemptId && (!evidence || !attempt.passingVerificationAt)) {
          throw new Error("slice requires Verify evidence and passing verification");
        }
      }
      if (state.returns.some(({ parentEpisodeId, localValidation, originAttemptId }) =>
        parentEpisodeId !== null && (originAttemptId === attempt.attemptId ||
          state.returns.some(({ replacementAttemptId }) => replacementAttemptId === attempt.attemptId)) && !localValidation)) {
        throw new Error("child correction requires local validation before its detecting attempt advances");
      }
      const activeEpisode = state.returns.find(({ episodeId }) => episodeId === state.activeRouteEpisodeId);
      if (
        activeEpisode &&
        event.canonicalStage === activeEpisode.owner.stage &&
        event.terminalReason === "advanced" &&
        !activeEpisode.ownerReadyAt
      ) {
        throw new Error("the correction owner must record readiness before advancing");
      }
      if (slice && event.terminalReason === "advanced") {
        if (slice.planAttemptId === attempt.attemptId) slice.status = "planned";
        if (slice.implementAttemptId === attempt.attemptId) slice.status = "implemented";
        if (slice.verifyAttemptId === attempt.attemptId) slice.status = "verified";
      }
      attempt.status = event.terminalReason;
      attempt.terminalReason = event.terminalReason;
      attempt.completedAt = event.occurredAt;
      attempt.completedEventId = event.eventId;
      state.currentAttemptId = null;
      state.lastTerminalAttemptId = attempt.attemptId;
      break;
    }
    case "return.opened":
    case "correction.opened": {
      if (state.returns.some(({ episodeId }) => episodeId === event.episodeId)) {
        throw new Error(`correction episode ID has already been used: ${event.episodeId}`);
      }
      if (state.activeRouteEpisodeId && (event.kind !== "correction.opened" ||
          (event.parentEpisodeId !== state.activeRouteEpisodeId &&
           !(event.parentEpisodeId === null && !state.currentAttemptId &&
             state.returns.find(({ episodeId }) => episodeId === state.activeRouteEpisodeId)?.originAttemptId === event.originAttemptId)))) {
        throw new Error("only the top correction route may open a child");
      }
      const origin = state.attempts.find(({ attemptId }) => attemptId === event.originAttemptId);
      const postTerminal = event.kind === "correction.opened" && !state.currentAttemptId;
      if (!origin || event.originAttemptId !== (postTerminal ? state.lastTerminalAttemptId : state.currentAttemptId) ||
          (postTerminal && origin.status !== "superseded") ||
          event.attemptId !== (postTerminal ? null : origin.attemptId)) {
        throw new Error("correction source must be the current or last superseded terminal attempt");
      }
      if (event.kind === "return.opened" && state.returns.some(({ status }) => status !== "closed")) {
        throw new Error("only one correction episode may be active at a time");
      }
      const parent = state.returns.find(({ episodeId }) => episodeId === event.parentEpisodeId);
      if (event.kind === "correction.opened" && event.parentEpisodeId !== null &&
          (!parent || parent.status === "closed" || parent.status === "resumed" ||
           state.pendingVerificationEpisodeIds.includes(parent.episodeId) ||
           !state.attempts.some(({ attemptId }) => attemptId === event.originAttemptId &&
             state.attempts.indexOf(origin) > state.attempts.findIndex(({ attemptId: id }) => id === parent.originAttemptId)))) {
        throw new Error("child correction requires an active parent and corrective detecting attempt");
      }
      if (event.kind === "correction.opened" && event.parentEpisodeId === null &&
          state.returns.some(({ status, originAttemptId }) => status !== "closed" && status !== "resumed" &&
            !(postTerminal && originAttemptId === event.originAttemptId))) {
        throw new Error("distinct correction cannot bypass an active parent route");
      }
      if (event.detectingStage !== event.canonicalStage || event.detectingActivity !== event.owningActivity) {
        throw new Error("return detection must match the current stage and activity");
      }
      assertRoute(event.changeKind, event.initialOwningStage, event.initialOwningActivity);
      const edge = classifyBackwardEdge(
        event.detectingStage,
        event.detectingActivity,
        event.initialOwningStage,
        event.initialOwningActivity,
      );
      state.activeRouteEpisodeId = event.episodeId;
      if (origin.canonicalStage === "Verify") origin.passingVerificationAt = null;
      state.returns.push({
        episodeId: event.episodeId,
        originAttemptId: event.originAttemptId,
        parentEpisodeId: event.kind === "correction.opened" ? event.parentEpisodeId : null,
        postTerminal,
        localValidation: null,
        detectingStage: event.detectingStage,
        detectingActivity: event.detectingActivity,
        triggerSource: event.triggerSource,
        changeKind: event.changeKind,
        evidenceRefs: event.evidenceRefs,
        openedAt: event.occurredAt,
        owner: { stage: event.initialOwningStage, activity: event.initialOwningActivity },
        routes: [
          {
            stage: event.initialOwningStage,
            activity: event.initialOwningActivity,
            eventId: event.eventId,
            changeKind: event.changeKind,
          },
        ],
        ownerReadyAt: null,
        resumedAt: null,
        reverifiedAt: null,
        closedAt: null,
        status: "open",
      });
      state.returnEpisodeCount += 1;
      state[edge === "stage" ? "stageReturnCount" : "activityReturnCount"] += 1;
      break;
    }
    case "return.rerouted": {
      const episode = findEpisode(state, event.episodeId);
      if (state.activeRouteEpisodeId !== episode.episodeId) throw new Error("only the active correction route may reroute");
      if (episode.status !== "open" && episode.status !== "rerouted") {
        throw new Error("correction episode can only reroute before owner readiness");
      }
      if (event.canonicalStage !== episode.owner.stage || event.owningActivity !== episode.owner.activity) {
        throw new Error("a correction reroute must be recorded by its current owner");
      }
      assertRoute(event.changeKind, event.owningStage, event.routeActivity);
      const edge = classifyBackwardEdge(
        episode.owner.stage,
        episode.owner.activity,
        event.owningStage,
        event.routeActivity,
      );
      episode.owner = { stage: event.owningStage, activity: event.routeActivity };
      episode.changeKind = event.changeKind;
      episode.evidenceRefs.push(...event.evidenceRefs);
      episode.routes.push({
        stage: event.owningStage,
        activity: event.routeActivity,
        eventId: event.eventId,
        changeKind: event.changeKind,
      });
      episode.status = "rerouted";
      state[edge === "stage" ? "stageReturnCount" : "activityReturnCount"] += 1;
      break;
    }
    case "return.owner-ready": {
      const episode = findEpisode(state, event.episodeId);
      if (state.activeRouteEpisodeId !== episode.episodeId) throw new Error("only the active correction route may record readiness");
      if (episode.status !== "open" && episode.status !== "rerouted") {
        throw new Error("owner readiness has already been recorded for this correction episode");
      }
      if (event.canonicalStage !== episode.owner.stage || event.owningActivity !== episode.owner.activity) {
        throw new Error("owner readiness must be recorded by the current correction owner");
      }
      episode.ownerReadyAt = event.occurredAt;
      episode.status = "owner-ready";
      break;
    }
    case "return.resumed": {
      const episode = findEpisode(state, event.episodeId);
      if (state.activeRouteEpisodeId !== episode.episodeId) throw new Error("only the active correction route may resume");
      if (!episode.ownerReadyAt) throw new Error("return resumption requires owner readiness");
      if (episode.resumedAt) throw new Error("downstream resumption has already been recorded");
      if (episode.suspendedAt && (!episode.disposedAt ||
          state.attempts.find(({ attemptId }) => attemptId === episode.originAttemptId)?.status === "suspended")) {
        throw new Error("suspended return requires an assessed attempt disposition");
      }
      const sameStageReturn = episode.owner.stage === episode.detectingStage;
      const expectedStage = sameStageReturn
        ? episode.detectingStage
        : CANONICAL_STAGES[stageIndex(episode.owner.stage) + 1];
      if (event.canonicalStage !== expectedStage &&
          !(episode.suspendedAt && event.canonicalStage === episode.detectingStage &&
            state.currentAttemptId === episode.originAttemptId)) {
        throw new Error("downstream resumption must start at the next affected stage");
      }
      if (sameStageReturn && event.owningActivity !== episode.detectingActivity) {
        throw new Error("same-stage resumption must return to the detecting activity");
      }
      episode.resumedAt = event.occurredAt;
      episode.resumedStage = event.canonicalStage;
      episode.resumedActivity = event.owningActivity;
      episode.status = "resumed";
      state.activeRouteEpisodeId = null;
      state.pendingVerificationEpisodeIds.push(episode.episodeId);
      if (episode.parentEpisodeId) {
        const parent = findEpisode(state, episode.parentEpisodeId);
        if (!parent.disposedAt) state.activeRouteEpisodeId = parent.episodeId;
      } else {
        const older = state.returns.find(({ episodeId, originAttemptId, status }) =>
          episodeId !== episode.episodeId && originAttemptId === episode.originAttemptId &&
          status !== "closed" && status !== "resumed");
        if (older) state.activeRouteEpisodeId = older.episodeId;
      }
      break;
    }
    case "verification.completed": {
      if (event.canonicalStage !== "Verify") throw new Error("verification.completed belongs to Verify");
      if (!event.episodeId) {
        if (event.verificationStatus === "passed" || event.verificationStatus === "pass") {
          currentAttempt(state).passingVerificationAt = event.occurredAt;
        }
        break;
      }
      const episode = findEpisode(state, event.episodeId);
      if (!episode.resumedAt) throw new Error("re-verification requires downstream resumption");
      if (event.verificationStatus === "passed") {
        if (episode.parentEpisodeId && !episode.localValidation) throw new Error("child requires local validation before passing Verify");
        if (episode.assessment && !episode.disposedAt) throw new Error("verification requires evidence disposition");
        episode.reverifiedAt = event.occurredAt;
        episode.verificationAttemptId = event.attemptId;
        currentAttempt(state).passingVerificationAt = event.occurredAt;
      }
      episode.verificationStatus = event.verificationStatus;
      break;
    }
    case "return.closed": {
      const episode = findEpisode(state, event.episodeId);
      if (episode.status === "closed") throw new Error("correction episode is already closed");
      if (event.canonicalStage !== "Verify") {
        throw new Error("correction episode closure must be recorded in Verify");
      }
      if (!episode.ownerReadyAt || !episode.resumedAt || !episode.reverifiedAt ||
          episode.verificationAttemptId !== event.attemptId) {
        throw new Error(
          "return closure requires owner readiness, downstream resumption, and passing re-verification",
        );
      }
      if (state.activeRouteEpisodeId) throw new Error("active correction route must finish before closure");
      if (state.returns.some(({ parentEpisodeId, status }) => parentEpisodeId === episode.episodeId && status !== "closed")) {
        throw new Error("correction descendants must close child first");
      }
      if (episode.parentEpisodeId && !episode.localValidation) throw new Error("child requires local validation");
      episode.closedAt = event.occurredAt;
      episode.status = "closed";
      state.pendingVerificationEpisodeIds = state.pendingVerificationEpisodeIds.filter((id) => id !== episode.episodeId);
      break;
    }
    case "feedback.requested": {
      if (state.feedback.some(({ attemptId, status }) => attemptId === event.attemptId && status === "requested")) {
        throw new Error("feedback has already been requested for this attempt");
      }
      state.feedback.push({
        attemptId: event.attemptId,
        status: "requested",
        requestedAt: event.occurredAt,
      });
      break;
    }
    case "feedback.recorded": {
      const finalResponse = state.feedback.find(
        ({ attemptId, status }) => attemptId === event.attemptId && ["recorded", "skipped"].includes(status),
      );
      if (finalResponse) throw new Error("feedback has already been finalized for this attempt");
      if (
        event.feedbackStatus === "pending" &&
        state.feedback.some(({ attemptId, status }) => attemptId === event.attemptId && status === "pending")
      ) {
        throw new Error("feedback is already pending for this attempt");
      }
      state.feedback.push({
        attemptId: event.attemptId,
        status: event.feedbackStatus,
        privateRef: event.privateRef,
        recordedAt: event.occurredAt,
      });
      break;
    }
    case "workstream.closed": {
      if (state.currentAttemptId) throw new Error("workstream closure requires a terminal stage attempt");
      const finalAttempt = state.attempts.at(-1);
      if (
        !finalAttempt ||
        finalAttempt.canonicalStage !== "Close" ||
        finalAttempt.terminalReason !== "workstream-closed"
      ) {
        throw new Error("workstream closure requires a Close attempt ending with workstream-closed");
      }
      if (state.returns.some(({ status }) => status !== "closed")) {
        throw new Error("workstream closure requires all correction episodes to close");
      }
      if (state.pendingSlice || state.slices.some(({ status }) => status !== "verified")) {
        throw new Error("workstream closure requires passing evidence for every planned slice");
      }
      state.closed = true;
      state.currentStage = "Close";
      break;
    }
  }

  if (event.executionRef) {
    state.executionRefs.push({
      eventId: event.eventId,
      attemptId: event.attemptId,
      executionRef: event.executionRef,
    });
  }
  state.lastEventId = event.eventId;
  state.eventLinks.push({ eventId: event.eventId, kind: event.kind, attemptId: event.attemptId });
  state.unresolvedObservations = state.observations.filter(({ resolution }) => !resolution);
  const activeRoute = state.returns.find(({ episodeId }) => episodeId === state.activeRouteEpisodeId);
  const latestTerminal = state.attempts.find(({ attemptId }) => attemptId === state.lastTerminalAttemptId);
  state.nextLegalActions = state.currentAttemptId
    ? activeRoute && !activeRoute.suspendedAt && activeRoute.originAttemptId === state.currentAttemptId
      ? ["attempt.suspended", "stage.completed"]
      : activeRoute?.ownerReadyAt && !activeRoute.resumedAt &&
      state.currentStage !== activeRoute.owner.stage ? ["return.resumed"]
      : activeRoute && state.currentStage === activeRoute.owner.stage ? ["return.owner-ready", "stage.completed"]
      : state.pendingVerificationEpisodeIds.length && state.currentStage === "Verify"
      ? state.pendingVerificationEpisodeIds.every((id) => state.returns.find(({ episodeId }) => episodeId === id)?.reverifiedAt)
        ? ["return.closed"] : ["verification.completed"]
      : ["activity.entered", "stage.completed", "action.observed"]
    : state.revision ? ["stage.entered"]
      : activeRoute?.assessment ? [activeRoute.assessment.disposition === "resume" ? "attempt.resumed" : "attempt.superseded"]
        : activeRoute?.suspendedAt && activeRoute.ownerReadyAt ? ["attempt.assessed"]
          : activeRoute ? ["stage.entered"]
            : latestTerminal?.canonicalStage === "Verify" && latestTerminal.status === "advanced" &&
              latestTerminal.passingVerificationAt &&
              !state.pendingVerificationEpisodeIds.length
              ? ["stage.entered", "slice.started", "action.observed"]
              : ["stage.entered", "revision.opened", "action.observed"];
  return state;
}

export function reduceLifecycle(events) {
  return events.reduce(applyLifecycleEvent, initialLifecycleState());
}
