// ---------------------------------------------------------------------------
// Close integration — runs the friction reducer and routes high-confidence
// findings to the personal repo tabled file (epiphany-tabling convention).
//
// Intended to be invoked as part of the Stage 5 Close process
// (`/skill:close`). The function is a no-op when no findings are produced
// or when the tabled file cannot be resolved.
// ---------------------------------------------------------------------------

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { analyzeSession } from "./reducer.js";
import type { FrictionFinding } from "./types.js";

/**
 * Resolve the path to the personal repo tabled file using the repo-store
 * CLI convention. Falls back to undefined when resolution fails (e.g.
 * not in a git repo or repo-store not available).
 */
function resolveTabledPath(): string | undefined {
	try {
		const storeScript = findRepoStoreScript();
		if (!storeScript) return undefined;
		const out = execFileSync("node", [storeScript, "state", "tabled"], {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		return out || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Find the repo-store.mjs script relative to the installed myflow package.
 * Tries known locations.
 */
function findRepoStoreScript(): string | undefined {
	const candidates = [
		// Relative to cwd (dev workflow)
		join(process.cwd(), "skills/_shared/repo-store.mjs"),
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return undefined;
}

/**
 * Format a friction finding as a tabled entry bullet.
 */
function formatTabledEntry(finding: FrictionFinding): string {
	const lines: string[] = [];
	lines.push(`- **${finding.type.replace(/_/g, " ")} (${finding.severity})** — ${finding.description}`);
	return lines.join("\n");
}

/**
 * Run friction analysis for a session and route medium/high-confidence
 * findings to the personal repo tabled file.
 *
 * @param sessionId The Pi session ID to analyze.
 * @param cwd Working directory (defaults to process.cwd()).
 * @returns Number of findings routed (0 if none or tabled file unavailable).
 */
export function reportFrictionFindings(sessionId: string, cwd: string = process.cwd()): number {
	const findings = analyzeSession(sessionId, cwd);
	if (findings.length === 0) return 0;

	// Only route medium and high severity findings
	const actionable = findings.filter((f) => f.severity !== "low");
	if (actionable.length === 0) return 0;

	const tabledPath = resolveTabledPath();
	if (!tabledPath) {
		console.warn("[telemetry/eval] cannot resolve tabled file path — findings not persisted");
		return actionable.length;
	}

	try {
		mkdirSync(dirname(tabledPath), { recursive: true });
	} catch {
		// directory may already exist
	}

	const header = `\n## ${new Date().toISOString().split("T")[0]} — Friction findings (session: ${sessionId.slice(0, 12)}...)`;
	const entries = actionable.map(formatTabledEntry).join("\n");

	try {
		appendFileSync(tabledPath, `${header}\n${entries}\n`, "utf-8");
	} catch (e) {
		console.warn(
			`[telemetry/eval] failed to append to tabled file: ${e instanceof Error ? e.message : String(e)}`,
		);
		return actionable.length;
	}

	return actionable.length;
}
