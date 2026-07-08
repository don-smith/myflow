# MyFlow Eval / Friction Feedback Loop

## How telemetry and eval work together to improve MyFlow

## Overview

MyFlow now has a **per-run friction detection system** that uses the existing telemetry event pipeline to capture workflow-context data and detect invisible friction — repeated tool errors, high-cost sessions, stalled stages, missing checkpoints, and other patterns the developer may not notice during a session.

The system has three layers:

1. **Checkpoint events** — explicit `myflow_checkpoint` events emitted at MyFlow stage boundaries
2. **Session summary collector** — an always-registered telemetry provider that accumulates deterministic metrics and persists a `SessionSummary` JSON at shutdown
3. **Friction reducer** — a set of detectors that analyze the summary and route findings to the personal repo tabled file during Close

---

## Data flow

```
Skill code              Telemetry pipeline              Disk / MLflow
───────────             ──────────────────              ─────────────
                        ┌──────────────────┐
emitMyFlowCheckpoint──▶ │ dispatchTelemetry │──▶ MLflow (workflow.* attrs)
                        │ Event()          │──▶ SessionSummaryProvider
                        │                  │     (accumulates metrics)
                        │ turn_end         │──▶ SessionSummaryProvider
                        │ tool_execution   │     (tracks errors, tokens)
                        │ subagent_*       │──▶ SessionSummaryProvider
                        │                  │     (tracks sub-agent cost)
                        └──────────────────┘
                                │
                          session_shutdown
                                │
                                ▼
                    SessionSummaryProvider.persist()
                    ─────────────────────────────
                    Writes .myflow/telemetry/sessions/<sessionId>.json
                    Contains: tool calls, tokens, sub-agents, checkpoints
                    Fast — no analysis, just counters
                                │
                          (after shutdown, during Close)
                                │
                                ▼
                    reportFrictionFindings(sessionId)
                    ────────────────────────────────
                    Reads SessionSummary JSON
                    Runs 7 detectors
                    Filters to medium/high findings
                    Appends to personal repo tabled file
                    (via repo-store.mjs state tabled)
```

---

## What happens at each MyFlow stage

### Stage 1 — Scope

**What the skill should do:** At the end of Stage 1, when the alignment artifact is written, emit a checkpoint:

```typescript
import { emitMyFlowCheckpoint } from "@myflow/telemetry";

emitMyFlowCheckpoint({
  stage: "alignment",
  artifactPath: ".myflow/artifacts/alignment/2026-07-01_17-23-03_myflow-eval-system.md",
  artifactKind: "alignment",
  riskLevel: "high",
  decisionCount: 5,
  restartRecommended: true,
});
```

**What's saved to disk:** Nothing stage-specific — telemetry dispatches the event to the MLflow provider and the `SessionSummaryProvider`. The summary provider records the checkpoint in its in-memory accumulator.

**What's published to MLflow:** A `workflow.stage = "alignment"` attribute (plus optional `workflow.artifact_path`, `workflow.risk_level`, `workflow.decision_count`) on the active agent-turn span.

**What events fire:** `myflow_checkpoint` — dispatched through the standard telemetry pipeline.

**Who listens:** `SessionSummaryProvider` (records the checkpoint for later analysis), `MlflowProvider` (writes span attributes).

### Stage 2 — Plan

**What the skill should do:** Emit checkpoints at each artifact boundary — after research, after design, after plan approval:

```typescript
emitMyFlowCheckpoint({ stage: "research", artifactPath: "...", artifactKind: "research" });
emitMyFlowCheckpoint({ stage: "design", artifactPath: "...", artifactKind: "design", decisionCount: 7 });
emitMyFlowCheckpoint({ stage: "plan", artifactPath: "...", artifactKind: "plan", riskLevel: "medium" });
```

**What's happening automatically:** The telemetry pipeline is also capturing:
- `tool_execution_end` events → tool error counts by name
- `turn_end` events → token usage, tool result counts, stop reason
- `subagent_completed` events → sub-agent duration, tool uses, completion status
- `subagent_failed` events → sub-agent failures

