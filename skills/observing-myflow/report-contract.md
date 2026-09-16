# MyFlow observation report contract

## Contents

- Private account
- Private analysis
- Curated Close report
- Metric definitions
- Team-safe export
- Repository rollup
- Improvement hypotheses
- Evidence and privacy rules

## Storage

The collector resolves the repository's preferred personal global target and stores observation data at:

```text
~/.myflow/repositories/<identity>/observations/<workstream-id>/
```

`state.json`, `account.md`, `evidence/`, and `analysis/` remain private observer data. Curated reports and team-safe metrics use `curated/` beneath the same workstream observation directory. No observation file belongs in the target worktree.

## Private account

Maintain one cumulative `account.md` at the collector-provided private path. Each checkpoint adds an episode with:

```markdown
## E<n>: <episode name>

- Evidence window: <timestamps and entry IDs>
- Stage: <Scope | Plan | Implement | Verify | Close>
- Nested activity: <research | design | phase | review | other>
- Observable result: <durable outcome>
- Classification: <direct | supporting | verification | recovery | rework | peripheral | ambiguous>
- Corrections: <visible developer or verification correction>
- Backward flow: <detecting stage, owning stage, necessary learning | late discovery | process-induced | unclassified>
- Developer self-report: <source-qualified report or not captured>
- Process friction: <observed failed checks, corrections, returns, or not captured>
- Timing: <turnaround windows, unknown gaps, and open or completed return-loop duration>
- Confidence and missing evidence: <limits>

### Interpretation
<What may have helped or hindered flow.>

### Improvement hypothesis
<Change candidate, evidence needed across later runs, and expected comparison signal.>
```

Do not copy full prompts, source code, hidden thinking, credentials, or unrelated session content into the account.

## Private analysis v1

`myflow-observation-analysis/v1` is the interpretation boundary between factual evidence and a team-safe export. The observer writes it at finalize. The derivation command validates it and rejects invalid boundaries or stage intervals.

```json
{
  "schemaVersion": "myflow-observation-analysis/v1",
  "project": "repository identity or project key",
  "workstream": "workstream id",
  "startedAt": "2026-01-01T00:00:00.000Z",
  "closedAt": "2026-01-02T00:00:00.000Z",
  "boundarySemantics": "scope-to-close",
  "classification": {
    "risk": "recorded implementation risk",
    "depth": "recorded workflow depth",
    "flowItemType": "Feature"
  },
  "stageIntervals": [
    {
      "stage": "Scope",
      "startedAt": "2026-01-01T00:00:00.000Z",
      "endedAt": "2026-01-01T01:00:00.000Z"
    }
  ],
  "activeTimeMs": null,
  "waitTimeMs": null,
  "observableTurnaroundMs": null,
  "unknownGapMs": null,
  "executionFlow": {
    "reworkEpisodes": 0,
    "stageReturnCount": 0,
    "lateDiscoveryCount": 0,
    "returnLoopMs": null,
    "verificationLatencyMs": null,
    "processFriction": {}
  },
  "developerExperience": {
    "selfReport": null,
    "closeSatisfaction": null
  },
  "outcomes": {
    "verifyVerdict": "pass",
    "acceptedPhaseCount": 1,
    "toolSuccessRate": null
  },
  "versions": {
    "myflow": "unknown",
    "pi": "unknown"
  },
  "limitations": []
}
```

`boundarySemantics` is `scope-to-close` unless both timestamps represent value-stream entry and customer delivery, in which case it is `value-stream-to-customer`. Stage intervals use half-open ranges. They may repeat after backward flow, but each interval must have positive duration, stay within the workstream boundary, and never overlap another interval.

Flow Item type is `Feature`, `Defect`, `Debt`, `Risk`, or `Unknown`. Record `Unknown` when the workstream has no explicit type. Do not infer it from implementation risk or prose.

Developer experience accepts only explicit, source-qualified values:

```json
{ "value": "smooth", "source": "developer-report" }
```

Keep `selfReport` and `closeSatisfaction` separate and `null` when absent. `executionFlow.processFriction` contains aggregate non-negative counts or nullable measurements, not sentiment. `activeTimeMs` and `waitTimeMs` require adequate lifecycle classification; elapsed time, token volume, and tool volume are not substitutes.

## Curated Close report

Use these sections:

