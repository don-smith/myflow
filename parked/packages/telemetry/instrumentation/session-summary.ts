// ---------------------------------------------------------------------------
// SessionSummaryProvider — always-registered telemetry provider that
// accumulates deterministic metrics from the event stream at session
// shutdown into a lightweight SessionSummary JSON file.
//
// This is the "auto-collect" half of the hybrid reducer architecture:
// data is persisted locally at shutdown (fast, no analysis), and the
// friction reducer queries this file during Close.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionSummary } from "../eval/types.js";
import type { TelemetryEvent } from "../types/events.js";
import type { TelemetryProvider } from "../types/provider.js";

const SESSIONS_DIR = ".myflow/telemetry/sessions";

/** Per-session accumulators that the provider resets on `session_start`. */
interface Accumulator {
	sessionId: string;
	sessionStartTs: number;
	turnCount: number;
	toolCallSummary: Record<string, { total: number; errors: number }>;
	highChurnTurnCount: number;
	subAgentTotalCreated: number;
	subAgentTotalDurationMs: number;
	subAgentTotalToolUses: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	costUsd: number | undefined;
	checkpoints: SessionSummary["checkpoints"];
}

function freshAccumulator(): Accumulator {
	return {
		sessionId: "",
		sessionStartTs: 0,
		turnCount: 0,
		toolCallSummary: {},
		highChurnTurnCount: 0,
		subAgentTotalCreated: 0,
		subAgentTotalDurationMs: 0,
		subAgentTotalToolUses: 0,
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
		costUsd: undefined,
		checkpoints: [],
	};
}

/**
 * Always-registered internal provider. Not config-dependent — the Provider
 * sits between the dispatcher and storage, so friction signals are captured
 * even without MLflow configured.
 */
export class SessionSummaryProvider implements TelemetryProvider {
	readonly meta = { name: "session-summary", label: "Session Summary" } as const;

	private acc = freshAccumulator();

	async trackEvent(event: TelemetryEvent): Promise<void> {
		switch (event.kind) {
			case "session_start": {
				this.acc = freshAccumulator();
				this.acc.sessionId = event.sessionId;
				this.acc.sessionStartTs = event.timestamp;
				return;
			}
			case "turn_start": {
				this.acc.turnCount++;
				return;
			}
			case "turn_end": {
				if (event.toolResultCount !== undefined && event.toolResultCount >= 8) {
					this.acc.highChurnTurnCount++;
				}
				if (event.usage) {
					this.acc.inputTokens += event.usage.input;
					this.acc.outputTokens += event.usage.output;
					this.acc.totalTokens += event.usage.totalTokens;
					if (event.usage.cost !== undefined) {
						this.acc.costUsd = (this.acc.costUsd ?? 0) + event.usage.cost;
					}
				}
				return;
			}
			case "tool_execution_end": {
				const entry = this.acc.toolCallSummary[event.toolName];
				if (entry) {
					entry.total++;
					if (event.isError) entry.errors++;
				} else {
					this.acc.toolCallSummary[event.toolName] = {
						total: 1,
						errors: event.isError ? 1 : 0,
					};
				}
				return;
			}
			case "subagent_completed": {
				this.acc.subAgentTotalCreated++;
				this.acc.subAgentTotalDurationMs += event.durationMs;
				this.acc.subAgentTotalToolUses += event.toolUses ?? 0;
				return;
			}
			case "subagent_failed": {
				this.acc.subAgentTotalCreated++;
				this.acc.subAgentTotalDurationMs += event.durationMs;
				return;
			}
			case "myflow_checkpoint": {
				this.acc.checkpoints.push({
					stage: event.stage,
					timestamp: event.timestamp,
					artifactPath: event.artifactPath,
					artifactKind: event.artifactKind,
					riskLevel: event.riskLevel,
					decisionCount: event.decisionCount,
				});
				return;
			}
			// All other event kinds are irrelevant to the summary — skip.
		}
	}

	async flush(): Promise<void> {
		// No-op — data is persisted once in shutdown().
	}

	async shutdown(): Promise<void> {
		if (this.acc.turnCount === 0 && this.acc.checkpoints.length === 0) return;
		this.persist();
	}

	private persist(): void {
		const cwd = process.cwd();
		const dir = join(cwd, SESSIONS_DIR);
		mkdirSync(dir, { recursive: true });

		const summary: SessionSummary = {
			sessionId: this.acc.sessionId,
			durationMs: Date.now() - this.acc.sessionStartTs,
			turnCount: this.acc.turnCount,
			toolCallSummary: this.acc.toolCallSummary,
			highChurnTurnCount: this.acc.highChurnTurnCount,
			subAgentSummary: {
				totalCreated: this.acc.subAgentTotalCreated,
				totalDurationMs: this.acc.subAgentTotalDurationMs,
				totalToolUses: this.acc.subAgentTotalToolUses,
			},
			tokenUsage: {
				inputTokens: this.acc.inputTokens,
				outputTokens: this.acc.outputTokens,
				totalTokens: this.acc.totalTokens,
				costUsd: this.acc.costUsd,
			},
			checkpoints: this.acc.checkpoints,
		};

		const filePath = join(dir, `${summary.sessionId}.json`);
		try {
			writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
		} catch (e) {
			console.warn(
				`[telemetry] failed to persist session summary: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}
}
