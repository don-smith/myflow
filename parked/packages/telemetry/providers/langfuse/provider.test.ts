import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
	const observations: FakeObservation[] = [];
	const startObservation = vi.fn();
	const propagateAttributes = vi.fn((_attributes: unknown, fn: () => unknown) => fn());
	const processorInstances: FakeProcessor[] = [];
	const sdkInstances: FakeSdk[] = [];
	const clientInstances: FakeClient[] = [];
	const scoreCreates = vi.fn(async () => {});
	const shutdownOrder: string[] = [];

	class FakeObservation {
		readonly type: string;
		readonly name: string;
		readonly attributes: Record<string, unknown>;
		readonly id: string;
		readonly traceId: string;
		readonly children: FakeObservation[] = [];
		readonly updates: Record<string, unknown>[] = [];
		ended = false;

		constructor(name: string, attributes: Record<string, unknown>, type: string) {
			this.name = name;
			this.attributes = attributes;
			this.type = type;
			this.id = `observation-${observations.length + 1}`;
			this.traceId = "trace-1";
			observations.push(this);
		}

		startObservation(name: string, attributes: Record<string, unknown>, options: { asType: string }): FakeObservation {
			const child = new FakeObservation(name, attributes, options.asType);
			this.children.push(child);
			return child;
		}

		update(attributes: Record<string, unknown>): this {
			this.updates.push(attributes);
			return this;
		}

		end(): void {
			this.ended = true;
		}
	}

	class FakeProcessor {
		readonly options: Record<string, unknown>;
		forceFlush = vi.fn(async () => {
			shutdownOrder.push("processor.flush");
		});
		constructor(options: Record<string, unknown>) {
			this.options = options;
			processorInstances.push(this);
		}
	}

	class FakeSdk {
		forceFlush = vi.fn(async () => {});
		shutdown = vi.fn(async () => {
			shutdownOrder.push("sdk.shutdown");
		});
		start = vi.fn();

		constructor(_options: unknown) {
			sdkInstances.push(this);
		}
	}

	class FakeClient {
		readonly score = { create: scoreCreates };
		flush = vi.fn(async () => {
			shutdownOrder.push("client.flush");
		});
		shutdown = vi.fn(async () => {
			shutdownOrder.push("client.shutdown");
		});

		constructor(readonly options: Record<string, unknown>) {
			clientInstances.push(this);
		}
	}

	return { observations, startObservation, propagateAttributes, processorInstances, sdkInstances, clientInstances, scoreCreates, shutdownOrder, FakeObservation, FakeProcessor, FakeSdk, FakeClient };
});

const { observations, startObservation, propagateAttributes, processorInstances, sdkInstances, clientInstances, scoreCreates, shutdownOrder, FakeObservation, FakeProcessor, FakeSdk } = mockState;

type FakeObservation = InstanceType<typeof mockState.FakeObservation>;
type FakeProcessor = InstanceType<typeof mockState.FakeProcessor>;
type FakeSdk = InstanceType<typeof mockState.FakeSdk>;

vi.mock("@langfuse/tracing", () => ({
	startObservation: (name: string, attributes: Record<string, unknown>, options: { asType: string }) => {
		const observation = new mockState.FakeObservation(name, attributes, options.asType);
		mockState.startObservation(name, attributes, options);
		return observation;
	},
	propagateAttributes: mockState.propagateAttributes,
}));
vi.mock("@langfuse/otel", () => ({ LangfuseSpanProcessor: mockState.FakeProcessor }));
vi.mock("@langfuse/client", () => ({ LangfuseClient: mockState.FakeClient }));
vi.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: mockState.FakeSdk }));

import { LangfuseProvider } from "./index.js";

const baseEvent = { sessionId: "session-1", timestamp: 1 };
const gitContext = { repository: "github.com/acme/widgets", branch: "feature/telemetry", commit: "abc1234" };

beforeEach(() => {
	observations.length = 0;
	startObservation.mockClear();
	propagateAttributes.mockClear();
	processorInstances.length = 0;
	sdkInstances.length = 0;
	clientInstances.length = 0;
	scoreCreates.mockClear();
	shutdownOrder.length = 0;
	delete process.env.LANGFUSE_PUBLIC_KEY;
	delete process.env.LANGFUSE_SECRET_KEY;
	delete process.env.LANGFUSE_BASE_URL;
});

