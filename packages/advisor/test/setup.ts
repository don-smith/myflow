import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

// Stub HOME to a fresh tmpdir at module-load — BEFORE any production module is
// imported — so module-level `homedir()` / `configPath()` captures resolve to
// the test home instead of the developer's real `~/.myflow/config/*`.
const TEST_HOME = mkdtempSync(join(tmpdir(), "advisor-test-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

const ADVISOR_SYMBOL = Symbol.for("advisor");

beforeEach(async () => {
	// Reset all module-level advisor state (in-memory model/effort, policy
	// blocklist, notify-once latch, inventory cache) plus the persisted config
	// so each test starts from a clean, unconfigured advisor.
	const advisor = await import("../advisor/index.js");
	advisor.setAdvisorModel(undefined);
	advisor.setAdvisorEffort(undefined);
	advisor.setDisabledForModels([]);
	advisor.__resetAdvisorAnnounced();

	delete (globalThis as Record<symbol, unknown>)[ADVISOR_SYMBOL];

	rmSync(join(TEST_HOME, ".myflow", "config", "advisor"), { recursive: true, force: true });
});
