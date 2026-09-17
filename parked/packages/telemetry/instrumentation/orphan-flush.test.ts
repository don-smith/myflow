import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../dispatcher.js", () => ({ dispatchTelemetryEvent: vi.fn(), resetTelemetryDispatcher: vi.fn() }));

import { dispatchTelemetryEvent } from "../dispatcher.js";
import { flushOrphanSubAgents } from "./orphan-flush.js";
import {
	inflightKey,
	inflightSubAgents,
	setCurrentGitContext,
	setCurrentSessionId,
	teardownTelemetry,
} from "./state.js";

beforeEach(() => {
	teardownTelemetry();
	vi.mocked(dispatchTelemetryEvent).mockClear();
	setCurrentSessionId("session-1");
	setCurrentGitContext({ repository: "github.com/acme/widgets", branch: "feature/telemetry", commit: "abc1234" });
});

describe("flushOrphanSubAgents", () => {
	it("attaches active session context to synthesized failures", () => {
		inflightSubAgents.set(inflightKey("session-1", "agent-1"), {
			agentId: "agent-1",
			sessionId: "session-1",
			startedAtMs: Date.now() - 50,
		});

		flushOrphanSubAgents();

		expect(dispatchTelemetryEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "subagent_failed",
				context: {
					repository: "github.com/acme/widgets",
					branch: "feature/telemetry",
					commit: "abc1234",
				},
			}),
		);
	});

	it("uses each orphan's session context during session transitions", () => {
		inflightSubAgents.set(inflightKey("session-1", "agent-1"), {
			agentId: "agent-1",
			sessionId: "session-1",
			startedAtMs: Date.now() - 50,
		});
		setCurrentSessionId("session-2");
		setCurrentGitContext({ repository: "github.com/acme/other", branch: "main", commit: "def5678" });
		inflightSubAgents.set(inflightKey("session-2", "agent-2"), {
			agentId: "agent-2",
			sessionId: "session-2",
			startedAtMs: Date.now() - 50,
		});

		flushOrphanSubAgents();

		const events = vi.mocked(dispatchTelemetryEvent).mock.calls.map(([event]) => event);
		expect(events).toEqual([
			expect.objectContaining({ sessionId: "session-1", context: { repository: "github.com/acme/widgets", branch: "feature/telemetry", commit: "abc1234" } }),
			expect.objectContaining({ sessionId: "session-2", context: { repository: "github.com/acme/other", branch: "main", commit: "def5678" } }),
		]);
	});
});
