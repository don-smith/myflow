// ---------------------------------------------------------------------------
// Friction reducer — per-run friction analysis
//
// Reads a persisted SessionSummary JSON, runs all detectors, and returns
// structured FrictionFindings. Designed to be invoked from the Close skill
// (Stage 5) or manually during development.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runAllDetectors } from "./detectors.js";
import type { FrictionFinding, SessionSummary } from "./types.js";

const SESSIONS_DIR = ".myflow/telemetry/sessions";

/**
 * Analyze a completed session's summary for friction patterns.
 *
 * @param sessionId The Pi session ID to analyze.
 * @param cwd Working directory (defaults to process.cwd()). Summary
 *   files are read from `<cwd>/.myflow/telemetry/sessions/<sessionId>.json`.
 * @returns Array of friction findings (empty array if no summary found).
 */
export function analyzeSession(sessionId: string, cwd: string = process.cwd()): FrictionFinding[] {
	const filePath = join(cwd, SESSIONS_DIR, `${sessionId}.json`);
	if (!existsSync(filePath)) {
		console.warn(`[telemetry/eval] no session summary found for ${sessionId} at ${filePath}`);
		return [];
	}

	let summary: SessionSummary;
	try {
		const raw = readFileSync(filePath, "utf-8");
		summary = JSON.parse(raw) as SessionSummary;
	} catch (e) {
		console.warn(
			`[telemetry/eval] failed to parse session summary for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`,
		);
		return [];
	}

	return runAllDetectors(summary);
}

/**
 * Analyze ALL available session summaries in the sessions directory.
 * Returns a map keyed by sessionId.
 */
export function analyzeAllSessions(cwd: string = process.cwd()): Map<string, FrictionFinding[]> {
	const dir = join(cwd, SESSIONS_DIR);
	if (!existsSync(dir)) return new Map();

	const results = new Map<string, FrictionFinding[]>();
	try {
		const files = readdirSyncSimple(dir);
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			const sessionId = file.slice(0, -".json".length);
			const findings = analyzeSession(sessionId, cwd);
			if (findings.length > 0) results.set(sessionId, findings);
		}
	} catch {
		// directory unreadable — return empty
	}
	return results;
}

function readdirSyncSimple(dir: string): string[] {
	/* c8 ignore next 3 */
	const { readdirSync } = require("node:fs");
	return readdirSync(dir, "utf-8") as string[];
}
