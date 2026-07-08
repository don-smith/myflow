import { describe, expect, it } from "vitest";
import type { SessionSummary } from "./types.js";
import {
	detectToolErrorSpikes,
	detectHighToolChurn,
	detectExpensiveSubAgents,
	detectHighCost,
	detectLongSession,
	detectMissingCheckpoints,
} from "./detectors.js";

const BASE_SUMMARY: SessionSummary = {
	sessionId: "test-session",
	durationMs: 10_000,
	turnCount: 5,
	toolCallSummary: {},
	highChurnTurnCount: 0,
	subAgentSummary: { totalCreated: 0, totalDurationMs: 0, totalToolUses: 0 },
	tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
	checkpoints: [],
};

describe("detectToolErrorSpikes", () => {
	it("returns empty when no tools have errors", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			toolCallSummary: { read: { total: 5, errors: 0 } },
		};
		expect(detectToolErrorSpikes(summary)).toEqual([]);
	});

	it("flags tools with >= 3 errors", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			toolCallSummary: { read: { total: 8, errors: 4 }, edit: { total: 2, errors: 0 } },
		};
		const findings = detectToolErrorSpikes(summary);
		expect(findings).toHaveLength(1);
		expect(findings[0].type).toBe("tool_error_spike");
		expect(findings[0].evidence).toMatchObject({ toolName: "read", errors: 4, total: 8 });
	});

	it("flags multiple tools with errors", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			toolCallSummary: {
				read: { total: 5, errors: 3 },
				write: { total: 10, errors: 5 },
			},
		};
		expect(detectToolErrorSpikes(summary)).toHaveLength(2);
	});

	it("returns high severity for 10+ errors", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			toolCallSummary: { read: { total: 20, errors: 10 } },
		};
		expect(detectToolErrorSpikes(summary)[0].severity).toBe("high");
	});
});

describe("detectHighToolChurn", () => {
	it("returns empty when no high-churn turns", () => {
		expect(detectHighToolChurn(BASE_SUMMARY)).toEqual([]);
	});

	it("flags sessions with high-churn turns", () => {
		const summary: SessionSummary = { ...BASE_SUMMARY, highChurnTurnCount: 3 };
		const findings = detectHighToolChurn(summary);
		expect(findings).toHaveLength(1);
		expect(findings[0].type).toBe("high_tool_churn");
		expect(findings[0].severity).toBe("medium");
	});
});

describe("detectExpensiveSubAgents", () => {
	it("returns empty when no sub-agents", () => {
		expect(detectExpensiveSubAgents(BASE_SUMMARY)).toEqual([]);
	});

	it("flags sub-agents with many tool uses", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			subAgentSummary: { totalCreated: 3, totalDurationMs: 5000, totalToolUses: 20 },
		};
		const findings = detectExpensiveSubAgents(summary);
		expect(findings).toHaveLength(1);
		expect(findings[0].type).toBe("expensive_subagent");
	});

	it("flags sub-agents with long duration", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			subAgentSummary: { totalCreated: 1, totalDurationMs: 300_000, totalToolUses: 5 },
		};
		const findings = detectExpensiveSubAgents(summary);
		expect(findings).toHaveLength(1);
		expect(findings[0].severity).toBe("high");
	});
});

describe("detectHighCost", () => {
	it("returns empty when cost is below threshold", () => {
		expect(detectHighCost(BASE_SUMMARY)).toEqual([]);
	});

	it("returns empty when cost is undefined", () => {
		expect(detectHighCost(BASE_SUMMARY)).toEqual([]);
	});

	it("flags sessions with high cost", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0.75 },
		};
		const findings = detectHighCost(summary);
		expect(findings).toHaveLength(1);
		expect(findings[0].severity).toBe("medium");
	});

	it("returns high severity for $1+ cost", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 1.25 },
		};
		expect(detectHighCost(summary)[0].severity).toBe("high");
	});
});

describe("detectLongSession", () => {
	it("returns empty for short sessions", () => {
		expect(detectLongSession(BASE_SUMMARY)).toEqual([]);
	});

	it("flags long sessions with many tool calls", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			turnCount: 25,
			toolCallSummary: { read: { total: 60, errors: 0 } },
		};
		const findings = detectLongSession(summary);
		expect(findings).toHaveLength(1);
		expect(findings[0].type).toBe("long_session");
	});
});

describe("detectMissingCheckpoints", () => {
	it("returns empty when session has checkpoints", () => {
		const summary: SessionSummary = {
			...BASE_SUMMARY,
			checkpoints: [{ stage: "research", timestamp: 1 }],
		};
		expect(detectMissingCheckpoints(summary)).toEqual([]);
	});

	it("returns empty for short sessions without checkpoints", () => {
		const summary: SessionSummary = { ...BASE_SUMMARY, turnCount: 3 };
		expect(detectMissingCheckpoints(summary)).toEqual([]);
	});

	it("flags sessions with activity but no checkpoints", () => {
		const summary: SessionSummary = { ...BASE_SUMMARY, turnCount: 10 };
		const findings = detectMissingCheckpoints(summary);
		expect(findings).toHaveLength(1);
		expect(findings[0].type).toBe("missing_checkpoints");
	});
});
