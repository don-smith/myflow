import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

// Stub HOME to a fresh tmpdir at module-load — BEFORE any production module is
// imported — so module-level `configPath()` captures resolve to the test home
// instead of the developer's real `~/.myflow/config/*`.
const TEST_HOME = mkdtempSync(join(tmpdir(), "web-tools-test-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

beforeEach(async () => {
	// Reset the module-level interceptor registry and clean the persisted config
	// so each test starts with built-in defaults (otherwise a test that saves a
	// custom guidance config leaks into "uses built-in defaults" assertions).
	const interceptors = await import("../providers/interceptors/index.js");
	interceptors.__resetWebToolsInterceptors();

	rmSync(join(TEST_HOME, ".myflow", "config", "web-tools"), { recursive: true, force: true });
});
