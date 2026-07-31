import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
	const observations: FakeObservation[] = [];
	const startObservation = vi.fn();
	const propagateAttributes = vi.fn((_attributes: unknown, fn: () => unknown) => fn());
	const processorInstances: FakeProcessor[] = [];
	const sdkInstances: FakeSdk[] = [];

	class FakeObservation {
		readonly type: string;
		readonly name: string;
		readonly attributes: Record<string, unknown>;
		readonly children: FakeObservation[] = [];
		readonly updates: Record<string, unknown>[] = [];
		ended = false;

		constructor(name: string, attributes: Record<string, unknown>, type: string) {
			this.name = name;
			this.attributes = attributes;
			this.type = type;
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
		forceFlush = vi.fn(async () => {});
		constructor(options: Record<string, unknown>) {
			this.options = options;
			processorInstances.push(this);
		}
	}

	class FakeSdk {
		forceFlush = vi.fn(async () => {});
		shutdown = vi.fn(async () => {});
		start = vi.fn();

		constructor(_options: unknown) {
			sdkInstances.push(this);
		}
	}

	return { observations, startObservation, propagateAttributes, processorInstances, sdkInstances, FakeObservation, FakeProcessor, FakeSdk };
});

const { observations, startObservation, propagateAttributes, processorInstances, sdkInstances, FakeObservation, FakeProcessor, FakeSdk } = mockState;

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
vi.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: mockState.FakeSdk }));

import { LangfuseProvider } from "./index.js";

const baseEvent = { sessionId: "session-1", timestamp: 1 };

beforeEach(() => {
	observations.length = 0;
	startObservation.mockClear();
	propagateAttributes.mockClear();
	processorInstances.length = 0;
	sdkInstances.length = 0;
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

	it("does not create traces without both Langfuse credentials", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const provider = new LangfuseProvider({});

		await provider.trackEvent({ kind: "agent_start", ...baseEvent });

		expect(startObservation).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("LANGFUSE_PUBLIC_KEY"));
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
		expect(sdkInstances[0].shutdown).toHaveBeenCalledOnce();
		expect(processorInstances[0].options).toMatchObject({ publicKey: "pk-test", secretKey: "sk-test" });
	});
});
