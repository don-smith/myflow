/**
 * models-config-sources — shared key-universe gatherers for the models.json
 * surfaces. Used by the /myflow-models picker (to populate pickers) and the
 * session_start warn-on-miss validator (to detect typo'd keys).
 *
 *   - bundledAgentNames(): agent keys      ← BUNDLED_AGENTS_DIR readdir
 *   - skillCommandNames(pi): skill keys    ← pi.getCommands() source==="skill"
 */

import { readdirSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BUNDLED_AGENTS_DIR } from "./paths.js";

/** Bundled-agent names (filenames sans `.md`), sorted. `[]` if the dir is unreadable. */
export function bundledAgentNames(): string[] {
	try {
		return readdirSync(BUNDLED_AGENTS_DIR)
			.filter((f) => f.endsWith(".md"))
			.map((f) => f.slice(0, -3))
			.sort();
	} catch {
		return [];
	}
}

/** Registered skill names (post `skill:` prefix strip), sorted — live registry. */
export function skillCommandNames(pi: ExtensionAPI): string[] {
	return pi
		.getCommands()
		.filter((c: { source?: string }) => c.source === "skill")
		.map((c: { name: string }) => (c.name.startsWith("skill:") ? c.name.slice("skill:".length) : c.name))
		.sort();
}


