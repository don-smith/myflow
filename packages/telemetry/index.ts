/**
 * telemetry — standalone observability SDK + public API barrel.
 *
 * Dispatches Pi lifecycle and sub-agent EventBus events to all configured
 * telemetry providers (Langfuse, console) via a bounded async dispatcher. The
 * Pi extension `default` entry lives in the thin `./extension.ts` (not here).
 * Standalone usage: import named exports without the Pi runtime.
 */

export {
	type ConsoleConfig,
	type DispatcherConfig,
	isEventEnabled,
	type LlmPayloadMode,
	loadTelemetryConfig,
	type LangfuseConfig,
	type ProvidersConfig,
	resolveLangfuseConfig,
	saveTelemetryConfig,
	type TelemetryConfig,
} from "./config.js";
export {
	dispatchTelemetryEvent,
	getProviders,
	registerTelemetryProvider,
	resetTelemetryDispatcher,
	shutdownTelemetryDispatcher,
} from "./dispatcher.js";
export { emitMyFlowCheckpoint } from "./checkpoint.js";
export type { MyFlowCheckpointData } from "./checkpoint.js";
export { analyzeAllSessions, analyzeSession } from "./eval/reducer.js";
export { runAllDetectors } from "./eval/detectors.js";
export { scoreFrictionFindings } from "./eval/langfuse.js";
export type { FrictionFinding, FrictionSeverity, FrictionType, SessionSummary } from "./eval/types.js";
export { teardownTelemetry } from "./instrumentation/index.js";
export {
	BUILT_IN_PROVIDERS,
	CONSOLE_PROVIDER_META,
	ConsoleProvider,
	LANGFUSE_PROVIDER_META,
	LangfuseProvider,
} from "./providers/index.js";
export type {
	AgentEndEvent,
	AgentStartEvent,
	BeforeAgentStartEvent,
	LlmRequestEndEvent,
	LlmRequestStartEvent,
	MessageEndEvent,
	MessageRole,
	ModelSelectEvent,
	SessionCompactEvent,
	SessionShutdownEvent,
	SessionStartEvent,
	SubAgentCompactedEvent,
	SubAgentCompletedEvent,
	SubAgentCreatedEvent,
	SubAgentFailedEvent,
	SubAgentStartedEvent,
	SubAgentSteeredEvent,
	TelemetryEvent,
	TelemetryEventKind,
	TelemetrySessionContext,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	TurnEndEvent,
	TurnStartEvent,
} from "./types/events.js";
export { TELEMETRY_EVENT_KINDS } from "./types/events.js";
export type { TelemetryProvider, TelemetryProviderMeta } from "./types/provider.js";

// NOTE: the Pi extension `default` entry is `./extension.ts`, not this barrel.
