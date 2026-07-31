import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, startObservation } from "@langfuse/tracing";
import type { NodeSDK } from "@opentelemetry/sdk-node";
import { NodeSDK as NodeSDKConstructor } from "@opentelemetry/sdk-node";
import type {
	AgentEndEvent,
	AgentStartEvent,
	LlmRequestEndEvent,
	LlmRequestStartEvent,
	MessageEndEvent,
	SessionShutdownEvent,
	SubAgentCompactedEvent,
	SubAgentCompletedEvent,
	SubAgentCreatedEvent,
	SubAgentFailedEvent,
	SubAgentStartedEvent,
	SubAgentSteeredEvent,
	TelemetryEvent,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	TurnEndEvent,
	TurnStartEvent,
} from "../../types/events.js";
import { type LangfuseConfig, resolveLangfuseConfig } from "../../config.js";
import type { TelemetryProvider, TelemetryProviderMeta } from "../../types/provider.js";
import { runAllDetectors } from "../../eval/detectors.js";
import { scoreFrictionFindings } from "../../eval/langfuse.js";
import type { SessionSummary } from "../../eval/types.js";

export const LANGFUSE_PROVIDER_META: TelemetryProviderMeta = {
	name: "langfuse",
	label: "Langfuse",
	envVars: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"],
};

interface ObservationLike {
	readonly type?: string;
	readonly name?: string;
	readonly children?: ObservationLike[];
	update(attributes: Record<string, unknown>): ObservationLike;
	end(): void;
	startObservation(name: string, attributes: Record<string, unknown>, options: { asType: string }): ObservationLike;
}

interface SessionTrace {
	root: ObservationLike;
	currentTurn?: ObservationLike;
	tools: Map<string, ObservationLike>;
	subagents: Map<string, ObservationLike>;
	subagentDetails: Map<string, { agentType: string; description?: string; isBackground?: boolean }>;
	pendingRequests: Map<number, PendingRequest>;
}

interface PendingRequest {
	payload?: unknown;
	summarized?: boolean;
	status?: number;
	headers?: Record<string, string>;
}

const asObservation = (observation: unknown): ObservationLike => observation as ObservationLike;

function parentFor(trace: SessionTrace): ObservationLike {
	return trace.currentTurn ?? trace.root;
}

function usageDetails(usage: TurnEndEvent["usage"] | MessageEndEvent["usage"]): Record<string, number> | undefined {
	if (!usage) return undefined;
	return {
		input: usage.input,
		output: usage.output,
		total: usage.totalTokens,
		...(usage.cacheRead === undefined ? {} : { cacheRead: usage.cacheRead }),
		...(usage.cacheWrite === undefined ? {} : { cacheWrite: usage.cacheWrite }),
	};
}