1. Observation boundary and source capabilities
2. Outcome and delivery snapshot
3. Episodic account
4. Stage and nested-activity accounting
5. Flow Framework contribution
6. Execution flow and AI economics
7. Developer experience and process friction
8. Corrections, backward transitions, rework, and low-yield intervals
9. What supported flow
10. Improvement hypotheses
11. Unknowns and measurement limits
12. Evidence index and team recommendation

Keep facts, interpretations, and hypotheses visibly separate. Cite session evidence by session ID plus entry ID, artifacts by repository-relative path and heading, Git by commit or explicit dirty-state snapshot, and verification by command and result already recorded by Verify.

## Metric definitions

### Flow Framework contribution

| Metric | Definition | Qualification |
|---|---|---|
| Scope-to-Close cycle time | Explicit MyFlow Scope start to recorded Close completion | A delivery-process measure for one workstream |
| Customer-centric Flow Time | Value-stream entry to customer delivery | `null` unless `boundarySemantics` explicitly names those boundaries |
| Flow Efficiency | Active time divided by active plus wait time | `null` unless both active and wait classifications have adequate evidence |
| Flow Item type | Feature, Defect, Debt, Risk, or Unknown | Explicit input only; never inferred from implementation risk or session text |
| Completion contribution | One completed item for a closed export | A rollup input, not single-item Velocity |
| Load interval | Explicit start and close timestamps | A rollup input, not repository Load by itself |

Scope-to-Close cycle time is not a synonym for customer-centric Flow Time. One begins at MyFlow Scope. The other begins when work enters the product value stream and ends at customer delivery. Keep both fields separate even when explicit boundaries make their durations equal.

### Execution flow

| Metric | Definition | Evidence qualification |
|---|---|---|
| Stage residence | Sum of explicit, non-overlapping intervals for a stage | Repeated intervals remain visible after stage returns |
| Observable turnaround | User entry to settled assistant entry within the boundary | Not active agent time |
| Unknown gap | Time between recorded entries without lifecycle classification | Duration is known; cause is not |
| Rework | Observable activity caused by a correction, failed check, or returned stage | Interpretive and reviewable |
| Stage-return count | Recorded backward transitions between MyFlow stages or owning activities | High when manifests and artifacts agree |
| Return-loop time | Blocking evidence to revised owner-stage readiness and resumed downstream work | Split unknown gaps from observed activity |
| Late-discovery count | Stage returns whose risk had a credible cheaper check in an earlier stage | Interpretive and reviewable |
| Verification latency | Implement completion to Verify completion | Requires explicit boundaries |
| Process friction | Aggregate failed checks, corrections, returns, or other recorded process signals | Never a developer sentiment score |

Never sum overlapping tool intervals as elapsed time. When exact spans become available, use interval unions. Report calendar residence and observed active spans separately.

### AI economics

Each assistant usage event preserves call count, provider, model, uncached input, cache read, cache write, output, reasoning, total tokens, and provider-recorded cost. Reasoning tokens are a subset dimension. Do not add them to output tokens or total tokens.

The derivation command includes events whose timestamps fall inside the half-open workstream boundary. It excludes precursor and subsequent-work usage. It assigns an included event to at most one stage interval. Calls between stage intervals remain visible as unassigned usage. Provider or model omissions use the `unknown` group.

Cost is never estimated. `recordedCostUsd` sums calls with provider-recorded cost. `costCoverage` gives recorded calls, missing calls, and their ratio. Assigned and unassigned recorded cost remain separate so stage attribution gaps are visible.

## Attempt economics

`myflow-attempt-economics/v1` derives stage intervals and repeated attempts from lifecycle events when a journal exists, preserving the artifact-timestamp fallback for pre-journal workstreams.

When a lifecycle journal exists at `<workstream-root>/lifecycle/events.jsonl`:
- Stage intervals come from `stage.entered`/`stage.completed` events.
- Correction episode intervals come from `return.opened` through `return.closed`.
- `stageReturnCount`, `activityReturnCount`, and `returnEpisodeCount` derive from episodes.

Observations are attributed to attempts using non-overlapping half-open lifecycle intervals. Per attempt: calls, token dimensions, recordedCostUsd, costCoverage, provider/model grouping, tools, errors. Reasoning tokens are a subset dimension. Unknown cost is `null`; never estimate it. Silence is not active work.

First-pass flow is a diagnostic. One-pass is not automatically better.

