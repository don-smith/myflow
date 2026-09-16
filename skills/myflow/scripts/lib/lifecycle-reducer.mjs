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
  if (event.kind === "workstream.created" || event.kind === "workstream.closed") return;
  const attempt = currentAttempt(state);
  if (event.kind === "stage.entered") return;
  if (!attempt) throw new Error(`${event.kind} requires an open stage attempt`);
  if (event.attemptId !== attempt.attemptId || event.attemptOrdinal !== attempt.ordinal) {
    throw new Error(`${event.kind} attempt metadata does not match the open attempt`);
  }
  if (event.canonicalStage !== attempt.canonicalStage) {
    throw new Error(`${event.kind} stage does not match the open attempt`);
  }
}

export function eventAttemptMetadata(state, input) {
  if (input.kind === "workstream.created" || input.kind === "workstream.closed") {
    return { attemptId: null, attemptOrdinal: null };
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
      const prior = state.attempts.at(-1);
      const activeEpisode = state.returns.find(({ status }) => status !== "closed");
      if (activeEpisode) {
        const ownerIndex = stageIndex(activeEpisode.owner.stage);
        const enteredIndex = stageIndex(event.canonicalStage);
        const priorIndex = stageIndex(prior.canonicalStage);
        const entersOwner =
          enteredIndex < priorIndex &&
          enteredIndex === ownerIndex &&
          prior.status === "superseded";
        const advancesDownstream = enteredIndex === priorIndex + 1 && prior.status === "advanced";
        if (
          enteredIndex < ownerIndex ||
          enteredIndex > stageIndex("Verify") ||
          (!entersOwner && !advancesDownstream)
        ) {
          throw new Error("stage entry must follow the active correction route one canonical stage at a time");
        }
      } else if (prior) {
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
        terminalReason: null,
        completedAt: null,
        completedEventId: null,
      });
      state.currentStage = event.canonicalStage;
      state.currentAttemptId = event.attemptId;
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
      const activeEpisode = state.returns.find(({ status }) => status !== "closed");
      if (
        activeEpisode &&
        event.canonicalStage === activeEpisode.owner.stage &&
        event.terminalReason === "advanced" &&
        !activeEpisode.ownerReadyAt
      ) {
        throw new Error("the correction owner must record readiness before advancing");
      }
      attempt.status = event.terminalReason;
      attempt.terminalReason = event.terminalReason;
      attempt.completedAt = event.occurredAt;
      attempt.completedEventId = event.eventId;
      state.currentAttemptId = null;
      break;
    }
    case "return.opened": {
      if (state.returns.some(({ episodeId }) => episodeId === event.episodeId)) {
        throw new Error(`correction episode ID has already been used: ${event.episodeId}`);
      }
      if (state.returns.some(({ status }) => status !== "closed")) {
        throw new Error("only one correction episode may be active at a time");
      }
      if (event.originAttemptId !== event.attemptId) throw new Error("return origin must be the open attempt");
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
      state.returns.push({
        episodeId: event.episodeId,
        originAttemptId: event.originAttemptId,
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
      if (!episode.ownerReadyAt) throw new Error("return resumption requires owner readiness");
      if (episode.resumedAt) throw new Error("downstream resumption has already been recorded");
      const sameStageReturn = episode.owner.stage === episode.detectingStage;
      const expectedStage = sameStageReturn
        ? episode.detectingStage
        : CANONICAL_STAGES[stageIndex(episode.owner.stage) + 1];
      if (event.canonicalStage !== expectedStage) {
        throw new Error("downstream resumption must start at the next affected stage");
      }
      if (sameStageReturn && event.owningActivity !== episode.detectingActivity) {
        throw new Error("same-stage resumption must return to the detecting activity");
      }
      episode.resumedAt = event.occurredAt;
      episode.resumedStage = event.canonicalStage;
      episode.resumedActivity = event.owningActivity;
      episode.status = "resumed";
      break;
    }
    case "verification.completed": {
      if (event.canonicalStage !== "Verify") throw new Error("verification.completed belongs to Verify");
      if (!event.episodeId) break;
      const episode = findEpisode(state, event.episodeId);
      if (!episode.resumedAt) throw new Error("re-verification requires downstream resumption");
      if (event.verificationStatus === "passed") episode.reverifiedAt = event.occurredAt;
      episode.verificationStatus = event.verificationStatus;
      break;
    }
    case "return.closed": {
      const episode = findEpisode(state, event.episodeId);
      if (episode.status === "closed") throw new Error("correction episode is already closed");
      if (event.canonicalStage !== "Verify") {
        throw new Error("correction episode closure must be recorded in Verify");
      }
      if (!episode.ownerReadyAt || !episode.resumedAt || !episode.reverifiedAt) {
        throw new Error(
          "return closure requires owner readiness, downstream resumption, and passing re-verification",
        );
      }
      episode.closedAt = event.occurredAt;
      episode.status = "closed";
      break;
    }
    case "feedback.requested":
      state.feedback.push({
        attemptId: event.attemptId,
        status: "requested",
        requestedAt: event.occurredAt,
      });
      break;
    case "feedback.recorded":
      state.feedback.push({
        attemptId: event.attemptId,
        status: event.feedbackStatus,
        privateRef: event.privateRef,
        recordedAt: event.occurredAt,
      });
      break;
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
  return state;
}

export function reduceLifecycle(events) {
  return events.reduce(applyLifecycleEvent, initialLifecycleState());
}
