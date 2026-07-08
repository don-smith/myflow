import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportFrictionFindings } from "./land-integration.js";
import type { SessionSummary } from "./types.js";

const SAMPLE_SUMMARY: SessionSummary = {
	sessionId: "test-session",
	durationMs: 30_000,
	turnCount: 10,
	toolCallSummary: { read: { total: 15, errors: 5 } },
	highChurnTurnCount: 2,
	subAgentSummary: { totalCreated: 3, totalDurationMs: 45_000, totalToolUses: 12 },
	tokenUsage: { inputTokens: 5000, outputTokens: 2000, totalTokens: 7000, costUsd: 0.15 },
	checkpoints: [{ stage: "design", timestamp: 1000 }],
};

describe("reportFrictionFindings", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), "land-eval-test-" + Date.now());
		const sessionsDir = join(tmpDir, ".myflow", "telemetry", "sessions");
		mkdirSync(sessionsDir, { recursive: true });
		writeFileSync(join(sessionsDir, "test-session.json"), JSON.stringify(SAMPLE_SUMMARY), "utf-8");
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns 0 when no summary exists", () => {
		const count = reportFrictionFindings("nonexistent", tmpDir);
		expect(count).toBe(0);
	});

	it("returns count of actionable findings but cannot write tabled file outside repo", () => {
		// When not in a git repo, resolveTabledPath returns undefined
		// so findings aren't persisted but we still count them
		const count = reportFrictionFindings("test-session", tmpDir);
		// 2 findings: tool_error_spike (medium, 5 errors) + high_tool_churn (medium, 2 churn turns)
		// low severity excluded
		expect(count).toBeGreaterThanOrEqual(2);
	});
});
