// ---------------------------------------------------------------------------
// Public API: emit MyFlow checkpoint events
//
// Call from skill code at stage boundaries to provide workflow-context
// data alongside the Pi lifecycle event stream.
// ---------------------------------------------------------------------------

import { dispatchTelemetryEvent } from "./dispatcher.js";
import { currentSessionId, withSessionContext } from "./instrumentation/state.js";

/**
 * Data payload for `emitMyFlowCheckpoint`. All fields except `stage` are
 * optional — the event fills in `kind`, `sessionId`, and `timestamp`.
 */
export interface MyFlowCheckpointData {
	/** MyFlow stage name: "alignment", "research", "design", "plan", "implement", "validate", "review", "close". */
	stage: string;
	/** Path to the artifact produced or consumed at this checkpoint, if any. */
	artifactPath?: string;
	/** Artifact bucket/kint: "designs", "plans", "alignment", etc. */
	artifactKind?: string;
	riskLevel?: "low" | "medium" | "high";
	decisionCount?: number;
	restartRecommended?: boolean;
	/** Pi session ID from the checkpoint's context — may differ from the telemetry event's sessionId for sub-agent workstreams. */
	piSessionId?: string;
}

/**
 * Emit a `myflow_checkpoint` telemetry event.
 *
 * No-op when no telemetry session is active (e.g. outside a Pi session).
 * Safe to call from any code path — the dispatcher gates on registered
 * providers and event-kind allowlist.
 */
export function emitMyFlowCheckpoint(data: MyFlowCheckpointData): void {
	if (!currentSessionId) return;
	dispatchTelemetryEvent(
		withSessionContext({
			kind: "myflow_checkpoint",
			sessionId: currentSessionId,
			timestamp: Date.now(),
			...data,
		}),
	);
}