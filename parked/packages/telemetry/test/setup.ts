import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

// Stub HOME to a fresh tmpdir at module-load — BEFORE any production module is
// imported — so module-level `homedir()` / `configPath()` captures resolve to
// the test home instead of the developer's real `~/.myflow/config/*`.
const TEST_HOME = mkdtempSync(join(tmpdir(), "telemetry-test-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

beforeEach(async () => {
	// Tear down the module-level dispatcher singleton (providers, queue, config
	// cache, failure-dedup state) so each test starts from a clean instance and
	// no in-flight warning state leaks across tests.
	const dispatcher = await import("../dispatcher.js");
	dispatcher.resetTelemetryDispatcher();

	rmSync(join(TEST_HOME, ".myflow", "config", "telemetry"), { recursive: true, force: true });
});
