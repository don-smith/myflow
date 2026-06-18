import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

// Stub HOME to a fresh tmpdir at module-load — BEFORE any production module is
// imported — so module-level `homedir()` / `configPath()` captures resolve to
// the test home instead of the developer's real `~/.myflow/config/*`.
const TEST_HOME = mkdtempSync(join(tmpdir(), "voice-test-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

beforeEach(async () => {
	// Reset the module-level singleton and clean voice.json + errors.log so each
	// test starts with no config/log file present.
	const voiceConfig = await import("../config/voice-config.js");
	voiceConfig.__resetState();

	rmSync(join(TEST_HOME, ".myflow", "config", "voice"), { recursive: true, force: true });
});