function redact(data: string): string {
	return data
		.replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
		.replace(/(api[_-]?key|secret|token)(\s*[=:]\s*)([^,}\s"']+)/gi, "$1$2[REDACTED]");
}

/**
 * Langfuse provider for Pi lifecycle events.
 *
 * Observations are kept manually because Pi events are not one async call
 * stack: a turn, tool execution, and provider request each start and finish
 * in separate event callbacks. A single OpenTelemetry SDK is shared by the
 * provider instance and is flushed only at session shutdown.
 */
export class LangfuseProvider implements TelemetryProvider {
	readonly meta = LANGFUSE_PROVIDER_META;

	private readonly providerConfig: LangfuseConfig;
	private readonly sessions = new Map<string, SessionTrace>();
	private initialized = false;
	private initAttempted = false;
	private sdk?: NodeSDK;
	private processor?: LangfuseSpanProcessor;
	private readonly failedKinds = new Set<TelemetryEvent["kind"]>();
	private readonly evalSummaries = new Map<string, SessionSummary>();

	constructor(providerConfig: LangfuseConfig) {
		this.providerConfig = providerConfig;
	}

	async trackEvent(event: TelemetryEvent): Promise<void> {
		this.ensureInit();
		if (!this.initialized) return;
		try {
			this.collectForEvaluation(event);
			this.dispatch(event);
			if (this.failedKinds.delete(event.kind)) {
				console.warn(`[telemetry] langfuse provider recovered for kind=${event.kind}`);
			}
		} catch (error) {
			if (!this.failedKinds.has(event.kind)) {
				this.failedKinds.add(event.kind);
				console.warn(
					`[telemetry] langfuse provider error on kind=${event.kind}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	}

	async flush(): Promise<void> {
		if (!this.processor) return;
		try {
			await this.processor.forceFlush();
		} catch (error) {
			console.warn(`[telemetry] langfuse flush error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async shutdown(): Promise<void> {
		for (const session of this.sessions.values()) this.endSession(session);
		this.sessions.clear();
		this.evalSummaries.clear();
		this.failedKinds.clear();
		if (!this.sdk) return;
		try {
			// The dispatcher flushes before shutdown, so flush once more after
			// ending observations here to avoid losing the final root spans.
			await this.processor?.forceFlush();
			await this.sdk.shutdown();
		} catch (error) {
			console.warn(`[telemetry] langfuse shutdown error: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.sdk = undefined;
			this.processor = undefined;
			this.initialized = false;
			this.initAttempted = false;
		}
	}

	private dispatch(event: TelemetryEvent): void {
		switch (event.kind) {
			case "agent_start":
				this.onAgentStart(event);
				return;
			case "agent_end":
				this.onAgentEnd(event);
				return;
			case "turn_start":
				this.onTurnStart(event);
				return;
			case "turn_end":
				this.onTurnEnd(event);
				return;
			case "tool_execution_start":
				this.onToolStart(event);
				return;
			case "tool_execution_end":
				this.onToolEnd(event);
				return;
			case "llm_request_start":
				this.onLlmRequestStart(event);
				return;
			case "llm_request_end":
				this.onLlmRequestEnd(event);
				return;
			case "message_end":
				this.onMessageEnd(event);
				return;
			case "session_shutdown":
				this.onSessionShutdown(event);
				return;
			case "subagent_created":
				this.onSubAgentCreated(event);
				return;
			case "subagent_started":
				this.onSubAgentStarted(event);
				return;
			case "subagent_completed":
				this.onSubAgentCompleted(event);
				return;
			case "subagent_failed":
				this.onSubAgentFailed(event);
				return;
			case "subagent_compacted":
				this.onSubAgentCompacted(event);
				return;
			case "subagent_steered":
				this.onSubAgentSteered(event);
				return;
			case "session_compact":
			case "before_agent_start":
			case "model_select":
			case "myflow_checkpoint":
			case "session_start":
				this.onMetadataEvent(event);
				return;
		}
	}

	private onAgentStart(event: AgentStartEvent): void {
		if (this.sessions.has(event.sessionId)) return;
		const root = asObservation(
			propagateAttributes(
				{
					sessionId: event.sessionId,
					metadata: {
						...(event.parentSessionId ? { parentSessionId: event.parentSessionId } : {}),
						...(event.selfAgentType ? { agentType: event.selfAgentType } : {}),
					},
				},
				() =>
					startObservation(
						"agent-run",
						{
							input: { sessionId: event.sessionId },
							metadata: {
								...(event.parentSessionId ? { parentSessionId: event.parentSessionId } : {}),
								...(event.selfAgentType ? { agentType: event.selfAgentType } : {}),
							},
						},
						{ asType: "agent" },
					),
			),
		);
		this.sessions.set(event.sessionId, {
			root,
			tools: new Map(),
			subagents: new Map(),
			subagentDetails: new Map(),
			pendingRequests: new Map(),
		});
	}

	private onAgentEnd(event: AgentEndEvent): void {
		const trace = this.sessions.get(event.sessionId);
		if (!trace) return;
		const summary = this.evalSummaries.get(event.sessionId);
		if (summary) scoreFrictionFindings(trace.root, runAllDetectors(summary));
		trace.root.update({ output: { messageCount: event.messageCount } });
		this.endSession(trace);
		this.sessions.delete(event.sessionId);
		this.evalSummaries.delete(event.sessionId);
	}

	private onTurnStart(event: TurnStartEvent): void {
		const trace = this.getOrCreateTrace(event.sessionId);
		if (trace.currentTurn) trace.currentTurn.end();
		trace.currentTurn = asObservation(
			trace.root.startObservation(
				"agent-turn",
				{ input: { turnIndex: event.turnIndex }, metadata: { turnIndex: event.turnIndex } },
				{ asType: "chain" },
			),
		);
	}

	private onTurnEnd(event: TurnEndEvent): void {
		const trace = this.sessions.get(event.sessionId);
		if (!trace?.currentTurn) return;
		trace.currentTurn.update({
			output: { turnIndex: event.turnIndex, stopReason: event.stopReason },
			metadata: {
				...(event.toolResultCount === undefined ? {} : { toolResultCount: event.toolResultCount }),
				...(event.usage?.cost === undefined ? {} : { cost: event.usage.cost }),
			},
			...(usageDetails(event.usage) ? { usageDetails: usageDetails(event.usage) } : {}),
		});
		trace.currentTurn.end();
		trace.currentTurn = undefined;
	}

	private onToolStart(event: ToolExecutionStartEvent): void {
		const trace = this.getOrCreateTrace(event.sessionId);
		trace.tools.set(
			event.toolCallId,
			asObservation(
				parentFor(trace).startObservation(
					event.toolName,
					{ input: event.args, metadata: { toolCallId: event.toolCallId } },
					{ asType: "tool" },
				),
			),
		);
	}

	private onToolEnd(event: ToolExecutionEndEvent): void {
		const trace = this.sessions.get(event.sessionId);
		const tool = trace?.tools.get(event.toolCallId);
		if (!trace || !tool) return;
		tool.update(
			event.isError
				? { output: event.result, level: "ERROR", statusMessage: "Tool execution failed" }
				: { output: event.result },
		);
		tool.end();
		trace.tools.delete(event.toolCallId);
	}

	private onLlmRequestStart(event: LlmRequestStartEvent): void {
		this.getOrCreateTrace(event.sessionId).pendingRequests.set(event.requestSeq, {
			payload: event.payload,
			summarized: event.summarized,
		});
	}

	private onLlmRequestEnd(event: LlmRequestEndEvent): void {
		const trace = this.sessions.get(event.sessionId);
		const request = trace?.pendingRequests.get(event.requestSeq);
		if (!trace || !request) return;
		request.status = event.status;
		request.headers = event.headers;
	}

	private onMessageEnd(event: MessageEndEvent): void {
		if (event.role !== "assistant") return;
		const trace = this.getOrCreateTrace(event.sessionId);
		const latestRequestEntry = [...trace.pendingRequests.entries()].sort(([a], [b]) => b - a)[0];
		const latestRequest = latestRequestEntry?.[1];
		if (latestRequestEntry) trace.pendingRequests.delete(latestRequestEntry[0]);
		const generation = parentFor(trace).startObservation(
			"generate-response",
			{
				input: latestRequest?.payload ?? { sessionId: event.sessionId },
				model: event.model,
				metadata: {
					provider: event.provider,
					...(latestRequest?.status === undefined ? {} : { requestStatus: latestRequest.status }),
					...(latestRequest?.summarized === undefined ? {} : { requestPayloadSummarized: latestRequest.summarized }),
					stopReason: event.stopReason,
				},
				...(usageDetails(event.usage) ? { usageDetails: usageDetails(event.usage) } : {}),
				...(event.usage?.cost === undefined ? {} : { costDetails: { total: event.usage.cost } }),
			},
			{ asType: "generation" },
		);
		const output = event.content ?? { role: event.role, stopReason: event.stopReason };
		generation.update({ output });
		trace.root.update({ input: latestRequest?.payload ?? { sessionId: event.sessionId }, output });
		generation.end();
	}

	private onSessionShutdown(event: SessionShutdownEvent): void {
		const trace = this.sessions.get(event.sessionId);
		if (!trace) return;
		const summary = this.evalSummaries.get(event.sessionId);
		if (summary) scoreFrictionFindings(trace.root, runAllDetectors(summary));
		this.endSession(trace);
		this.sessions.delete(event.sessionId);
		this.evalSummaries.delete(event.sessionId);
	}

	private onSubAgentCreated(event: SubAgentCreatedEvent): void {
		const trace = this.getOrCreateTrace(event.sessionId);
		trace.subagentDetails.set(event.agentId, {
			agentType: event.agentType,
			description: event.description,
			isBackground: event.isBackground,
		});
	}

	private onSubAgentStarted(event: SubAgentStartedEvent): void {
		const trace = this.getOrCreateTrace(event.sessionId);
		const details = trace.subagentDetails.get(event.agentId);
		const observation = parentFor(trace).startObservation(
			event.agentType,
			{
				input: { agentId: event.agentId, task: details?.description },
				metadata: {
					agentId: event.agentId,
					...(details?.isBackground === undefined ? {} : { isBackground: details.isBackground }),
				},
			},
			{ asType: "agent" },
		);
		trace.subagents.set(event.agentId, asObservation(observation));
	}

	private onSubAgentCompleted(event: SubAgentCompletedEvent): void {
		const trace = this.sessions.get(event.sessionId);
		const agent = trace?.subagents.get(event.agentId);
		if (!trace || !agent) return;
		agent.update({
			output: event.result ?? event.status,
			metadata: {
				durationMs: event.durationMs,
				...(event.status ? { status: event.status } : {}),
				...(event.toolUses === undefined ? {} : { toolUses: event.toolUses }),
				...(event.usage ? { usage: usageDetails(event.usage) } : {}),
			},
		});
		agent.end();
		trace.subagents.delete(event.agentId);
	}

	private onSubAgentFailed(event: SubAgentFailedEvent): void {
		const trace = this.sessions.get(event.sessionId);
		const agent = trace?.subagents.get(event.agentId);
		if (!trace || !agent) return;
		agent.update({
			output: event.error,
			level: "ERROR",
			statusMessage: event.error,
			metadata: { durationMs: event.durationMs, ...(event.status ? { status: event.status } : {}) },
		});
		agent.end();
		trace.subagents.delete(event.agentId);
	}

	private onSubAgentCompacted(event: SubAgentCompactedEvent): void {
		const agent = this.sessions.get(event.sessionId)?.subagents.get(event.agentId);
		agent?.update({ metadata: { compactionReason: event.reason, tokensBefore: event.tokensBefore, compactionCount: event.compactionCount } });
	}

	private onSubAgentSteered(event: SubAgentSteeredEvent): void {
		const agent = this.sessions.get(event.sessionId)?.subagents.get(event.agentId);
		agent?.update({ metadata: { lastSteeringMessage: event.message } });
	}

	private onMetadataEvent(event: TelemetryEvent): void {
		const trace = this.sessions.get(event.sessionId);
		if (!trace) return;
		trace.root.update({ metadata: { lastEvent: event.kind, lastEventAt: event.timestamp } });
	}

	private getOrCreateTrace(sessionId: string): SessionTrace {
		const existing = this.sessions.get(sessionId);
		if (existing) return existing;
		const root = asObservation(
			propagateAttributes({ sessionId }, () =>
				startObservation("agent-run", { input: { sessionId } }, { asType: "agent" }),
			),
		);
		const trace = {
			root,
			tools: new Map<string, ObservationLike>(),
			subagents: new Map<string, ObservationLike>(),
			subagentDetails: new Map<string, { agentType: string; description?: string; isBackground?: boolean }>(),
			pendingRequests: new Map<number, PendingRequest>(),
		};
		this.sessions.set(sessionId, trace);
		return trace;
	}

	private endSession(trace: SessionTrace): void {
		for (const tool of trace.tools.values()) tool.update({ level: "ERROR", statusMessage: "Session ended before tool completion" }).end();
		trace.tools.clear();
		for (const agent of trace.subagents.values()) agent.update({ level: "ERROR", statusMessage: "Session ended before sub-agent completion" }).end();
		trace.subagents.clear();
		trace.currentTurn?.end();
		trace.currentTurn = undefined;
		trace.root.end();
	}

	private collectForEvaluation(event: TelemetryEvent): void {
		if (event.kind === "agent_start") {
			this.evalSummaries.set(event.sessionId, {
				sessionId: event.sessionId, durationMs: 0, turnCount: 0,
				toolCallSummary: {}, highChurnTurnCount: 0,
				subAgentSummary: { totalCreated: 0, totalDurationMs: 0, totalToolUses: 0 },
				tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, checkpoints: [],
			});
			return;
		}
		const summary = this.evalSummaries.get(event.sessionId);
		if (!summary) return;
		summary.durationMs = Math.max(summary.durationMs, Date.now());
		switch (event.kind) {
			case "turn_start": summary.turnCount++; break;
			case "turn_end":
				if ((event.toolResultCount ?? 0) >= 8) summary.highChurnTurnCount++;
				if (event.usage) {
					summary.tokenUsage.inputTokens += event.usage.input;
					summary.tokenUsage.outputTokens += event.usage.output;
					summary.tokenUsage.totalTokens += event.usage.totalTokens;
					summary.tokenUsage.costUsd = (summary.tokenUsage.costUsd ?? 0) + (event.usage.cost ?? 0);
				}
				break;
			case "tool_execution_end": {
				const stats = summary.toolCallSummary[event.toolName] ??= { total: 0, errors: 0 };
				stats.total++; if (event.isError) stats.errors++;
				break;
			}
			case "subagent_completed":
			case "subagent_failed":
				summary.subAgentSummary.totalCreated++;
				summary.subAgentSummary.totalDurationMs += event.durationMs;
				if (event.kind === "subagent_completed") summary.subAgentSummary.totalToolUses += event.toolUses ?? 0;
				break;
			case "myflow_checkpoint":
				summary.checkpoints.push({ stage: event.stage, timestamp: event.timestamp, artifactPath: event.artifactPath, artifactKind: event.artifactKind, riskLevel: event.riskLevel, decisionCount: event.decisionCount });
				break;
		}
	}

	private ensureInit(): void {
		if (this.initialized || this.initAttempted) return;
		this.initAttempted = true;
		const resolved = resolveLangfuseConfig(this.providerConfig);
		if (!resolved.publicKey || !resolved.secretKey) {
			console.warn("[telemetry] langfuse provider requires LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY — events will be dropped");
			return;
		}
		try {
			const processor = new LangfuseSpanProcessor({
				publicKey: resolved.publicKey,
				secretKey: resolved.secretKey,
				...(resolved.baseUrl ? { baseUrl: resolved.baseUrl } : {}),
				...(resolved.environment ? { environment: resolved.environment } : {}),
				...(resolved.release ? { release: resolved.release } : {}),
				mask: ({ data }: { data: string }) => redact(data),
			});
			this.processor = processor;
			this.sdk = new NodeSDKConstructor({ spanProcessors: [processor] });
			this.sdk.start();
			this.initialized = true;
		} catch (error) {
			console.warn(`[telemetry] langfuse init failed; events will be dropped: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