The derivation command accepts `--lifecycle <workstream-root>` to derive return summaries from lifecycle episodes. Explicit analysis values take precedence.

## Team-safe export v2

`myflow-team-flow/v2` replaces the old v1 team shape. Evidence and collector state remain at v1 because their additions are backward-compatible. The v2 export separates four layers:

- `flowFrameworkContribution` for one Flow Item's rollup inputs;
- `executionFlow` for MyFlow process diagnostics;
- `developerExperience` for direct self-report and Close satisfaction;
- `aiEconomics` for bounded usage, cost, grouping, and attribution coverage.

The derivation command is the only supported producer:

```bash
node scripts/derive-team-flow.mjs \
  --evidence <private-evidence-v1.json> \
  --analysis <private-analysis-v1.json> \
  --output <curated-team-flow-v2.json>
```

A v2 export has this shape:

```json
{
  "schemaVersion": "myflow-team-flow/v2",
  "analysisVersion": "myflow-observation-analysis/v1",
  "project": "repository identity or project key",
  "workstream": "workstream id",
  "classification": {
    "risk": "medium",
    "depth": "lightweight",
    "flowItemType": "Feature"
  },
  "boundaries": {
    "startedAt": "timestamp",
    "closedAt": "timestamp or null",
    "boundarySemantics": "scope-to-close",
    "intervalConvention": "half-open [startedAt, closedAt)"
  },
  "flowFrameworkContribution": {
    "flowItemType": "Feature",
    "completionContribution": 1,
    "loadInterval": { "startedAt": "timestamp", "closedAt": "timestamp or null" },
    "scopeToCloseCycleTimeMs": 0,
    "flowTimeMs": null,
    "efficiency": {
      "value": null,
      "activeTimeMs": null,
      "waitTimeMs": null,
      "coverage": "not-measured"
    }
  },
  "executionFlow": {
    "stageIntervals": [],
    "stageResidenceMs": {},
    "observableTurnaroundMs": null,
    "unknownGapMs": null,
    "reworkEpisodes": 0,
    "stageReturnCount": 0,
    "lateDiscoveryCount": 0,
    "returnLoopMs": null,
    "verificationLatencyMs": null,
    "processFriction": {},
    "returnEpisodeCount": null,
    "lifecycleSource": "inferred"
  },
  "developerExperience": {
    "selfReport": null,
    "closeSatisfaction": null
  },
  "aiEconomics": {
    "calls": 0,
    "uncachedInputTokens": 0,
    "cacheReadTokens": 0,
    "cacheWriteTokens": 0,
    "outputTokens": 0,
    "reasoningTokens": 0,
    "totalTokens": 0,
    "recordedCostUsd": null,
    "costCoverage": { "recordedCalls": 0, "missingCalls": 0, "ratio": null },
    "attribution": {
      "boundaryExcludedCalls": 0,
      "assignedCalls": 0,
      "unassignedCalls": 0,
      "assignedRecordedCostUsd": null,
      "unassignedRecordedCostUsd": null,
      "assignedCostCoverage": { "recordedCalls": 0, "missingCalls": 0, "ratio": null },
      "unassignedCostCoverage": { "recordedCalls": 0, "missingCalls": 0, "ratio": null }
    },
    "byStage": [],
    "byProviderModel": []
  },
  "outcomes": {
    "verifyVerdict": "unknown",
    "acceptedPhaseCount": 0,
    "toolSuccessRate": null
  },
  "versions": {},
  "limitations": []
}
```

A finalized export uses `completionContribution: 1` and a non-null `closedAt`. A compatible current export may use `completionContribution: 0`, `closedAt: null`, and null cycle, Flow Time, and efficiency values. Current exports contribute to Load, not completion metrics.

Do not include developer identity, raw prompts, response text, source code, commands, absolute paths, session filenames, credentials, or a developer-productivity score. Teams use flow and AI economics to diagnose the delivery system. Token volume, tool volume, model choice, and cost are not individual productivity measures.

## Repository rollup v1

`myflow-flow-rollup/v1` is a repository-level view over team-safe v2 exports. Run:

```bash
node scripts/rollup-flow-metrics.mjs \
  --target <worktree> \
  --window-start <timestamp> \
  --window-end <timestamp> \
  --output <private-path-outside-worktree>
```

