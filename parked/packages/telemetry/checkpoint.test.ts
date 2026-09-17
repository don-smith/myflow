import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./dispatcher.js", () => ({ dispatchTelemetryEvent: vi.fn(), resetTelemetryDispatcher: vi.fn() }));

import { emitMyFlowCheckpoint } from "./checkpoint.js";
import { dispatchTelemetryEvent } from "./dispatcher.js";
import { setCurrentGitContext, setCurrentSessionId, teardownTelemetry } from "./instrumentation/state.js";

beforeEach(() => {
	setCurrentSessionId("session-1");
	setCurrentGitContext({ repository: "github.com/acme/widgets", branch: "feature/telemetry", commit: "abc1234" });
	vi.mocked(dispatchTelemetryEvent).mockClear();
});

describe("emitMyFlowCheckpoint", () => {
	it("attaches active session context", () => {
		emitMyFlowCheckpoint({ stage: "design" });

		expect(dispatchTelemetryEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				context: {
					repository: "github.com/acme/widgets",
					branch: "feature/telemetry",
					commit: "abc1234",
				},
			}),
		);
	});

	it("does not dispatch after teardown", () => {
		teardownTelemetry();
		emitMyFlowCheckpoint({ stage: "design" });
		expect(dispatchTelemetryEvent).not.toHaveBeenCalled();
	});
});
