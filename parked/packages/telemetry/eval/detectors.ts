// ---------------------------------------------------------------------------
// Friction detectors — individual analysis functions consumed by the
// per-run friction reducer. Each detector accepts a SessionSummary and
// returns zero or more FrictionFindings. Thresholds are documented as
// module-level constants for testability.
// ---------------------------------------------------------------------------

import type { FrictionFinding, FrictionSeverity, SessionSummary } from "./types.js";

/** A tool with >= this many errors is flagged as a spike. */
const TOOL_ERROR_THRESHOLD = 3;

/** A turn with >= this many tool results is flagged as high-churn. */
const HIGH_CHURN_THRESHOLD = 8; // matches SessionSummaryProvider

/** A sub-agent running more than this many ms is flagged as expensive. */
const SUBAGENT_DURATION_THRESHOLD_MS = 120_000; // 2 minutes

/** Total sub-agent tool uses across the session above this threshold. */
const SUBAGENT_TOOL_THRESHOLD = 15;

/** Estimated cost above this threshold. */
const HIGH_COST_THRESHOLD_USD = 0.5;

/** Session with more than this many total tool calls. */
const SESSION_TOOL_THRESHOLD = 60;

/** Turns with no artifacts and high activity. */
const LONG_SESSION_TURN_THRESHOLD = 20;

/** Sessions with zero checkpoints. */
const MISSING_CHECKPOINT_TURN_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityForToolErrorRate(errors: number, _total: number): FrictionSeverity {
	if (errors >= 10) return "high";
	if (errors >= 5) return "medium";
	return "low";
}

function severityForToolChurn(highChurnCount: number): FrictionSeverity {
	if (highChurnCount >= 5) return "high";
	if (highChurnCount >= 2) return "medium";
	return "low";
}

