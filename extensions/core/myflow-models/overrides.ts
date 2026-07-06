/**
 * myflow-models/overrides — Scope descriptor table for models.json override CRUD.
 *
 * Each scope (defaults, agents, skills) is modeled as a
 * ScopeDescriptor with has/get/remove/apply accessors plus an ordered list of
 * keySteps. This eliminates repeated `as Record<string, unknown>` casts and
 * inline four-branch key-picker blocks from the command handler.
 *
 * Key selection is decomposed into one KeyStep per path segment so the cascade
 * stepper can navigate exactly one level up on ESC.
 *
 * Modeled on the Record<X, Meta> descriptor-table pattern (cf.
 * ask-user-question/state/row-intent.ts:72-115).
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";
import type { ModelsConfigSchema, ModelThinkingLevelValue } from "../models-config.js";
import { bundledAgentNames, skillCommandNames } from "../models-config-sources.js";
import { showFilterablePicker } from "../models-picker.js";

// ---------------------------------------------------------------------------
// Scope constants
// ---------------------------------------------------------------------------

export const SCOPE_DEFAULTS = "defaults";
export const SCOPE_AGENTS = "agents";
export const SCOPE_SKILLS = "skills";
export const SCOPE_RESET_ALL = "__reset_all__";

// ---------------------------------------------------------------------------
// Small UI helpers (shared with items.ts and command.ts)
// ---------------------------------------------------------------------------

/** Suffix appended to a picker label to mark "an override is set here". */
export const CHECK = " ✓";

export const withCheck = (label: string, has: boolean): string => (has ? `${label}${CHECK}` : label);

/** Stable partition: ✓-marked items float to the front, original order preserved. */
export function floatChecked(items: SelectItem[]): SelectItem[] {
	const checked = items.filter((i) => i.label.endsWith(CHECK));
	const rest = items.filter((i) => !i.label.endsWith(CHECK));
	return [...checked, ...rest];
}

/** Build key-picker items: ✓-decorate via `has`, then float the marked ones up. */
export function keyItems(names: string[], has: (name: string) => boolean): SelectItem[] {
	return floatChecked(names.map((n) => ({ value: n, label: withCheck(n, has(n)) })));
}

// ---------------------------------------------------------------------------
// ScopeDescriptor interface
// ---------------------------------------------------------------------------

/** Entry shape for applyOverride. */
export interface OverrideEntry {
	model: string;
	thinking?: ModelThinkingLevelValue;
}

/** On-disk override-entry leaf: `string | { model?, thinking? }` (ModelEntrySchema). */
type ModelEntryValue = NonNullable<ModelsConfigSchema["defaults"]>;

/**
 * Codec for the override-entry leaf — the one place its on-disk shape is read or
 * written. An entry is a bare model string when there's no thinking override,
 * else a { model, thinking } object. Every descriptor's applyOverride routes
 * through `encodeEntry`, and every getCurrentKey through `entryModel`.
 */
export function encodeEntry(entry: OverrideEntry): ModelEntryValue {
	return entry.thinking ? { model: entry.model, thinking: entry.thinking } : entry.model;
}

/** Read the model key out of a stored entry (string or { model, thinking }). */
export function entryModel(entry: unknown): string | undefined {
	if (typeof entry === "string") return entry;
	if (entry && typeof entry === "object") return (entry as { model?: string }).model;
	return undefined;
}

/**
 * Outcome of one key-selection sub-step:
 *   - value: the chosen path segment
 *   - back:  user pressed ESC — the stepper moves one level up
 *   - abort: an error was already surfaced via notify — the stepper exits
 */
export type KeyStepResult = { kind: "value"; value: string } | { kind: "back" } | { kind: "abort" };

/**
 * One key-selection sub-step (one path segment). `prior` holds the segments
 * already chosen to the left (e.g. [workflow] when picking a preset stage);
 * `preselect` is the previously-chosen value for this segment, used to
 * re-highlight the row when the user navigates back into the step.
 */
export interface KeyStep {
	run(
		ctx: ExtensionContext,
		raw: ModelsConfigSchema,
		prior: string[],
		pi: ExtensionAPI,
		preselect: string | undefined,
	): Promise<KeyStepResult>;
}

const STEP_BACK: KeyStepResult = { kind: "back" };
/**
 * Contract: every site returning STEP_ABORT MUST have already called
 * `ctx.ui.notify` with the reason. The consumer (keyFrame in command.ts) exits
 * the cascade silently on abort, so an un-notified abort leaves the user with no
 * feedback about why the picker closed.
 */
const STEP_ABORT: KeyStepResult = { kind: "abort" };

/**
 * Show a key-selection picker over `names` (✓-decorated + floated via `has`) and
 * map the result to a KeyStepResult — the shared tail of every key step. ESC →
 * back, since key steps are always inner cascade levels.
 */
async function pickKey(
	ctx: ExtensionContext,
	title: string,
	prose: string,
	names: string[],
	has: (name: string) => boolean,
	preselect: string | undefined,
): Promise<KeyStepResult> {
	const picked = await showFilterablePicker(ctx, {
		title,
		proseLines: [prose],
		items: keyItems(names, has),
		preferredValue: preselect,
		escHint: "back",
	});
	return picked == null ? STEP_BACK : { kind: "value", value: picked };
}



/**
 * Per-scope descriptor: each scope in the models.json taxonomy is modeled as
 * one entry with CRUD + interactive key-picker accessors. This replaces the
 * six functions that each switched on the three-way scope taxonomy.
 */
