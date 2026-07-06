/**
 * model-override — Session-start model capture and standalone skill-bracket support.
 *
 * Captures modelRegistry + current model at session_start for use by the
 * skill-bracket (standalone `/skill:<name>` model override).
 *
 * Workflow lifecycle model override has been removed (Stage 3 refresh).
 * Only the session_start capture and the shared apply/restore helpers remain.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseModelKey } from "@myflow/config";
import { type ModelThinkingLevelValue } from "./models-config.js";
import { isStaleCtxError } from "./utils.js";

/** First parameter type of pi.setModel() — avoids importing Pi's Model<Api> generic. */
export type CapturedModel = Parameters<ExtensionAPI["setModel"]>[0];

// ---------------------------------------------------------------------------
// Shared types — used by both the workflow path and the skill-bracket path.
// ---------------------------------------------------------------------------

/**
 * Baseline snapshot captured at the start of an override scope (workflow or
 * skill bracket). Restored at scope end. `hasModelChange` tracks whether a
 * non-baseline override model was resolved and setModel was called — when
 * false, `restoreBaseline` skips the `setModel` call (avoiding an unnecessary
 * disk write for thinking-only overrides). `setModel` persists to the on-disk
 * settings file, so restoring is MANDATORY when a model change was applied.
 */
export interface BaselineSnapshot {
	thinking: ModelThinkingLevelValue;
	model: CapturedModel | undefined;
	hasModelChange: boolean;
}

// ---------------------------------------------------------------------------
// Module-level state — captured from session_start, used by skill bracket.
// Reset by __resetModelOverrideState() in test/setup.ts.
// ---------------------------------------------------------------------------

/** Captured modelRegistry from session_start ExtensionContext. */
let capturedModelRegistry: { find(provider: string, modelId: string): unknown } | undefined;

/**
 * Current model captured from session_start ExtensionContext.model.
 */
let capturedModel: CapturedModel | undefined;

/**
 * Baseline snapshot — set at workflow start, restored at workflow end.
 * Captures BOTH thinking and model: setModel persists to the on-disk settings
 * file (runtime-confirmed), so failing to restore the model permanently
 * rewrites the user's global default.
 */
let baseline: BaselineSnapshot | undefined;
let baselineCaptured = false;

/** Test reset — wired into test/setup.ts beforeEach. */
export function __resetModelOverrideState(): void {
	capturedModelRegistry = undefined;
	capturedModel = undefined;
}

// ---------------------------------------------------------------------------
// session_start hook — capture modelRegistry from ExtensionContext.
// ExtensionContext (unlike LifecycleContext) has modelRegistry.
// This hook runs on every session_start, refreshing the captured reference.
// ---------------------------------------------------------------------------

export function registerModelOverrideSessionStart(pi: ExtensionAPI): void {
	pi.on(
		"session_start",
		async (_event: unknown, ctx: { modelRegistry?: typeof capturedModelRegistry; model?: CapturedModel }) => {
			if (ctx.modelRegistry) {
				capturedModelRegistry = ctx.modelRegistry;
			}
			if (ctx.model !== undefined) {
				capturedModel = ctx.model;
			}
		},
	);
}

// ---------------------------------------------------------------------------
// Model resolution — uses captured modelRegistry, not lifecycle context.
// ---------------------------------------------------------------------------

/** Resolve model string to Model object via captured modelRegistry. */
export function resolveModel(modelStr?: string): CapturedModel | undefined {
	if (!modelStr || !capturedModelRegistry) return undefined;
	const parsed = parseModelKey(modelStr);
	if (!parsed) return undefined;
	return capturedModelRegistry.find(parsed.provider, parsed.modelId) as CapturedModel | undefined;
}



/**
 * Run pi model/thinking mutations, swallowing ONLY the stale-ctx error pi-core
 * throws when the captured session was replaced/disposed mid-run (e.g.
 * auto-compaction disposing the runner while a stage is in flight). Once the
 * session is gone the override is moot — the replacement session_start rebuilds
 * state — so there is nothing to apply. Any OTHER error (bad model key,
 * setModel rejected, real plumbing bug) is genuine and must propagate so the
 * lifecycle dispatcher surfaces it to the user.
 */