function severityForDuration(durationMs: number): FrictionSeverity {
	if (durationMs >= 300_000) return "high"; // 5 min
	if (durationMs >= 120_000) return "medium";
	return "low";
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

/**
 * Detect individual tools that failed repeatedly.
 */
export function detectToolErrorSpikes(summary: SessionSummary): FrictionFinding[] {
	const findings: FrictionFinding[] = [];
	for (const [toolName, stats] of Object.entries(summary.toolCallSummary)) {
		if (stats.errors >= TOOL_ERROR_THRESHOLD) {
			findings.push({
				type: "tool_error_spike",
				severity: severityForToolErrorRate(stats.errors, stats.total),
				description: `Tool "${toolName}" failed ${stats.errors}/${stats.total} times`,
				evidence: { toolName, errors: stats.errors, total: stats.total },
				sessionId: summary.sessionId,
				timestamp: Date.now(),
			});
		}
	}
	return findings;
}

/**
 * Detect turns with unusually high tool churn.
 */
export function detectHighToolChurn(summary: SessionSummary): FrictionFinding[] {
	if (summary.highChurnTurnCount === 0) return [];
	return [
		{
			type: "high_tool_churn",
			severity: severityForToolChurn(summary.highChurnTurnCount),
			description: `${summary.highChurnTurnCount} turns with ${HIGH_CHURN_THRESHOLD}+ tool calls each`,
			evidence: { highChurnCount: summary.highChurnTurnCount, threshold: HIGH_CHURN_THRESHOLD },
			sessionId: summary.sessionId,
			timestamp: Date.now(),
		},
	];
}

/**
 * Detect expensive sub-agents (long duration or many tool uses).
 */
export function detectExpensiveSubAgents(summary: SessionSummary): FrictionFinding[] {
	if (summary.subAgentSummary.totalCreated === 0) return [];
	const findings: FrictionFinding[] = [];

	if (
		summary.subAgentSummary.totalToolUses >= SUBAGENT_TOOL_THRESHOLD ||
		summary.subAgentSummary.totalDurationMs >= SUBAGENT_DURATION_THRESHOLD_MS
	) {
		findings.push({
			type: "expensive_subagent",
			severity: severityForDuration(summary.subAgentSummary.totalDurationMs),
			description: `Sub-agents used ${summary.subAgentSummary.totalToolUses} tools across ${summary.subAgentSummary.totalCreated} runs (${Math.round(summary.subAgentSummary.totalDurationMs / 1000)}s total)`,
			evidence: {
				totalCreated: summary.subAgentSummary.totalCreated,
				totalDurationMs: summary.subAgentSummary.totalDurationMs,
				totalToolUses: summary.subAgentSummary.totalToolUses,
			},
			sessionId: summary.sessionId,
			timestamp: Date.now(),
		});
	}

	return findings;
}

/**
 * Detect high cost relative to artifact output.
 */
export function detectHighCost(summary: SessionSummary): FrictionFinding[] {
	if (!summary.tokenUsage.costUsd || summary.tokenUsage.costUsd < HIGH_COST_THRESHOLD_USD) return [];
	return [
		{
			type: "high_cost_artifact_ratio",
			severity: summary.tokenUsage.costUsd >= 1.0 ? "high" : "medium",
			description: `Session cost $${summary.tokenUsage.costUsd.toFixed(2)} with ${summary.checkpoints.length} artifact${summary.checkpoints.length === 1 ? "" : "s"}`,
			evidence: {
				costUsd: summary.tokenUsage.costUsd,
				totalTokens: summary.tokenUsage.totalTokens,
				checkpointCount: summary.checkpoints.length,
			},
			sessionId: summary.sessionId,
			timestamp: Date.now(),
		},
	];
}

/**
 * Detect sessions with high total tool counts (many turns, many tools).
 */
export function detectLongSession(summary: SessionSummary): FrictionFinding[] {
	if (summary.turnCount < LONG_SESSION_TURN_THRESHOLD) return [];
	const totalCalls = Object.values(summary.toolCallSummary).reduce((sum, s) => sum + s.total, 0);
	if (totalCalls < SESSION_TOOL_THRESHOLD) return [];
	return [
		{
			type: "long_session",
			severity: summary.turnCount >= 40 ? "high" : "medium",
			description: `${summary.turnCount} turns with ${totalCalls} total tool calls (${Math.round(summary.durationMs / 1000)}s)`,
			evidence: {
				turnCount: summary.turnCount,
				totalToolCalls: totalCalls,
				durationMs: summary.durationMs,
			},
			sessionId: summary.sessionId,
			timestamp: Date.now(),
		},
	];
}

/**
 * Detect sessions that had activity but no checkpoints (MyFlow process not
 * emitting checkpoint events).
 */
export function detectMissingCheckpoints(summary: SessionSummary): FrictionFinding[] {
	if (summary.checkpoints.length > 0) return [];
	if (summary.turnCount < MISSING_CHECKPOINT_TURN_THRESHOLD) return [];
	return [
		{
			type: "missing_checkpoints",
			severity: "medium",
			description: `${summary.turnCount} turns with zero myflow_checkpoint events — checkpoints not being emitted`,
			evidence: { turnCount: summary.turnCount, checkpointCount: 0 },
			sessionId: summary.sessionId,
			timestamp: Date.now(),
		},
	];
}

/**
 * Detect slow stages — stages with zero checkpoints despite high activity.
 * These suggest a stage that took many turns without emitting an artifact.
 */
export function detectStageTiming(summary: SessionSummary): FrictionFinding[] {
	if (summary.checkpoints.length === 0 && summary.turnCount >= MISSING_CHECKPOINT_TURN_THRESHOLD) {
		// Handled by detectMissingCheckpoints
		return [];
	}
	// MVP: no per-stage timing analysis yet — requires richer checkpoint data
	return [];
}

/**
 * Run all detectors and return combined findings.
 */
export function runAllDetectors(summary: SessionSummary): FrictionFinding[] {
	return [
		...detectToolErrorSpikes(summary),
		...detectHighToolChurn(summary),
		...detectExpensiveSubAgents(summary),
		...detectHighCost(summary),
		...detectLongSession(summary),
		...detectMissingCheckpoints(summary),
		...detectStageTiming(summary),
	];
}
