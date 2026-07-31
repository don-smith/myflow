import type { ProvidersConfig } from "../config.js";
import { registerTelemetryProvider } from "../dispatcher.js";
import type { TelemetryProviderMeta } from "../types/provider.js";
import { CONSOLE_PROVIDER_META, ConsoleProvider } from "./console.js";
import { LANGFUSE_PROVIDER_META, LangfuseProvider } from "./langfuse/index.js";

export { CONSOLE_PROVIDER_META, ConsoleProvider } from "./console.js";
export { LANGFUSE_PROVIDER_META, LangfuseProvider } from "./langfuse/index.js";

/** Metadata catalog for the providers shipped with this package. */
export const BUILT_IN_PROVIDERS: readonly TelemetryProviderMeta[] = [LANGFUSE_PROVIDER_META, CONSOLE_PROVIDER_META];

/** Register every configured built-in provider before Pi event handlers attach. */
export function registerConfiguredProviders(config: { providers: ProvidersConfig }): void {
	const { providers } = config;
	if (providers.langfuse !== undefined) {
		registerTelemetryProvider(new LangfuseProvider(providers.langfuse));
	}
	if (providers.console !== undefined) {
		registerTelemetryProvider(new ConsoleProvider());
	}
}
