import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	findUnknownModelKeys,
	getAgentModelConfig,
	invalidateModelsConfigCache,
	loadModelsConfig,
	type ModelsConfig,
} from "./models-config.js";

const TEST_HOME = process.env.HOME!;

describe("models-config", () => {
	describe("loadModelsConfig", () => {
		const configDir = join(TEST_HOME, ".myflow", "config", "@myflow/pi");
		const configFilePath = join(configDir, "models.json");

		beforeEach(() => {
			mkdirSync(configDir, { recursive: true });
			try { rmSync(configFilePath); } catch { /* ok */ }
			invalidateModelsConfigCache();
		});

		afterEach(() => {
			try { rmSync(configFilePath); } catch { /* ok */ }
		});

		it("returns empty config for missing file", () => {
			expect(loadModelsConfig()).toEqual({});
		});

		it("returns empty config for malformed JSON", () => {
			writeFileSync(configFilePath, "not json", "utf-8");
			expect(loadModelsConfig()).toEqual({});
		});

		it("returns empty config for null default (valid JSON, empty override)", () => {
			writeFileSync(configFilePath, JSON.stringify({ defaults: null }), "utf-8");
			const config = loadModelsConfig();
			expect(config.defaults).toBeUndefined();
		});

		it("resolves defaults from JSON", () => {
			writeFileSync(configFilePath, JSON.stringify({ defaults: "anthropic/opus" }), "utf-8");
			const config = loadModelsConfig();
			expect(config.defaults).toEqual({ model: "anthropic/opus" });
		});

		it("resolves defaults from JSON object form", () => {
			writeFileSync(configFilePath, JSON.stringify({ defaults: { model: "anthropic/opus", thinking: "high" } }), "utf-8");
			const config = loadModelsConfig();
			expect(config.defaults).toEqual({ model: "anthropic/opus", thinking: "high" });
		});

		it("defaults cascade into agent entries", () => {
			writeFileSync(configFilePath, JSON.stringify({
				defaults: { model: "anthropic/opus", thinking: "low" },
				agents: { research: "openai/gpt-5.5" },
			}), "utf-8");
			const config = loadModelsConfig();
			expect(config.agents!.research).toEqual({ model: "openai/gpt-5.5", thinking: "low" });
		});

		it("loads skills alongside agents", () => {
			writeFileSync(configFilePath, JSON.stringify({
				agents: { coder: "zai/glm-4-7" },
				skills: { commit: "anthropic/opus" },
			}), "utf-8");
			const config = loadModelsConfig();
			expect(config.agents!.coder).toEqual({ model: "zai/glm-4-7" });
			expect(config.skills!.commit).toEqual({ model: "anthropic/opus" });
		});

		it("falls back to defaults when a per-agent key has no model", () => {
			writeFileSync(configFilePath, JSON.stringify({
				defaults: { model: "anthropic/opus", thinking: "low" },
				agents: { coder: { thinking: "high" } },
			}), "utf-8");
			const config = loadModelsConfig();
			expect(config.agents!.coder).toEqual({ model: "anthropic/opus", thinking: "high" });
		});

		it("agent field overrides the defaults cascade", () => {
			writeFileSync(configFilePath, JSON.stringify({
				defaults: { model: "zai/glm-4-7", thinking: "low" },
				agents: { coder: { model: "anthropic/opus", thinking: "high" } },
			}), "utf-8");
			const config = loadModelsConfig();
			expect(config.agents!.coder).toEqual({ model: "anthropic/opus", thinking: "high" });
		});

		it("caches after first load", () => {
			writeFileSync(configFilePath, JSON.stringify({ defaults: "anthropic/opus" }), "utf-8");
			const first = loadModelsConfig();
			expect(first.defaults).toEqual({ model: "anthropic/opus" });
			// Overwrite the file behind our back
			writeFileSync(configFilePath, JSON.stringify({ defaults: "openai/gpt-5.5" }), "utf-8");
			// Without invalidation, the cache still returns the first value
			const second = loadModelsConfig();
			expect(second.defaults).toEqual({ model: "anthropic/opus" });
		});

		it("invalidates cache", () => {
			writeFileSync(configFilePath, JSON.stringify({ defaults: "anthropic/opus" }), "utf-8");
			const first = loadModelsConfig();
			expect(first.defaults).toEqual({ model: "anthropic/opus" });
			writeFileSync(configFilePath, JSON.stringify({ defaults: "openai/gpt-5.5" }), "utf-8");
			invalidateModelsConfigCache();
			const second = loadModelsConfig();
			expect(second.defaults).toEqual({ model: "openai/gpt-5.5" });
		});

		it("warns on unknown thinking level but still returns the config", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			writeFileSync(configFilePath, JSON.stringify({
				defaults: { model: "anthropic/opus", thinking: "turbo" as string },
			}), "utf-8");
			const config = loadModelsConfig();
			expect(config.defaults).toEqual({ model: "anthropic/opus" });
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("unknown thinking level"),
			);
			warnSpy.mockRestore();
		});
	});

	describe("getAgentModelConfig", () => {
		it("returns per-agent config when present", () => {
			const config: ModelsConfig = { agents: { coder: { model: "openai/gpt-5.5" } } };
			expect(getAgentModelConfig(config, "coder")).toEqual({ model: "openai/gpt-5.5" });
		});

		it("returns defaults when agent has no explicit config", () => {
			const config: ModelsConfig = { defaults: { model: "anthropic/opus" }, agents: {} };
			expect(getAgentModelConfig(config, "coder")).toEqual({ model: "anthropic/opus" });
		});

		it("returns undefined when neither agent nor defaults are configured", () => {
			expect(getAgentModelConfig({}, "coder")).toBeUndefined();
		});
	});

	describe("findUnknownModelKeys", () => {
		it("returns empty when no unknown keys exist", () => {
			const config: ModelsConfig = { agents: { coder: { model: "x/y" } }, skills: { commit: { model: "x/y" } } };
			const known = { agents: ["coder"], skills: ["commit"] };
			expect(findUnknownModelKeys(config, known)).toEqual([]);
		});

		it("detects unknown agent and skill keys", async () => {
			const { findUnknownModelKeys } = await import("./models-config.js");
			const config: ModelsConfig = {
				agents: { "codebase-analzyer": { model: "x/y" } },
				skills: { committ: { model: "x/y" } },
			};
			const known = { agents: ["codebase-analyzer"], skills: ["commit"] };
			const unknown = findUnknownModelKeys(config, known);
			expect(unknown).toContain("agents.codebase-analzyer");
			expect(unknown).toContain("skills.committ");
		});

		it("skips unknown-key check when the known list is undefined for an axis", () => {
			const config: ModelsConfig = { agents: { anything: { model: "a/b" } } };
			// No `agents` provided -> that axis is not validated.
			expect(findUnknownModelKeys(config, { skills: ["commit"] })).toEqual([]);
		});
	});
});