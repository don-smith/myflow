# MyFlow observation report contract

## Contents

- Private account
- Private analysis
- Curated Close report
- Metric definitions
- Team-safe export
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
    "closedAt": "timestamp",
    "boundarySemantics": "scope-to-close",
    "intervalConvention": "half-open [startedAt, closedAt)"
  },
  "flowFrameworkContribution": {
    "flowItemType": "Feature",
    "completionContribution": 1,
    "loadInterval": { "startedAt": "timestamp", "closedAt": "timestamp" },
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
    "processFriction": {}
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

Do not include developer identity, raw prompts, response text, source code, commands, absolute paths, session filenames, credentials, or a developer-productivity score. Teams use flow and AI economics to diagnose the delivery system. Token volume, tool volume, model choice, and cost are not individual productivity measures.

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
