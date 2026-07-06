import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	__resetModelOverrideState,
	registerModelOverrideSessionStart,
} from "./model-override.js";

function writeModels(config: unknown): void {
	const dir = join(process.env.HOME!, ".myflow", "config", "@myflow/pi");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "models.json"), JSON.stringify(config), "utf-8");
}

type SessionStartHandler = (ev: unknown, ctx: unknown) => unknown | Promise<unknown>;

interface FakePi {
	pi: ExtensionAPI;
	setModel: ReturnType<typeof vi.fn>;
	setThinkingLevel: ReturnType<typeof vi.fn>;
	sessionStart: () => SessionStartHandler | undefined;
}

/** Minimal ExtensionAPI stub exposing only the methods model-override touches. */
function makePi(opts: { setModelResult?: boolean; baselineThinking?: string } = {}): FakePi {
	let handler: SessionStartHandler | undefined;
	const setModel = vi.fn(async () => opts.setModelResult ?? true);
	const setThinkingLevel = vi.fn();
	const pi = {
		on: vi.fn((event: string, h: SessionStartHandler) => {
			if (event === "session_start") handler = h;
		}),
		setModel,
		setThinkingLevel,
		getThinkingLevel: vi.fn(() => opts.baselineThinking ?? "medium"),
	} as unknown as ExtensionAPI;
	return { pi, setModel, setThinkingLevel, sessionStart: () => handler };
}

/** A resolved baseline Model object as captured from session_start. */
const BASELINE_MODEL = { provider: "anthropic", id: "baseline" };

describe("model-override", () => {
	beforeEach(() => {
		__resetModelOverrideState();
	});

	describe("session_start capture", () => {
		it("captures modelRegistry and model from session_start context", () => {
			const { pi, setModel } = makePi();
			registerModelOverrideSessionStart(pi);

			const handler = pi.on.mock.calls.find((c: unknown[]) => c[0] === "session_start")?.[1] as
				| SessionStartHandler
				| undefined;
			expect(handler).toBeDefined();
		});

		it("captures model from session_start ctx", async () => {
			const { pi } = makePi();
			registerModelOverrideSessionStart(pi);
			const handler = pi.on.mock.calls.find((c: unknown[]) => c[0] === "session_start")?.[1] as
				| SessionStartHandler
				| undefined;
			await handler?.({}, { model: BASELINE_MODEL, modelRegistry: {} });
		});
	});

	describe("applyEffectiveModel", () => {
		it("applies model and thinking override", async () => {
			const { pi, setModel, setThinkingLevel } = makePi();
			const { applyEffectiveModel } = await import("./model-override.js");

			// Register session start to capture modelRegistry for resolveModel
			registerModelOverrideSessionStart(pi);
			const handler = pi.on.mock.calls.find((c: unknown[]) => c[0] === "session_start")?.[1] as
				| SessionStartHandler
				| undefined;
			const registry = { find: vi.fn((p: string, m: string) => ({ provider: p, id: m })) };
			await handler?.({}, { model: BASELINE_MODEL, modelRegistry: registry });

			const result = await applyEffectiveModel(pi, {
				overrideModel: "openai/gpt-4",
				baselineModel: BASELINE_MODEL,
				overrideThinking: "high",
				baselineThinking: "medium",
				label: 'stage "plan"',
				setBaselineModel: true,
			});

			expect(result.hasModelChange).toBe(true);
			expect(setModel).toHaveBeenCalled();
			expect(setThinkingLevel).toHaveBeenCalledWith("high");
		});

		it("falls back to baseline model when overrideModel is undefined and setBaselineModel=true", async () => {
			const { pi, setModel, setThinkingLevel } = makePi();
			const { applyEffectiveModel } = await import("./model-override.js");

			const result = await applyEffectiveModel(pi, {
				overrideModel: undefined,
				baselineModel: BASELINE_MODEL,
				overrideThinking: undefined,
				baselineThinking: "medium",
				label: 'stage "plan"',
				setBaselineModel: true,
			});

			expect(result.hasModelChange).toBe(false);
			expect(setModel).toHaveBeenCalledWith(BASELINE_MODEL);
			expect(setThinkingLevel).toHaveBeenCalledWith("medium");
		});

		it("skips setModel when override is absent and setBaselineModel=false (bracket path)", async () => {
			const { pi, setModel, setThinkingLevel } = makePi();
			const { applyEffectiveModel } = await import("./model-override.js");

			const result = await applyEffectiveModel(pi, {
				overrideModel: undefined,
				baselineModel: BASELINE_MODEL,
				overrideThinking: undefined,
				baselineThinking: "medium",
				label: "/skill:commit",
				setBaselineModel: false,
			});

			expect(result.hasModelChange).toBe(false);
			expect(setModel).not.toHaveBeenCalled();
			expect(setThinkingLevel).toHaveBeenCalledWith("medium");
		});
	});

	describe("restoreBaseline", () => {
		it("restores baseline model + thinking", async () => {
			const { pi, setModel, setThinkingLevel } = makePi();
			const { restoreBaseline } = await import("./model-override.js");

			await restoreBaseline(pi, {
				thinking: "medium",
				model: BASELINE_MODEL,
				hasModelChange: true,
			});

			expect(setModel).toHaveBeenCalledWith(BASELINE_MODEL);
			expect(setThinkingLevel).toHaveBeenCalledWith("medium");
		});

		it("skips setModel when hasModelChange=false", async () => {
			const { pi, setModel, setThinkingLevel } = makePi();
			const { restoreBaseline } = await import("./model-override.js");

			await restoreBaseline(pi, {
				thinking: "medium",
				model: BASELINE_MODEL,
				hasModelChange: false,
			});

			expect(setModel).not.toHaveBeenCalled();
			expect(setThinkingLevel).toHaveBeenCalledWith("medium");
		});
	});

	describe("resolveModel", () => {
		it("resolves a model string via captured modelRegistry", async () => {
			const { pi } = makePi();
			registerModelOverrideSessionStart(pi);
			const handler = pi.on.mock.calls.find((c: unknown[]) => c[0] === "session_start")?.[1] as
				| SessionStartHandler
				| undefined;
			const registry = { find: vi.fn(() => BASELINE_MODEL) };
			await handler?.({}, { model: BASELINE_MODEL, modelRegistry: registry });

			const { resolveModel } = await import("./model-override.js");
			const result = resolveModel("anthropic/baseline");
			expect(result).toBe(BASELINE_MODEL);
			expect(registry.find).toHaveBeenCalledWith("anthropic", "baseline");
		});

		it("returns undefined when no modelRegistry is captured", async () => {
			const { resolveModel } = await import("./model-override.js");
			expect(resolveModel("anthropic/baseline")).toBeUndefined();
		});
	});

	describe("getCapturedModel", () => {
		it("returns the captured model after session_start", async () => {
			const { pi } = makePi();
			registerModelOverrideSessionStart(pi);
			const handler = pi.on.mock.calls.find((c: unknown[]) => c[0] === "session_start")?.[1] as
				| SessionStartHandler
				| undefined;
			await handler?.({}, { model: BASELINE_MODEL, modelRegistry: {} });

			const { getCapturedModel } = await import("./model-override.js");
			expect(getCapturedModel()).toBe(BASELINE_MODEL);
		});

		it("returns undefined before session_start fires", async () => {
			const { getCapturedModel } = await import("./model-override.js");
			expect(getCapturedModel()).toBeUndefined();
		});
	});
});