import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

// Stub HOME to a fresh tmpdir at module-load — BEFORE any production module is
// imported — so module-level `homedir()` captures resolve to the test home and
// the user-layer workflow overlay (`~/.myflow/config/workflow`) never leaks the
// developer's real config into a run.
const TEST_HOME = mkdtempSync(join(tmpdir(), "workflow-test-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

beforeEach(async () => {
	// Reset all process-global workflow registries between tests. These are
	// module-level singletons (built-ins, lifecycle bundles, the jiti load
	// cache, skill contracts) that otherwise leak registrations across tests.
	const internal = await import("../internal.js");
	internal.__resetBuiltIns();
	internal.__resetLifecycleRegistry();
	internal.__resetLoadCache();
	internal.__resetSkillContracts();

	rmSync(join(TEST_HOME, ".myflow", "config", "workflow"), { recursive: true, force: true });
});
