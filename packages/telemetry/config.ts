import { configPath, loadJsonConfig, readEnvVar, saveJsonConfig, validateConfig } from "@myflow/config";
import { type Static, Type } from "typebox";
import { TELEMETRY_EVENT_KINDS, type TelemetryEventKind } from "./types/events.js";

const CONFIG_PATH = configPath("telemetry");

const DEFAULT_MAX_QUEUE_SIZE = 100;

// ---------------------------------------------------------------------------
// TypeBox schema — provider-enable map + optional event allowlist
// ---------------------------------------------------------------------------

const LangfuseProviderConfig = Type.Object(
	{
		publicKey: Type.Optional(Type.String({ description: "Langfuse public API key" })),
		secretKey: Type.Optional(Type.String({ description: "Langfuse secret API key" })),
		baseUrl: Type.Optional(Type.String({ description: "Langfuse project base URL" })),
		environment: Type.Optional(Type.String({ description: "Langfuse tracing environment" })),
		release: Type.Optional(Type.String({ description: "Langfuse release identifier" })),
	},
	{ additionalProperties: false },
);

const ConsoleProviderConfig = Type.Object({}, { additionalProperties: false });

const LlmPayloadModeSchema = Type.Union([
	Type.Literal("full"),
	Type.Literal("prompts"),
	Type.Literal("summary"),
	Type.Literal("off"),
]);

/**
 * Provider keys are enumerated rather than open-ended so a typo (`mflow:`)
 * fails loudly at load time instead of silently dropping all events. Built-in
 * providers live in one place: this schema + `PROVIDER_FACTORIES` in
 * `providers/index.ts`. Custom providers register via `registerTelemetryProvider`,
 * not through the config file.
 */
const ProvidersConfigSchema = Type.Object(
	{
		langfuse: Type.Optional(LangfuseProviderConfig),
		console: Type.Optional(ConsoleProviderConfig),
	},
	{ additionalProperties: false },
);

const DispatcherConfigSchema = Type.Object(
	{
		maxQueueSize: Type.Optional(
			Type.Integer({
				minimum: 1,
				description: "Max events buffered before backpressure drops. Defaults to 100.",
			}),
		),
	},
	{ additionalProperties: false },
);

/**
 * `events` accepts:
 *   - omitted (the field is absent) → all events enabled.
 *   - `"*"` → all events enabled (explicit form).
 *   - `[]` → no events enabled.
 *   - `string[]` → allowlist; entries are validated against `TELEMETRY_EVENT_KINDS`.
 */
const EventsConfigSchema = Type.Union([Type.Literal("*"), Type.Array(Type.String())]);

const TelemetryConfigSchema = Type.Object(
	{
		providers: Type.Optional(ProvidersConfigSchema),
		events: Type.Optional(EventsConfigSchema),
		llmPayload: Type.Optional(LlmPayloadModeSchema),
		dispatcher: Type.Optional(DispatcherConfigSchema),
	},
	{ additionalProperties: false },
);

type TelemetryConfigSchema = Static<typeof TelemetryConfigSchema>;
export type LlmPayloadMode = Static<typeof LlmPayloadModeSchema>;

// ---------------------------------------------------------------------------
// Public config types
// ---------------------------------------------------------------------------

export type LangfuseConfig = Static<typeof LangfuseProviderConfig>;
export type ConsoleConfig = Static<typeof ConsoleProviderConfig>;

/** Schema-derived provider-config shape. Adding a built-in provider requires editing only `ProvidersConfigSchema` above. */
export type ProvidersConfig = Static<typeof ProvidersConfigSchema>;

export interface DispatcherConfig {
	/** Max events buffered before backpressure drops. Defaults to 100. */
	maxQueueSize: number;
}

export interface TelemetryConfig {
	providers: ProvidersConfig;
	/** `"*"` → all events enabled; `[]` → none enabled; allowlist → only listed kinds. */
	events: "*" | TelemetryEventKind[];
	/** Controls how much LLM request/output content is recorded. `"prompts"` captures only user requests. Defaults to `"off"`. */
	llmPayload: LlmPayloadMode;
	dispatcher: DispatcherConfig;
}

// ---------------------------------------------------------------------------
// Load / save / resolve
// ---------------------------------------------------------------------------

export function loadTelemetryConfig(): TelemetryConfig {
	const raw = loadJsonConfig<TelemetryConfigSchema>(CONFIG_PATH);
	// `additionalProperties: false` on `ProvidersConfigSchema` rejects unknown
	// provider keys with a precise TypeBox error — no separate warn-and-throw
	// double-act.
	const validated = validateConfig(TelemetryConfigSchema, raw);

	return {
		providers: validated.providers ?? {},
		events: validateEventAllowlist(validated.events),
		llmPayload: validated.llmPayload ?? "off",
		dispatcher: {
			maxQueueSize: validated.dispatcher?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
		},
	};
}

export function saveTelemetryConfig(config: TelemetryConfig): boolean {
	return saveJsonConfig(CONFIG_PATH, config);
}

/** Env-first, config-second resolution for Langfuse credentials. */
export function resolveLangfuseConfig(providerConfig: LangfuseConfig): LangfuseConfig {
	return {
		publicKey: readEnvVar("LANGFUSE_PUBLIC_KEY") || providerConfig.publicKey,
		secretKey: readEnvVar("LANGFUSE_SECRET_KEY") || providerConfig.secretKey,
		baseUrl: readEnvVar("LANGFUSE_BASE_URL") || providerConfig.baseUrl,
		environment: readEnvVar("LANGFUSE_TRACING_ENVIRONMENT") || providerConfig.environment,
		release: readEnvVar("LANGFUSE_RELEASE") || providerConfig.release,
	};
}

// ---------------------------------------------------------------------------
// Event allowlist helpers
// ---------------------------------------------------------------------------

/**
 * Filter a config-provided event list against the known kind set, warning on
 * unknown entries. Exported only for direct unit-test reach-in — not part of
 * the package barrel and not the supported public API.
 *
 * @internal
 */
export function validateEventAllowlist(events: "*" | string[] | undefined): "*" | TelemetryEventKind[] {
	if (events === undefined || events === "*") return "*";
	if (events.length === 0) return [];
	const valid = new Set<string>(TELEMETRY_EVENT_KINDS);
	const filtered: TelemetryEventKind[] = [];
	const rejected: string[] = [];
	for (const e of events) {
		if (valid.has(e)) filtered.push(e as TelemetryEventKind);
		else rejected.push(e);
	}
	if (rejected.length > 0) {
		console.warn(`[telemetry] unknown event kinds in config: ${rejected.join(", ")}`);
	}
	// All entries invalid → [] (allow none), preserving the I1 distinction
	// against undefined ("*", allow all).
	return filtered;
}

/** Check if a TelemetryEvent kind passes the config allowlist. */
export function isEventEnabled(kind: TelemetryEventKind, allowedEvents: "*" | TelemetryEventKind[]): boolean {
	if (allowedEvents === "*") return true;
	return allowedEvents.includes(kind);
}
