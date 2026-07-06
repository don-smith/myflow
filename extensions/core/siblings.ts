/**
 * Declarative registry of @myflow/pi's sibling Pi plugins.
 *
 * Single source of truth for: presence detection (package-checks.ts),
 * session_start "missing plugins" warning (session-hooks.ts), and
 * /myflow-setup installer (setup-command.ts). Add a sibling here and every
 * consumer picks it up automatically.
 *
 * Detection is filesystem-based via a regex over the active Pi settings file
 * — no runtime import of sibling packages (keeps core pure-orchestrator).
 */

export interface SiblingPlugin {
	/** Install spec passed to `pi install`. Prefixed with `npm:` for Pi's installer. */
	readonly pkg: string;
	/** Case-insensitive regex that matches the package in settings.json. */
	readonly matches: RegExp;
	/** What the sibling provides — shown in /myflow-setup confirmation and reports. */
	readonly provides: string;
}

export const SIBLINGS: readonly SiblingPlugin[] = [
	{
		pkg: "npm:@tintinweb/pi-subagents",
		// Detect both the upstream tintinweb fork and the API-compatible
		// @gotgenes fork; pkg stays upstream so /myflow-setup installs that.
		matches: /@(tintinweb|gotgenes)\/pi-subagents(?![-\w])/i,
		provides: "Agent / get_subagent_result / steer_subagent tools (tintinweb or gotgenes fork)",
	},
	{
		pkg: "npm:@myflow/ask-user-question",
		matches: /ask-user-question/i,
		provides: "ask_user_question tool",
	},
	{
		pkg: "npm:@myflow/todo",
		matches: /todo/i,
		provides: "todo tool + /todos command + overlay widget",
	},
	{
		pkg: "npm:@myflow/advisor",
		matches: /advisor/i,
		provides: "advisor tool + /advisor command",
	},
	{
		pkg: "npm:@myflow/i18n",
		matches: /i18n(?![-\w])/i,
		provides: "i18n SDK for Pi extensions — /languages command + --locale flag + registerStrings/scope/tr API",
	},
	{
		pkg: "npm:@myflow/web-tools",
		matches: /web-tools/i,
		provides: "web_search + web_fetch tools + /web-tools",
	},
	{
		pkg: "npm:@myflow/args",
		matches: /args(?![-\w])/i,
		provides: "skill-argument resolver — substitutes $N/$ARGUMENTS in skill bodies",
	},
];

/**
 * Deprecated sibling packages that `/myflow-setup` actively prunes from
 * the active Pi settings file (so upgraders don't end up with superseded
 * libraries loaded alongside their replacements). Single source of truth
 * for `prune-legacy-siblings.ts`.
 */
export interface LegacyPackage {
	/** Human-readable label used in the prune notify message. */
	readonly label: string;
	/** Case-insensitive regex matched against settings.json `packages[]` entries. */
	readonly matches: RegExp;
	/** Short reason — useful when debugging; not user-facing. */
	readonly reason: string;
}

export const LEGACY_SIBLINGS: readonly LegacyPackage[] = [
	{
		// nicobailon's pi-subagents fork was the SIBLINGS[0] package between
		// @myflow/pi 0.12.0 and 0.13.x. Reverted to @tintinweb/pi-subagents in
		// @myflow/pi 1.0.0 once tintinweb resumed active maintenance and shipped
		// 0.6.x against pi-coding-agent ^0.70.5.
		label: "pi-subagents",
		matches: /(^|[^\w/-])pi-subagents(?![-\w])/i,
		reason: "superseded by @tintinweb/pi-subagents (resumed maintenance) in @myflow/pi 1.0.0",
	},
];
