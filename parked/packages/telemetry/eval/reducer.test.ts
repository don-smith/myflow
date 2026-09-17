import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionSummary } from "./types.js";
import { analyzeSession } from "./reducer.js";

const SAMPLE_SUMMARY: SessionSummary = {
	sessionId: "test-session-1",
	durationMs: 30_000,
	turnCount: 10,
	toolCallSummary: { read: { total: 15, errors: 5 } },
	highChurnTurnCount: 2,
	subAgentSummary: { totalCreated: 3, totalDurationMs: 45_000, totalToolUses: 12 },
	tokenUsage: { inputTokens: 5000, outputTokens: 2000, totalTokens: 7000, costUsd: 0.15 },
	checkpoints: [{ stage: "design", timestamp: 1000 }],
};

describe("analyzeSession", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), "eval-test-" + Date.now());
		const sessionsDir = join(tmpDir, ".myflow", "telemetry", "sessions");
		mkdirSync(sessionsDir, { recursive: true });
	});

	it("returns empty when no summary exists for sessionId", () => {
		const findings = analyzeSession("nonexistent", tmpDir);
		expect(findings).toEqual([]);
	});

	it("analyzes a valid session summary", () => {
		const sessionsDir = join(tmpDir, ".myflow", "telemetry", "sessions");
		writeFileSync(join(sessionsDir, "test-session-1.json"), JSON.stringify(SAMPLE_SUMMARY), "utf-8");
		const findings = analyzeSession("test-session-1", tmpDir);
		expect(findings.length).toBeGreaterThan(0);
		// Should find the tool error spike (5 errors on read)
		expect(findings.some((f) => f.type === "tool_error_spike")).toBe(true);
	});

	it("returns empty for a clean session with no friction", () => {
		const clean: SessionSummary = {
			sessionId: "clean-session",
			durationMs: 5000,
			turnCount: 3,
			toolCallSummary: { read: { total: 5, errors: 0 } },
			highChurnTurnCount: 0,
			subAgentSummary: { totalCreated: 0, totalDurationMs: 0, totalToolUses: 0 },
			tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
			checkpoints: [{ stage: "research", timestamp: 100 }, { stage: "design", timestamp: 200 }],
		};
		const sessionsDir = join(tmpDir, ".myflow", "telemetry", "sessions");
		writeFileSync(join(sessionsDir, "clean-session.json"), JSON.stringify(clean), "utf-8");
		const findings = analyzeSession("clean-session", tmpDir);
		expect(findings).toEqual([]);
	});

	it("handles malformed JSON gracefully", () => {
		const sessionsDir = join(tmpDir, ".myflow", "telemetry", "sessions");
		writeFileSync(join(sessionsDir, "corrupt.json"), "not json", "utf-8");
		const findings = analyzeSession("corrupt", tmpDir);
		expect(findings).toEqual([]);
	});
});
