// ---------------------------------------------------------------------------
// Eval/friction feedback loop types
//
// These types describe the output of the per-run friction reducer, not the
// telemetry events it analyzes. The reducer consumes `SessionSummary`
// (persisted at session_shutdown) and produces `FrictionFinding[]`.
// ---------------------------------------------------------------------------

/** Severity classification for a friction finding. */
export type FrictionSeverity = "low" | "medium" | "high";

/** Classified friction type — maps to a specific detector function. */
export type FrictionType =
	/** A tool failed repeatedly in the session (e.g. `read` failed 5+ times). */
	| "tool_error_spike"
	/** A turn had an unusually high number of tool calls. */
	| "high_tool_churn"
	/** A sub-agent used many tools or ran for a long time. */
	| "expensive_subagent"
	/** Total session token/cost is high relative to artifact output. */
	| "high_cost_artifact_ratio"
	/** Many turns in the session, suggesting a slow or looping conversation. */
	| "long_session"
	/** Same tool called many times with similar arguments. */
	| "repeated_tool_pattern"
	/** Stage produced no artifact or took much longer than expected. */
	| "slow_stage"
	/** Session had no checkpoints (MyFlow process not emitting events). */
	| "missing_checkpoints";

/**
 * One friction finding produced by the reducer. Destined for the personal
 * repo tabled file in MVP, with paths for later promotion.
 */
export interface FrictionFinding {
	type: FrictionType;
	severity: FrictionSeverity;
	/** Human-readable description — tabled entry body. */
	description: string;
	/** Supporting evidence: counts, durations, token amounts. */
	evidence: Record<string, unknown>;
	/** Session ID for traceback. */
	sessionId: string;
	/** When the finding was generated (ms epoch). */
	timestamp: number;
}

/**
 * Lightweight per-session summary persisted at session shutdown.
 * Captures deterministic metrics from the telemetry event stream that the
 * friction reducer analyzes during Land. Persisted as JSON to
 * `.myflow/telemetry/sessions/<sessionId>.json`.
 */
export interface SessionSummary {
	sessionId: string;
	/** Session wall-clock duration in milliseconds. */
	durationMs: number;
	/** Total turns in the session. */
	turnCount: number;
	/** Tool calls grouped by tool name. */
	toolCallSummary: Record<
		string,
		{
			total: number;
			errors: number;
		}
	>;
	/** Tracks turns with high tool-churn (toolResultCount >= threshold). */
	highChurnTurnCount: number;
	/** Sub-agent aggregate metrics. */
	subAgentSummary: {
		totalCreated: number;
		totalDurationMs: number;
		totalToolUses: number;
	};
	/** Token usage across the session (from turn_end usage). */
	tokenUsage: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		costUsd?: number;
	};
	/** Checkpoints emitted during the session. */
	checkpoints: Array<{
		stage: string;
		timestamp: number;
		artifactPath?: string;
		artifactKind?: string;
		riskLevel?: "low" | "medium" | "high";
		decisionCount?: number;
	}>;
}