All of these are accumulated by the `SessionSummaryProvider` into the in-memory accumulator.

### Stage 3 — Implement

**What the skill should do:** Emit a checkpoint at the start or end of each implementation phase:

```typescript
emitMyFlowCheckpoint({ stage: "implement", artifactKind: "phase", riskLevel: "high" });
emitMyFlowCheckpoint({ stage: "implement", artifactKind: "phase", riskLevel: "medium" });
```

**What's happening automatically:** High tool churn during implementation (e.g., many `read`/`edit` loops) is captured as `turn_end.toolResultCount` → `highChurnTurnCount`. Tool errors from failed edits, compilations, or test runs are captured as `tool_execution_end.isError`.

### Stage 4 — Review

**What the skill should do:** Emit a checkpoint at validation:

```typescript
emitMyFlowCheckpoint({ stage: "validate", artifactKind: "validation" });
emitMyFlowCheckpoint({ stage: "review", artifactKind: "review", riskLevel: "low" });
```

### Stage 5 — Close

**This is where the friction reducer runs.** The Close skill should include a step that invokes the reducer:

```
1. Run the friction reducer:
   import { reportFrictionFindings } from "@myflow/telemetry/eval/close-integration";
   const count = reportFrictionFindings(sessionId);
   // count = number of findings routed to the tabled file

2. If findings were produced, the tabled file now has entries like:
   ## 2026-07-01 — Friction findings (session: abc123def456...)
   - Tool error spike (medium) — Tool "read" failed 5/15 times
   - High tool churn (medium) — 3 turns with 8+ tool calls each
   - Missing checkpoints (medium) — 10 turns with zero checkpoint events

3. Continue with the normal Close process:
   - Process tabled items (including the new friction findings)
   - Determine if any pattern is a "second sighting" → promote to skill, runbook, or memory
   - Commit, as-built documentation, retro
```

**What's saved to disk at shutdown:** The `SessionSummaryProvider` persists a JSON file to `.myflow/telemetry/sessions/<sessionId>.json` containing:

```json
{
  "sessionId": "abc123...",
  "durationMs": 120000,
  "turnCount": 25,
  "toolCallSummary": {
    "read": { "total": 30, "errors": 5 },
    "edit": { "total": 12, "errors": 3 },
    "grep": { "total": 8, "errors": 0 }
  },
  "highChurnTurnCount": 2,
  "subAgentSummary": {
    "totalCreated": 4,
    "totalDurationMs": 240000,
    "totalToolUses": 35
  },
  "tokenUsage": {
    "inputTokens": 45000,
    "outputTokens": 12000,
    "totalTokens": 57000,
    "costUsd": 0.35
  },
  "checkpoints": [
    { "stage": "alignment", "timestamp": 1000, "artifactKind": "alignment", "riskLevel": "high" },
    { "stage": "research", "timestamp": 5000, "artifactKind": "research" },
    { "stage": "design", "timestamp": 15000, "artifactKind": "design", "decisionCount": 7 }
  ]
}
```

**What's published to MLflow:** All standard telemetry spans (agent turns, tool spans, LLM spans, sub-agent spans) plus `workflow.*` attributes on the agent-turn span at each checkpoint.

---

## Detectors and thresholds

| Detector | What it looks for | Threshold | Severity |
|---|---|---|---|
| `detectToolErrorSpikes` | A single tool failing repeatedly | >= 3 errors | low/medium/high (>= 10 = high) |
| `detectHighToolChurn` | Turns with many tools | >= 2 high-churn turns (8+ tools each) | medium/high (>= 5 = high) |
| `detectExpensiveSubAgents` | Long or tool-heavy sub-agents | >= 120s duration OR >= 15 tool uses | low/medium/high (>= 300s = high) |
| `detectHighCost` | High estimated cost | >= $0.50 | medium/high (>= $1 = high) |
| `detectLongSession` | Many turns with many tools | >= 20 turns AND >= 60 total tool calls | medium/high (>= 40 turns = high) |
| `detectMissingCheckpoints` | Activity but no checkpoints | >= 5 turns with zero `myflow_checkpoint` events | medium |

