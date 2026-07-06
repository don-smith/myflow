import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./models-config-sources.js", () => ({
	bundledAgentNames: vi.fn(() => ["codebase-analyzer"]),
	skillCommandNames: vi.fn(() => ["commit"]),
}));

import { registerModelsConfigValidation } from "./models-config-validate.js";

function writeModels(config: unknown) {
	const dir = join(process.env.HOME!, ".myflow", "config", "@myflow/pi");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "models.json"), JSON.stringify(config), "utf-8");
}

function makePi() {
	let handler: ((event: unknown, ctx: unknown) => unknown) | undefined;
	const pi = {
		on: vi.fn((event: string, h: (...args: unknown[]) => unknown) => {
			if (event === "session_start") handler = h;
		}),
	} as unknown as ExtensionAPI;
	return { pi, fire: (ctx: unknown = { cwd: "/tmp" }) => handler?.({}, ctx) };
}

describe("models-config-validate", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		// Invalidate config cache
		const { invalidateModelsConfigCache } = require("./models-config.js");
		invalidateModelsConfigCache();
		const { __resetModelsConfigValidation } = require("./models-config-validate.js");
		__resetModelsConfigValidation();
	});

	it("warns on unknown agent key typo", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		writeModels({ agents: { "codebase-analzyer": "a/b" } });
		await fire();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("agents.codebase-analzyer"));
		warn.mockRestore();
	});

	it("warns on unknown skill key typo", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		writeModels({ skills: { committ: "a/b" } });
		await fire();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("skills.committ"));
		warn.mockRestore();
	});

	it("does not warn when only valid keys exist", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		writeModels({ agents: { "codebase-analyzer": "a/b" }, skills: { commit: "a/b" } });
		await fire();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("does not fail when models.json is absent", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		await fire();
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("only warns once per process (warned latch)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { pi, fire } = makePi();
		registerModelsConfigValidation(pi);
		writeModels({ agents: { "codebase-analzyer": "a/b" } });
		await fire();
		expect(warn).toHaveBeenCalledTimes(1);
		await fire();
		// Second fire should NOT warn again (latch)
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});