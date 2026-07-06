import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { findMissingSiblings } from "./package-checks.js";
import { SIBLINGS } from "./siblings.js";
import { getPiAgentSettingsPath } from "./utils.js";

/** Write settings to a temp directory and return its path. */
function writeSettingsTo(contents: unknown, td?: string): string {
	const dir = td ?? join(tmpdir(), "pi-test", `pkg-check-${Date.now()}`);
	const settingsPath = join(dir, "settings.json");
	mkdirSync(dir, { recursive: true });
	writeFileSync(settingsPath, JSON.stringify(contents), "utf-8");
	return dir; // settingsDir = parent of settings.json
}

describe("findMissingSiblings", () => {
	it("returns all 7 siblings when settings.json is missing", () => {
		const dir = join(tmpdir(), "pi-test", `no-settings-${Date.now()}`);
		// dir exists but has no settings.json — readPiAgentSettings returns undefined
		mkdirSync(dir, { recursive: true });
		expect(findMissingSiblings(dir)).toHaveLength(SIBLINGS.length);
	});

	it("returns all 7 siblings when JSON is invalid", () => {
		const dir = join(tmpdir(), "pi-test", `bad-json-${Date.now()}`);
		const settingsPath = join(dir, "settings.json");
		mkdirSync(dir, { recursive: true });
		writeFileSync(settingsPath, "{not json", "utf-8");
		expect(findMissingSiblings(dir)).toHaveLength(SIBLINGS.length);
	});

	it("returns all 7 siblings when packages field is absent", () => {
		const dir = writeSettingsTo({ other: "data" });
		expect(findMissingSiblings(dir)).toHaveLength(SIBLINGS.length);
	});

	it("returns all 7 siblings when packages is not an array", () => {
		const dir = writeSettingsTo({ packages: "not-array" });
		expect(findMissingSiblings(dir)).toHaveLength(SIBLINGS.length);
	});

	it("filters out non-string entries defensively", () => {
		const dir = writeSettingsTo({ packages: [null, 42, "@myflow/todo"] });
		const missing = findMissingSiblings(dir);
		expect(missing.find((s) => s.matches.test("@myflow/todo"))).toBeUndefined();
	});

	it("matches case-insensitively", () => {
		const dir = writeSettingsTo({ packages: ["@JUICESHARP/RPIV-TODO"] });
		const missing = findMissingSiblings(dir);
		expect(missing.find((s) => s.matches.test("@myflow/todo"))).toBeUndefined();
	});

	it("args word-boundary: treats args-extended as non-install", () => {
		const dir = writeSettingsTo({ packages: ["@myflow/args-extended"] });
		const missing = findMissingSiblings(dir);
		expect(missing.find((s) => s.pkg.endsWith("/args"))).toBeDefined();
	});

	it("returns [] when all 7 siblings are installed via npm entries", () => {
		const dir = writeSettingsTo({
			packages: SIBLINGS.map((s) => s.pkg.replace(/^npm:/, "")),
		});
		expect(findMissingSiblings(dir)).toEqual([]);
	});

	it("returns [] when a local package manifest covers all 7 siblings", () => {
		// Simulate a monorepo: one local package whose pi.extensions lists all
		// sibling packages.
		const dir = join(tmpdir(), "pi-test", `monorepo-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		// Write settings.json referencing a sibling root at ./myflow
		writeFileSync(
			join(dir, "settings.json"),
			JSON.stringify({ packages: ["./myflow"] }),
			"utf-8",
		);
		// Create the local package with a manifest covering all siblings
		const pkgDir = join(dir, "myflow");
		mkdirSync(pkgDir, { recursive: true });
		writeFileSync(
			join(pkgDir, "package.json"),
			JSON.stringify({
				name: "myflow",
				pi: {
					extensions: [
						"./packages/todo/index.ts",
						"./packages/advisor/index.ts",
						"./packages/i18n/index.ts",
						"./packages/web-tools/index.ts",
						"./packages/args/index.ts",
							"./packages/ask-user-question/index.ts",
					],
				},
			}),
			"utf-8",
		);
		// @tintinweb/pi-subagents is a third-party package; the root monorepo
		// manifest covers only the @myflow/* siblings. Subagents stays separate.
		const missing = findMissingSiblings(dir);
		expect(missing).toHaveLength(1);
		expect(missing[0].pkg).toBe("npm:@tintinweb/pi-subagents");
	});

	it("reads settings from PI_CODING_AGENT_DIR when configured, with temp override", () => {
		process.env.PI_CODING_AGENT_DIR = join(process.env.HOME!, ".config", "pi", "agent");
		const dir = writeSettingsTo({
			packages: SIBLINGS.map((s) => s.pkg.replace(/^npm:/, "")),
		});
		// Passing settingsDir explicitly overrides getPiAgentSettingsPath
		expect(findMissingSiblings(dir)).toEqual([]);
	});
});