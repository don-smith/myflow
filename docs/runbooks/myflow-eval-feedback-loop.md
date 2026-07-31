# MyFlow evaluation and feedback loop

MyFlow uses Langfuse as its observability **and evaluation** backend. Telemetry captures the complete agent tree (turns, generations, tools, sub-agents, and MyFlow checkpoints). At the end of a run, deterministic friction evaluators score the root `agent-run` observation.

## Setup

Set `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and optionally `LANGFUSE_BASE_URL` (the default is the Langfuse cloud endpoint). Enable the provider in telemetry config:

```json
{ "providers": { "langfuse": {} }, "llmPayload": "summary" }
```

The provider records scores named `myflow.friction-free` and `myflow.friction.<detector>`. Scores and evidence remain attached to the Langfuse observation and can be used in dashboards, filters, datasets, evaluation rules, and CI/experiment gates. No MLflow server or local summary file is required for scoring. The local summary provider is retained as a best-effort offline fallback for Close and development.

## Checkpoints

Skills should emit a checkpoint at artifact boundaries:

```ts
import { emitMyFlowCheckpoint } from "@myflow/telemetry";
emitMyFlowCheckpoint({ stage: "design", artifactKind: "design", artifactPath: "...", riskLevel: "medium" });
```

Use stages `alignment`, `research`, `design`, `plan`, `implement`, `validate`, `review`, and `close`. Checkpoints become observation metadata and are included in the missing-checkpoint evaluator.

## Built-in evaluators

| Evaluator | Signal | Default threshold |
|---|---|---|
| `tool_error_spike` | One tool repeatedly fails | 3 errors |
| `high_tool_churn` | Turns with excessive tool calls | 8 calls, 2 turns |
| `expensive_subagent` | Sub-agent duration or tool volume | 120s / 15 tools |
| `high_cost_artifact_ratio` | Run cost relative to artifacts | $0.50 |
| `long_session` | Excessive turns and tool calls | 20 turns / 60 calls |
| `missing_checkpoints` | Active run with no workflow checkpoints | 5 turns |

Scores are deterministic regression signals, not an LLM judge. For quality or correctness, create a Langfuse dataset from representative traces and attach an LLM-as-a-judge evaluator; keep those scores separate from operational friction scores. This makes it possible to compare prompts/models in Langfuse experiments without conflating reliability with answer quality.

## Close workflow

1. Open the run in Langfuse and inspect low/medium/high friction scores and evidence.
2. Filter by `myflow.friction-free = 0` and group by detector, stage, tool, model, or release.
3. Triage repeated findings: first sighting is feedback; repeated sightings become a skill, runbook, or prompt change.
4. Use Langfuse datasets and experiments for regression evaluation after a change. Set a CI threshold on `myflow.friction-free` and your quality scores before merging.
5. The optional `analyzeSession(sessionId)` API can inspect the offline summary when credentials are unavailable; it does not replace Langfuse scores.

## API

- `emitMyFlowCheckpoint(data)` — add workflow context.
- `analyzeSession` / `runAllDetectors` — offline deterministic evaluation.
- `scoreFrictionFindings` — publish findings as Langfuse scores (used automatically by the provider).

Never use `llmPayload: "full"` for sensitive prompts or tool results. Langfuse credentials are read from environment variables first and are never written to trace payloads.