The target form resolves the personal repository observation root. `--observation-root <path>` replaces `--target` for explicit fixtures and controlled overrides. The output must remain outside the target worktree.

### Selection and compatibility

The command scans `observations/<workstream>/curated/*-team-flow.json`. Filenames begin with the collector timestamp, so lexical order is export order. It selects the lexically latest valid `myflow-team-flow/v2` export per workstream. A later v1, malformed, or invalid v2 file does not hide an earlier compatible v2 file. The rollup reports scanned, compatible, selected, malformed, unsupported-schema, and invalid-v2 counts. It does not coerce v1 fields or expose private paths.

All selected exports must carry one project identity. A mixed-project root is rejected. This keeps the rollup repository-scoped.

### Reporting window and Flow Metrics

The reporting window is half-open. Velocity counts selected finalized items whose `closedAt` is in `[window-start, window-end)`. Distribution uses the same completed set and keeps Feature, Defect, Debt, Risk, and Unknown buckets. Its coverage states how many completed items have a known type. Unknown items are not guessed.

Historical Load is reconstructed from every selected load interval that intersects the reporting window. The history starts at `window-start`, applies starts and closes in timestamp order, and ends at `window-end`. Current Load is the value at `window-end`. Coverage says `includes-open-and-finalized-intervals` when a selected open export is available. Otherwise it says `finalized-intervals-only`, meaning finalized intervals only. Do not interpret that value as complete current work in progress.

Cycle time and canonical Flow Time have separate summaries and coverage. Cycle time is the MyFlow Scope-to-Close value. Canonical Flow Time includes only exports with explicit value-stream-to-customer boundaries. Flow Efficiency averages only non-null qualified values and reports measured and missing item counts. No rollup substitutes elapsed time or AI activity for missing active/wait evidence.

AI economics sum the same completed set used by Velocity. The rollup preserves each token dimension, provider/model groups, provider-recorded cost, and cost coverage. It does not estimate missing cost. These totals are delivery-system diagnostics, not individual productivity measures.

For longitudinal comparisons, keep the repository identity, window length, completion rule, and schema version fixed. Compare Velocity, Distribution, Load, time summaries, efficiency coverage, and economics together. A change in one metric alone does not establish an improvement or a cause.

## Improvement hypotheses

Every hypothesis states:

- observed pattern and evidence;
- plausible MyFlow skill, tool, or context cause;
- smallest candidate change;
- comparable future workstreams or fixtures;
- expected signal and quality guardrail;
- confidence and counterevidence.

Repeated evidence may be offered to `capturing-learnings`. A first occurrence is tabled or deliberately dropped.

## Evidence and privacy rules

The private account may point to detailed evidence but should remain concise. The private analysis contains explicit attribution and interpretation inputs. The curated report includes only the minimum excerpt needed to support a material claim. The team-safe export contains derived aggregate values only. Keep all four outside the target worktree. If personal observation-retention policy conflicts with these defaults, stop and ask before publishing more data.

## Normalized evidence contract

### myflow-normalized-evidence/v1

Versioned, source-neutral observation records produced by the official Langfuse Pi Adapter and the Pi JSONL recovery Adapter. Both emit the same contract so downstream consumers (correlation, economics, derivation) operate on a single shape.

A normalized observation row has:

- `source` ("langfuse-v2" or "pi-jsonl"), `sourceId`, `rowId` (source-prefixed stable identity).
- `traceId`, `parentObservationId` (physical tree).
- `type` (observation type string), `knownType` (boolean for recognized types), `name`.
- `startTime`, `endTime`.
- `isRootCapability`, `rootObservationId` (resolved physical root).
- `emittingSessionId` (native Pi session), `groupingSessionId` (Langfuse grouping session).
- `turnNumber`, `pluginName`, `pluginVersion`, `pluginCapability`.
- `provider`, `model`, `assistantIndex`, `callOrder` (derived or explicit), `toolCallId`.
- `level`, `statusMessage`, `state` (ok, error, cancelled, aborted).
- `usage` (uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens, reasoningTokens, totalTokens). Reasoning tokens are a subset dimension; outputTokens already include them.
- `cost` (recordedTotal), `costKnown` (boolean).
- `contextSources` (tracks own vs inherited for each propagated field).
- `provenance` (array of original source IDs).

Missing values are undefined, never zero. Unknown observation types (`knownType: false`) are preserved. Structural coverage (observed-complete, partial, unknown) is separate from delivery state (observed-within-window, timeout, late-visible, deadline-incomplete, unknown).

