/**
 * core — Pure-orchestrator extension for @myflow/pi.
 *
 * Composes session hooks and the slash commands. All logic lives in the
 * registrar modules; this file is the table of contents.
 *
 * Tool-owning plugins are siblings (see siblings.ts); install via /myflow-setup.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FLAG_DEBUG } from "./constants.js";
import { registerModelOverrideSessionStart } from "./model-override.js";
import { registerModelsConfigValidation } from "./models-config-validate.js";
import { registerRpivModelsCommand } from "./myflow-models/index.js";
import { registerSessionHooks } from "./session-hooks.js";
import { registerSetupCommand } from "./setup-command.js";
import { registerSkillBracket } from "./skill-bracket.js";
import { registerUpdateAgentsCommand } from "./update-agents-command.js";

export default function (pi: ExtensionAPI) {
	pi.registerFlag(FLAG_DEBUG, {
		description: "Show injected guidance and git-context messages",
		type: "boolean",
		default: false,
	});
	// These three register UNCONDITIONALLY and FIRST — they must work on a clean
	// install where the workflow sibling is absent, so the missing-sibling
	// banner and /myflow-setup are what guide the user to install it.
	registerSessionHooks(pi);
	registerUpdateAgentsCommand(pi);
	registerSetupCommand(pi);
	registerRpivModelsCommand(pi); // /myflow-models cascade picker
	// Warn-on-miss: surface models.json record-key typos (skills.committ,
	// presets.shipp) that pass schema validation but silently never apply.
	registerModelsConfigValidation(pi);
	// Standalone /skill: model/effort override bracket. MUST register AFTER
	// registerModelOverrideSessionStart so the bracket's `getCapturedModel()`
	// read at input-arm time sees the populated baseline.
	registerModelOverrideSessionStart(pi);
	registerSkillBracket(pi);
}
