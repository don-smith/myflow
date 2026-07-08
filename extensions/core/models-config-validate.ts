/**
 * models-config-validate — session_start warn-on-miss for models.json keys.
 *
 * Record-key typos (`skills.committ`, `agents.codebase-analzyer`)
 * pass TypeBox validation (records are structurally dynamic)
 * and silently fall through to the defaults cascade — the override the user
 * meant to set just never applies, with no feedback. This hook surfaces them
 * once per process via `console.warn`.
 *
 * Axes whose key universe can't be determined are SKIPPED, never false-warned:
 *   - agents / skills — always knowable (readdir / pi.getCommands).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findUnknownModelKeys, type KnownModelKeys, loadModelsConfig } from "./models-config.js";
import { bundledAgentNames, skillCommandNames } from "./models-config-sources.js";

/** Warn once per process — sub-session spawns re-fire session_start, but the
 * config is process-cached and the typo set is identical, so repeat warnings
 * are pure noise. Reset by __resetModelsConfigValidation() in test/setup.ts. */
let warned = false;

/** Test reset — wired into test/setup.ts beforeEach. */
export function __resetModelsConfigValidation(): void {
	warned = false;
}

export function registerModelsConfigValidation(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event: unknown, ctx: { cwd?: string }) => {
		if (warned) return;

		const config = loadModelsConfig();
		// Nothing configured on a record axis → nothing to validate.
		if (!config.agents && !config.skills) return;

		const known: KnownModelKeys = {
			agents: bundledAgentNames(),
			skills: skillCommandNames(pi),
		};

		const unknown = findUnknownModelKeys(config, known);
		if (unknown.length === 0) return;

		warned = true;
		for (const key of unknown) {
			console.warn(
				`[@myflow/pi] models.json: unknown key "${key}" — override will not apply (typo, or renamed agent/skill/stage?)`,
			);
		}
	});
}