describe("LangfuseProvider", () => {
	it("creates a typed agent tree from Pi lifecycle events", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });

		await provider.trackEvent({ kind: "agent_start", ...baseEvent, selfAgentType: "implementation-coder" });
		await provider.trackEvent({ kind: "turn_start", ...baseEvent, turnIndex: 0 });
		await provider.trackEvent({
			kind: "tool_execution_start",
			...baseEvent,
			toolCallId: "call-1",
			toolName: "read",
			args: { path: "README.md" },
		});
		await provider.trackEvent({
			kind: "tool_execution_end",
			...baseEvent,
			toolCallId: "call-1",
			toolName: "read",
			result: "contents",
			isError: false,
		});
		await provider.trackEvent({
			kind: "llm_request_start",
			...baseEvent,
			requestSeq: 1,
			payload: { model: "gpt-5", messages: [{ role: "user", content: "Do it" }] },
		});
		await provider.trackEvent({
			kind: "llm_request_end",
			...baseEvent,
			requestSeq: 1,
			status: 200,
			headers: { "x-request-id": "req-1" },
		});
		await provider.trackEvent({
			kind: "message_end",
			...baseEvent,
			role: "assistant",
			model: "gpt-5",
			provider: "openai",
			stopReason: "stop",
			content: "Done",
			usage: { input: 10, output: 5, totalTokens: 15, cost: 0.03 },
		});
		await provider.trackEvent({ kind: "turn_end", ...baseEvent, turnIndex: 0, usage: { input: 10, output: 5, totalTokens: 15, cost: 0.03 } });
		await provider.trackEvent({ kind: "agent_end", ...baseEvent, messageCount: 2 });

		const root = observations.find((observation) => observation.type === "agent");
		expect(root?.name).toBe("agent-run");
		expect(root?.attributes).toMatchObject({ metadata: { agentType: "implementation-coder" } });
		expect(root?.updates).toContainEqual({
		input: { model: "gpt-5", messages: [{ role: "user", content: "Do it" }] },
		output: "Done",
		});
		expect(root?.children.map((child) => child.type)).toEqual(["chain"]);
		expect(root?.children[0].children.map((child) => child.type)).toEqual(["tool", "generation"]);
		expect(root?.children[0].children[0].updates).toEqual([{ output: "contents" }]);
		expect(root?.children[0].children[1].attributes).toMatchObject({
			input: { model: "gpt-5", messages: [{ role: "user", content: "Do it" }] },
			metadata: { provider: "openai", requestStatus: 200 },
			usageDetails: { input: 10, output: 5, total: 15 },
			costDetails: { total: 0.03 },
		});
		expect(root?.children[0].children[1].updates[0]).toEqual({ output: "Done" });
		expect(root?.ended).toBe(true);
	});

	it("keeps a captured user request as the root input instead of overwriting it with the provider payload", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });

		await provider.trackEvent({ kind: "before_agent_start", ...baseEvent, context: gitContext, prompt: "Fix the failing test" });
		await provider.trackEvent({ kind: "agent_start", ...baseEvent, context: gitContext });
		await provider.trackEvent({
			kind: "llm_request_start",
			...baseEvent,
			requestSeq: 1,
			payload: { model: "gpt-5", messages: [{ role: "user", content: "Fix the failing test" }] },
		});
		await provider.trackEvent({
			kind: "message_end",
			...baseEvent,
			role: "assistant",
			model: "gpt-5",
			provider: "openai",
			stopReason: "stop",
			usage: { input: 10, output: 5, totalTokens: 15 },
		});

		const root = observations.find((observation) => observation.type === "agent");
		expect(root?.updates).toContainEqual({ input: { prompt: "Fix the failing test" } });
		expect(root?.updates).toContainEqual({ output: { role: "assistant", stopReason: "stop" } });
		expect(root?.updates).not.toContainEqual(expect.objectContaining({ input: expect.objectContaining({ model: "gpt-5" }) }));
	});

	it("nests background sub-agent execution under the active turn", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });
		await provider.trackEvent({ kind: "agent_start", ...baseEvent });
		await provider.trackEvent({ kind: "turn_start", ...baseEvent, turnIndex: 0 });
		await provider.trackEvent({
			kind: "subagent_created",
			...baseEvent,
			agentId: "agent-1",
			agentType: "web-search-researcher",
			description: "Find the relevant docs",
			isBackground: true,
		});
		await provider.trackEvent({ kind: "subagent_started", ...baseEvent, agentId: "agent-1", agentType: "web-search-researcher" });
		await provider.trackEvent({
			kind: "subagent_completed",
			...baseEvent,
			agentId: "agent-1",
			status: "completed",
			result: "Found docs",
			durationMs: 1200,
			usage: { input: 20, output: 10, totalTokens: 30 },
		});

		const root = observations.find((observation) => observation.type === "agent");
		const child = root?.children[0].children.find((observation) => observation.type === "agent");
		expect(child?.name).toBe("web-search-researcher");
		expect(child?.attributes).toMatchObject({ input: { agentId: "agent-1", task: "Find the relevant docs" } });
		expect(child?.updates[0]).toMatchObject({ output: "Found docs", metadata: { durationMs: 1200 } });
		expect(child?.ended).toBe(true);
	});

	it("propagates Git context through the normal root", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });

		await provider.trackEvent({
			kind: "agent_start",
			...baseEvent,
			context: gitContext,
			selfAgentType: "implementation-coder",
			parentSessionId: "parent-1",
		});

		expect(propagateAttributes).toHaveBeenCalledWith({
			sessionId: "session-1",
			tags: ["repo:github.com/acme/widgets", "branch:feature/telemetry"],
			metadata: {
				piSessionId: "session-1",
				...gitContext,
				agentType: "implementation-coder",
				parentSessionId: "parent-1",
			},
		}, expect.any(Function));
	});

	it("propagates Git context through a fallback root", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });

		await provider.trackEvent({ kind: "turn_start", ...baseEvent, context: gitContext, turnIndex: 0 });

		expect(propagateAttributes).toHaveBeenCalledWith({
			sessionId: "session-1",
			tags: ["repo:github.com/acme/widgets", "branch:feature/telemetry"],
			metadata: { piSessionId: "session-1", ...gitContext },
		}, expect.any(Function));
		const root = observations.find((observation) => observation.type === "agent");
		expect(root?.attributes).toMatchObject({
			input: { sessionId: "session-1" },
			metadata: { piSessionId: "session-1", ...gitContext },
		});
		expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("langfuse provider error"));
		warn.mockRestore();
	});

	it("bounds root metadata values while preserving complete filtering tags", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });
		const longContext = {
			repository: "r".repeat(201),
			branch: "b".repeat(201),
			commit: "c".repeat(201),
		};

		await provider.trackEvent({ kind: "agent_start", ...baseEvent, context: longContext });

		const root = observations.find((observation) => observation.type === "agent");
		const metadata = root?.attributes.metadata as Record<string, string>;
		expect(metadata.repository).toHaveLength(200);
		expect(metadata.branch).toHaveLength(200);
		expect(metadata.commit).toHaveLength(200);
		expect(propagateAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: [`repo:${longContext.repository}`, `branch:${longContext.branch}`],
			}),
			expect.any(Function),
		);
	});

	it("omits Git attributes when the event has no context", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });

		await provider.trackEvent({ kind: "agent_start", ...baseEvent });

		expect(propagateAttributes).toHaveBeenCalledWith({
			sessionId: "session-1",
			metadata: { piSessionId: "session-1" },
		}, expect.any(Function));
	});

	it("does not create traces without both Langfuse credentials", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const provider = new LangfuseProvider({});

		await provider.trackEvent({ kind: "agent_start", ...baseEvent });

		expect(startObservation).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("LANGFUSE_PUBLIC_KEY"));
		warn.mockRestore();
	});

	it("publishes the aggregate friction score with the root trace identity", async () => {
		const provider = new LangfuseProvider({
			publicKey: "pk-test",
			secretKey: "sk-test",
			baseUrl: "http://langfuse.test",
			environment: "development",
		});

		await provider.trackEvent({ kind: "agent_start", ...baseEvent });
		await provider.trackEvent({ kind: "agent_end", ...baseEvent, messageCount: 1 });

		expect(clientInstances).toHaveLength(1);
		expect(clientInstances[0].options).toMatchObject({
			publicKey: "pk-test",
			secretKey: "sk-test",
			baseUrl: "http://langfuse.test",
		});
		expect(scoreCreates).toHaveBeenCalledWith({
			id: "trace-1-myflow.friction-free",
			traceId: "trace-1",
			observationId: "observation-1",
			name: "myflow.friction-free",
			value: 1,
			environment: "development",
			dataType: "NUMERIC",
			comment: "0 deterministic friction finding(s)",
		});
	});

	it("keeps terminal cleanup when score publication throws", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });
		await provider.trackEvent({ kind: "agent_start", ...baseEvent });
		scoreCreates.mockImplementationOnce(() => {
			throw new Error("score failed");
		});

		await provider.trackEvent({ kind: "agent_end", ...baseEvent, messageCount: 1 });

		const root = observations.find((observation) => observation.type === "agent");
		expect(root?.ended).toBe(true);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("score failed"));
		warn.mockRestore();
	});

	it("uses distinct score IDs for multiple findings of one type", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });
		await provider.trackEvent({ kind: "agent_start", ...baseEvent });
		for (const [index, toolName] of ["read", "write"].entries()) {
			for (let attempt = 0; attempt < 3; attempt++) {
				await provider.trackEvent({
					kind: "tool_execution_end",
					...baseEvent,
					toolCallId: `${toolName}-${index}-${attempt}`,
					toolName,
					isError: true,
				});
			}
		}

		await provider.trackEvent({ kind: "agent_end", ...baseEvent, messageCount: 1 });

		const findingIds = scoreCreates.mock.calls
			.map(([score]) => score as { name: string; id: string })
			.filter((score) => score.name === "myflow.friction.tool_error_spike")
			.map((score) => score.id);
		expect(findingIds).toHaveLength(2);
		expect(new Set(findingIds).size).toBe(2);
	});

	it("serializes processor flush before client and SDK shutdown", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });
		await provider.trackEvent({ kind: "agent_start", ...baseEvent });
		let releaseFlush!: () => void;
		processorInstances[0].forceFlush.mockImplementationOnce(
			() => new Promise<void>((resolve) => {
				shutdownOrder.push("processor.flush.start");
				releaseFlush = () => {
					shutdownOrder.push("processor.flush.end");
					resolve();
				};
			}),
		);

		const shutdown = provider.shutdown();
		await Promise.resolve();
		expect(shutdownOrder).toEqual(["processor.flush.start"]);
		releaseFlush();
		await shutdown;

		expect(shutdownOrder).toEqual([
			"processor.flush.start",
			"processor.flush.end",
			"client.shutdown",
			"sdk.shutdown",
		]);
	});

	it("shuts down the client and OpenTelemetry SDK when span flushing fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });
		await provider.trackEvent({ kind: "agent_start", ...baseEvent });
		processorInstances[0].forceFlush.mockRejectedValueOnce(new Error("span export failed"));

		await provider.shutdown();

		expect(clientInstances[0].shutdown).toHaveBeenCalledOnce();
		expect(sdkInstances[0].shutdown).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("span export failed"));
		warn.mockRestore();
	});

	it("flushes and shuts down the shared OpenTelemetry SDK", async () => {
		const provider = new LangfuseProvider({ publicKey: "pk-test", secretKey: "sk-test" });
		await provider.trackEvent({ kind: "agent_start", ...baseEvent });

		await provider.flush();
		await provider.shutdown();
		await provider.trackEvent({ kind: "agent_start", ...baseEvent, sessionId: "session-2" });

		expect(sdkInstances).toHaveLength(2);
		expect(processorInstances[0].forceFlush).toHaveBeenCalledTimes(2);
		expect(clientInstances[0].flush).toHaveBeenCalledOnce();
		expect(clientInstances[0].shutdown).toHaveBeenCalledOnce();
		expect(sdkInstances[0].shutdown).toHaveBeenCalledOnce();
		expect(processorInstances[0].options).toMatchObject({ publicKey: "pk-test", secretKey: "sk-test" });
	});
});
