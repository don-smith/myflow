# @myflow/telemetry

Langfuse observability and evaluation for [Pi Agent](https://github.com/badlogic/pi-mono). The extension instruments Pi lifecycle events, LLM generations, tool calls, agent turns, sub-agent runs, and MyFlow checkpoints. Events are dispatched asynchronously through a bounded queue so tracing never blocks the agent.

## Setup

Install the package in a Pi package, then configure Langfuse credentials with environment variables:

```bash
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_BASE_URL=https://cloud.langfuse.com # optional; use your region or self-hosted URL
```

The package requires Node.js 20 or newer and uses the Langfuse TypeScript SDK v5 (`@langfuse/tracing` and `@langfuse/otel`) with OpenTelemetry.

Alternatively, create `~/.myflow/config/telemetry/config.json`:

```json
{
  "providers": {
    "langfuse": {
      "publicKey": "pk-lf-...",
      "secretKey": "sk-lf-...",
      "baseUrl": "https://cloud.langfuse.com",
      "environment": "development",
      "release": "myflow-main"
    },
    "console": {}
  },
  "llmPayload": "summary",
  "dispatcher": {
    "maxQueueSize": 100
  }
}
```

Environment variables take precedence over configuration-file values. If either required key is missing, Langfuse tracing is disabled and events are dropped with a warning.

## Trace structure

- `agent-run` (`agent`) is the root observation for each Pi agent session.
- `agent-turn` (`chain`) contains the turn's tool calls and model generations.
- Tool observations use the Pi tool name and `tool` type.
- Assistant messages use `generate-response` (`generation`) with model, provider, token usage, and cost metadata when available.
- Sub-agent sessions are represented as agent observations in their own process and carry parent-session metadata when native cross-process context is unavailable.
- Session shutdown closes orphaned observations, drains the dispatcher, flushes Langfuse, and shuts down OpenTelemetry.

Payload capture defaults to `off`. Use `summary` for structural request/output metadata or `full` only when the prompts and responses are safe to send. The Langfuse span processor also redacts common bearer tokens, API keys, secrets, and token values before export.

Langfuse is the primary telemetry and evaluation backend. At run completion, built-in deterministic friction evaluators publish `myflow.friction-free` and `myflow.friction.*` scores on the root observation. Langfuse datasets, LLM-as-a-judge evaluators, experiments, and CI gates can then extend these operational checks with quality regression checks. A best-effort local session summary remains available for offline Close workflows when credentials are unavailable.

See the [Langfuse observability documentation](https://langfuse.com/docs/observability/sdk/typescript/overview) and [trace best practices](https://langfuse.com/docs/observability/best-practices).