export async function applyOrSkipIfStale(fn: () => void | Promise<void>): Promise<void> {
	try {
		await fn();
	} catch (e) {
		if (!isStaleCtxError(e)) throw e;
	}
}

// ---------------------------------------------------------------------------
// Shared apply/restore helpers — consumed by both override paths.
// ---------------------------------------------------------------------------

interface ApplyEffectiveModelOpts {
	/** Canonical "provider/modelId" string from config override. Resolved internally via registry. */
	overrideModel: string | undefined;
	/** Already-resolved baseline Model object from session_start capture. */
	baselineModel: CapturedModel | undefined;
	/** Override thinking level from config. `undefined` = no override, use baseline. */
	overrideThinking: ModelThinkingLevelValue | undefined;
	/** Baseline thinking level captured at scope start. */
	baselineThinking: ModelThinkingLevelValue;
	/** Human-readable label for warning messages (e.g. `stage "plan"` or `/skill:commit`). */
	label: string;
	/**
	 * When true (workflow path): on override-miss, re-apply baseline model via setModel
	 * to enforce the no-bleedthrough invariant (unconfigured items revert to baseline,
	 * not the previous stage's override). When false (bracket path): on override-miss,
	 * skip setModel entirely (one-shot arm, nothing to undo).
	 */
	setBaselineModel: boolean;
}

/**
 * Apply an effective model + thinking override. Resolves the override model
 * string via the captured registry, composes against the baseline, and applies
 * via `pi.setModel` + `pi.setThinkingLevel`.
 *
 * Returns `{ hasModelChange: boolean }` — true when a non-baseline override
 * model was resolved in the registry and `setModel` was called (regardless of
 * `setModel`'s boolean return — even on soft-fail, the caller should track
 * that an override was attempted so the restore path mirrors the apply).
 * Baseline-fallback applies (when `setBaselineModel=true`) do NOT set
 * `hasModelChange=true`.
 *
 * Soft-fails (warns, proceeds) when:
 *   - override model string fails registry resolution → uses baseline
 *   - `setModel` returns false (e.g. missing API key) → proceeds on current
 */
export async function applyEffectiveModel(
	pi: ExtensionAPI,
	opts: ApplyEffectiveModelOpts,
): Promise<{ hasModelChange: boolean }> {
	let hasModelChange = false;

	if (opts.overrideModel !== undefined) {
		const resolved = resolveModel(opts.overrideModel);
		if (resolved) {
			const ok = await pi.setModel(resolved);
			if (!ok) {
				console.warn(`[@myflow/pi] setModel failed for ${opts.label} (no API key?) — proceeding on current model`);
			}
			hasModelChange = true;
		} else {
			console.warn(`[@myflow/pi] model not found: ${opts.overrideModel} (${opts.label}) — using baseline model`);
		}
	}

	// When no override model resolved: either re-apply baseline (workflow: D7
	// no-bleedthrough) or skip setModel entirely (bracket: one-shot arm).
	if (!hasModelChange && opts.setBaselineModel && opts.baselineModel !== undefined) {
		const ok = await pi.setModel(opts.baselineModel);
		if (!ok) {
			console.warn(`[@myflow/pi] setModel failed for ${opts.label} (no API key?) — proceeding on current model`);
		}
	}

	pi.setThinkingLevel(opts.overrideThinking ?? opts.baselineThinking);

	return { hasModelChange };
}

/**
 * Restore the baseline model + thinking at the end of an override scope.
 * Skips `setModel` when `base.hasModelChange === false` — pi.setModel persists
 * to the on-disk settings file even when called with the same value, so the
 * skip avoids an unnecessary disk write for thinking-only overrides.
 * Always restores thinking level.
 * Soft-fails (warns, proceeds) when `setModel` returns false.
 */
export async function restoreBaseline(pi: ExtensionAPI, base: BaselineSnapshot): Promise<void> {
	if (base.hasModelChange && base.model !== undefined) {
		const ok = await pi.setModel(base.model);
		if (!ok) {
			console.warn("[@myflow/pi] failed to restore baseline model — proceeding on current model");
		}
	}
	pi.setThinkingLevel(base.thinking);
}

/** Return the captured baseline model from session_start, used by the standalone-skill bracket. */
export function getCapturedModel(): CapturedModel | undefined {
	return capturedModel;
}