### Source adapters

**Langfuse Pi 0.1.2 Adapter** (`langfuse-pi-0.1.2-adapter.mjs`): dispatches on exact plugin version. Preserves the physical tree, root context, emitting/grouping sessions, traces, observations, parents, turns, assistant order, tool calls, provider/model, usage dimensions, provider-recorded cost, errors, aborts, compaction, branches, and unknown future types. Does not persist raw input/output by default.

**Pi JSONL Recovery Adapter** (`pi-jsonl-adapter.mjs`): extracts model-usage and tool-event entries from Pi session JSONL files. Emits the same normalized evidence contract for recovery and parity. Source capabilities: tool results present, persisted messages, but no exact lifecycle spans.

### Langfuse v2 reader

The reader (`langfuse-v2-reader.mjs`) queries `GET /api/public/v2/observations` with exact field groups (`core,basic,time,metadata,model,usage,metrics,trace_context`), full cursor chains for fixed windows, structured session filtering (required on self-hosted 4.1.0), and duplicate/conflict detection. Does not request `io` by default.

### Correlation contract

The correlation module (`correlate-attempts.mjs`) associates observations with lifecycle stage attempts using explicit execution references, canonical repository/worktree identity, artifact access, branch, session lineage, and bounded time. Auto-assigns exact or strong matches only. Medium matches are reviewable (status: ambiguous). Weak and conflicting matches remain unassigned. Preserves candidate count, reasons, confidence, assigned, ambiguous, unassigned, source-missing, and boundary-excluded coverage.

Identity-qualified Langfuse and JSONL parity passes before economics comparison. Unmatched evidence remains visible.

## Local stage review contract

### myflow-stage-review/v1

An evidence-based stage review recorded in the private observation tree:

```json
{
  "schemaVersion": "myflow-stage-review/v1",
  "reviewId": "rev_<sha256>",
  "createdAt": "ISO timestamp",
  "repository": { "kind": "origin", "value": "..." },
  "workstreamId": "workstream id",
  "attemptId": "stable attempt id",
  "attemptOrdinal": 1,
  "canonicalStage": "Scope",
  "revision": 1,
  "inputs": {
    "lifecycleEventCount": 3,
    "lifecycleLastEventId": "evt_...",
    "lifecycleDigest": "sha256",
    "artifactDigests": [{ "path": "...", "digest": "..." }],
    "feedbackStatus": "recorded",
    "feedbackRef": "private-ref"
  },
  "evaluator": {
    "evaluatorVersion": "0.1.0",
    "ruleSetVersion": "0.1.0"
  },
  "predicates": [
    { "id": "scope.outcome-defined", "result": "pass", "evidence": ["..."] }
  ],
  "outcome": "satisfied",
  "feedbackCoverage": "recorded",
  "returnAssessment": null,
  "limitations": ["mechanical section checks only"]
}
```

Predicate results are `pass`, `fail`, `unknown`, or `not-applicable`. Outcomes are `satisfied`, `unsatisfied`, `blocked`, `incomplete`, or `unknown`. Scope and Plan require recorded developer acceptance for `satisfied`.

### Return assessment

When `returnAssessment` is present, it records trigger source, change kind, nature, late-discovery tri-state, confidence, missing evidence, and counterevidence. Nature values: `necessary-learning`, `changed-intent`, `delivery-defect`, `external-change`, `process-induced`, `unclassified`. Late discovery: `true`, `false`, or `unknown`. Confidence: `high`, `medium`, `low`.

`lateDiscovery=true` requires the complete counterfactual contract: earliest detecting stage, concrete earlier check, required information, evidence it existed, expected signal, cost class (`lower`, `similar`, `higher`), false-positive risk, and quality guardrail. Without all fields, `lateDiscovery` must be `unknown`.

### Public projection

`myflow-stage-review-public/v1` is an allowlisted subset of the private review. It excludes: repository identity, input digests, evidence arrays, private references, return assessment details (missingEvidence, counterevidence, counterfactual free text), and full limitation text. Allowed fields: reviewId, createdAt, workstreamId, attemptId, attemptOrdinal, canonicalStage, revision, evaluator, predicate IDs and results only, outcome, feedbackCoverage, returnAssessment (nature, lateDiscovery, confidence only), and limitationCount.
