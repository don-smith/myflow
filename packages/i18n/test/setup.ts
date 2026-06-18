import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

// Stub HOME to a fresh tmpdir at module-load — BEFORE any production module is
// imported — so module-level `homedir()` / `configPath()` captures resolve to
// the test home instead of the developer's real `~/.myflow/config/*`.
const TEST_HOME = mkdtempSync(join(tmpdir(), "i18n-test-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

beforeEach(async () => {
	// Reset the module-level locale singleton and clean locale.json so each test
	// starts with no persisted config (otherwise saveLocaleConfig() from one
	// test leaks into config-absent assertions in later tests).
	const i18n = await import("../i18n.js");
	i18n.__resetState();

	rmSync(join(TEST_HOME, ".myflow", "config", "i18n"), { recursive: true, force: true });
});