export interface ScopeDescriptor {
	/** True if the scope holds ≥1 override. */
	hasOverride(raw: ModelsConfigSchema): boolean;
	/** True if a specific key under this scope holds an override. */
	keyHasOverride(raw: ModelsConfigSchema, keyPath: string[]): boolean;
	/** Current override model key for this scope+keyPath, or undefined. */
	getCurrentKey(raw: ModelsConfigSchema, keyPath: string[]): string | undefined;
	/** Strip one override with cascading empty-container cleanup. */
	removeOverride(config: ModelsConfigSchema, keyPath: string[]): { next: ModelsConfigSchema; removed: boolean };
	/** Apply an override entry at the given scope+keyPath. */
	applyOverride(config: ModelsConfigSchema, keyPath: string[], entry: OverrideEntry): ModelsConfigSchema;
	/**
	 * Ordered key-selection sub-steps. Empty for `defaults`; one step for the
	 * flat-map scopes (agents/skills). One step per segment lets the cascade stepper move exactly one
	 * level up on ESC.
	 */
	keySteps: KeyStep[];
}

// ---------------------------------------------------------------------------
// Flat-map descriptor factory (agents, skills)
// ---------------------------------------------------------------------------



/**
 * Factory for the three structurally-identical flat-map scopes. Each accesses
 * `raw[scope]` as a typed optional record — no casts needed since the closure
 * captures the literal scope key. Each takes a single key step (one segment).
 */
function flatMapScope(scope: "agents" | "skills", keyStep: KeyStep): ScopeDescriptor {
	return {
		hasOverride(raw) {
			const map = raw[scope];
			return !!map && Object.keys(map).length > 0;
		},
		keyHasOverride(raw, keyPath) {
			const map = raw[scope];
			return !!map && keyPath[0] in map;
		},
		getCurrentKey(raw, keyPath) {
			return entryModel(raw[scope]?.[keyPath[0]]);
		},
		removeOverride(config, keyPath) {
			const next: ModelsConfigSchema = { ...config };
			const map = next[scope];
			if (!map || !(keyPath[0] in map)) return { next, removed: false };
			const updated = { ...map };
			delete updated[keyPath[0]];
			if (!Object.keys(updated).length) delete next[scope];
			else next[scope] = updated;
			return { next, removed: true };
		},
		applyOverride(config, keyPath, entry) {
			const next: ModelsConfigSchema = { ...config };
			const target = next[scope];
			const updated = { ...(target ?? {}) };
			updated[keyPath[0]] = encodeEntry(entry);
			next[scope] = updated;
			return next;
		},
		keySteps: [keyStep],
	};
}

// ---------------------------------------------------------------------------
// Scope descriptors
// ---------------------------------------------------------------------------

const defaultsDescriptor: ScopeDescriptor = {
	hasOverride(raw) {
		return raw.defaults !== undefined;
	},
	keyHasOverride(raw) {
		return raw.defaults !== undefined;
	},
	getCurrentKey(raw) {
		return entryModel(raw.defaults);
	},
	removeOverride(config) {
		const next: ModelsConfigSchema = { ...config };
		if (next.defaults === undefined) return { next, removed: false };
		delete next.defaults;
		return { next, removed: true };
	},
	applyOverride(config, _keyPath, entry) {
		const next: ModelsConfigSchema = { ...config };
		next.defaults = encodeEntry(entry);
		return next;
	},
	keySteps: [],
};

const agentsDescriptor: ScopeDescriptor = flatMapScope(SCOPE_AGENTS, {
	async run(ctx, raw, _prior, _pi, preselect) {
		const names = bundledAgentNames();
		if (names.length === 0) {
			ctx.ui.notify("No bundled agents found.", "error");
			return STEP_ABORT;
		}
		return pickKey(ctx, "Agent", "Select agent.", names, (n) => agentsDescriptor.keyHasOverride(raw, [n]), preselect);
	},
});



const skillsDescriptor: ScopeDescriptor = flatMapScope(SCOPE_SKILLS, {
	async run(ctx, raw, _prior, pi, preselect) {
		const names = skillCommandNames(pi);
		if (names.length === 0) {
			ctx.ui.notify("No skills registered; install or enable an extension that contributes skills.", "error");
			return STEP_ABORT;
		}
		return pickKey(ctx, "Skill", "Select skill.", names, (n) => skillsDescriptor.keyHasOverride(raw, [n]), preselect);
	},
});



// ---------------------------------------------------------------------------
// SCOPES table
// ---------------------------------------------------------------------------

export const SCOPES: Record<string, ScopeDescriptor> = {
	defaults: defaultsDescriptor,
	agents: agentsDescriptor,
	skills: skillsDescriptor,
};

// ---------------------------------------------------------------------------
// Module-level convenience functions (backward-compatible public surface)
// ---------------------------------------------------------------------------

/**
 * Strip one override with cascading empty-container cleanup. Returns the new
 * config AND whether anything was actually removed — the handler branches its
 * notification on `removed` so a reset chosen on a key with no existing
 * override reports honestly instead of a misleading "Removed".
 */
export function removeOverride(
	config: ModelsConfigSchema,
	scope: string,
	keyPath: string[],
): { next: ModelsConfigSchema; removed: boolean } {
	const descriptor = SCOPES[scope];
	if (!descriptor) return { next: config, removed: false };
	return descriptor.removeOverride(config, keyPath);
}

/**
 * Apply an override entry at the given scope+keyPath.
 * Delegates to the scope's descriptor.
 */
export function applyOverride(
	config: ModelsConfigSchema,
	scope: string,
	keyPath: string[],
	entry: OverrideEntry,
): ModelsConfigSchema {
	const descriptor = SCOPES[scope];
	if (!descriptor) return config;
	return descriptor.applyOverride(config, keyPath, entry);
}