---

## How to use the findings

The friction reducer routes findings to the personal repo tabled file. These are processed during the normal Close closeout:

1. **Review the tabled entries** — each finding has a severity, description, and evidence
2. **First sighting** — leave it tabled; wait for the pattern to repeat
3. **Second sighting** — promote to a skill, runbook, or memory entry via `capturing-learnings`
4. **Not actionable** — drop the entry

Example findings that might lead to improvements:

| Finding | Possible root cause | Action |
|---|---|---|
| `read` tool failed 5 times | File path guesswork, missing context | Add better file discovery guidance |
| 3 turns with 8+ tools each | Agent searching inefficiently | Improve context loading strategy |
| Agent sub-agent ran 5 minutes | Agent got stuck in research loop | Reduce sub-agent max turns |
| $0.85 cost, only 1 artifact | High cost for low output | Tune model selection or prompt strategy |
| 10 turns, zero checkpoints | Skills not calling `emitMyFlowCheckpoint` | Add checkpoint calls to stage skills |

---

## Implementation details

### New files

| File | Purpose |
|---|---|
| `packages/telemetry/types/events.ts` | Added `MyFlowCheckpointEvent` interface, union member, and `TELEMETRY_EVENT_KINDS` entry |
| `packages/telemetry/eval/types.ts` | `FrictionFinding`, `FrictionSeverity`, `FrictionType`, `SessionSummary` types |
| `packages/telemetry/checkpoint.ts` | `emitMyFlowCheckpoint()` public API |
| `packages/telemetry/instrumentation/session-summary.ts` | `SessionSummaryProvider` — always-registered telemetry provider |
| `packages/telemetry/eval/detectors.ts` | 7 friction detector functions |
| `packages/telemetry/eval/reducer.ts` | `analyzeSession()` and `analyzeAllSessions()` |
| `packages/telemetry/eval/close-integration.ts` | `reportFrictionFindings()` — routes to tabled file |

### Modified files

| File | Change |
|---|---|
| `packages/telemetry/index.ts` | Exports `emitMyFlowCheckpoint` and `MyFlowCheckpointData` |
| `packages/telemetry/instrumentation/index.ts` | Registers `SessionSummaryProvider` in `initInstrumentation()` |
| `packages/telemetry/providers/mlflow/attribute-events.ts` | Handles `myflow_checkpoint` → writes `workflow.*` attributes |
| `packages/telemetry/providers/mlflow/index.ts` | Routes `myflow_checkpoint` to `onAttributeEvent()` |
| `packages/telemetry/package.json` | `files` array covers new modules |

### Session summary storage

Session summaries are persisted to `.myflow/telemetry/sessions/<sessionId>.json` relative to the working directory. This follows the same `.myflow/` convention as artifacts and specs. The directory is gitignored (under `.myflow/`).

### MLflow trace attributes

All `myflow_checkpoint` events write the following attributes on the active agent-turn span:

| Attribute | Type | Always set? |
|---|---|---|
| `workflow.stage` | string | Yes |
| `workflow.artifact_path` | string | Only if `artifactPath` provided |
| `workflow.artifact_kind` | string | Only if `artifactKind` provided |
| `workflow.risk_level` | string | Only if `riskLevel` provided |
| `workflow.decision_count` | number | Only if `decisionCount` provided |
| `workflow.restart_recommended` | boolean | Only if `restartRecommended` provided |

---

## Next steps (not yet implemented)

The current implementation is the infrastructure. The next step is to integrate checkpoint calls into the MyFlow skills:

1. **`scope` skill** — emit checkpoint after alignment artifact is written
2. **`research` skill** — emit checkpoint after research artifact is written
3. **`design` skill** — emit checkpoint after design artifact is written
4. **`plan` skill** — emit checkpoint after plan artifact is written
5. **`implement` skill** — emit checkpoint at phase boundaries
6. **`validate` skill** — emit checkpoint after validation
7. **`close` skill** — add friction reducer step and process findings

These skill integrations are not yet implemented — the public API exists and is ready to be called.