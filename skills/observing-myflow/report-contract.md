# MyFlow observation report contract

## Contents

- Private account
- Curated Close report
- Flow metric definitions
- Team-safe export
- Improvement hypotheses
- Evidence and privacy rules

## Storage

The collector resolves the repository's preferred personal global target and stores observation data at:

```text
~/.myflow/repositories/<identity>/observations/<workstream-id>/
```

`state.json`, `account.md`, and `evidence/` remain private observer data. Curated reports and team-safe metrics use `curated/` beneath the same workstream observation directory. No observation file belongs in the target worktree.

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
- Developer-reported friction: <reported experience or not captured>
- Timing: <turnaround windows, unknown gaps, and open or completed return-loop duration>
- Confidence and missing evidence: <limits>

### Interpretation
<What may have helped or hindered flow.>

### Improvement hypothesis
<Change candidate, evidence needed across later runs, and expected comparison signal.>
```

Do not copy full prompts, source code, hidden thinking, credentials, or unrelated session content into the account.

## Curated Close report

Use these sections:

1. Observation boundary and source capabilities
2. Outcome and delivery snapshot
3. Episodic account
4. Stage and nested-activity accounting
5. Flow metrics
6. Corrections, backward transitions, rework, and low-yield intervals
7. Developer-reported friction
8. What supported flow
9. Improvement hypotheses
10. Unknowns and measurement limits
11. Evidence index
12. Team recommendation

Keep facts, interpretations, and hypotheses visibly separate. Cite session evidence by session ID plus entry ID, artifacts by repository-relative path and heading, Git by commit or explicit dirty-state snapshot, and verification by command and result already recorded by Verify.

## Flow metric definitions

| Metric | Definition | JSONL confidence |
|---|---|---|
| Workstream flow time | First attributable Scope event to recorded Close completion | Medium unless boundaries are explicit |
| Stage residence | Explicit stage entry to explicit exit or next stage entry | Low to medium without lifecycle markers |
| Observable turnaround | User entry to settled assistant entry | Medium; not active agent time |
| Unknown gap | Time between recorded entries without a lifecycle classification | High duration, unknown cause |
| Rework | Observable activity caused by a correction, failed check, or returned stage | Interpretive |
| Stage-return count | Recorded backward transitions between MyFlow stages or owning activities | High when manifests and artifacts agree |
| Return-loop time | Blocking evidence to revised owner-stage readiness and resumed downstream work | Medium; split unknown gaps from observed activity |
| Late-discovery count | Stage returns whose risk had a credible cheaper check in an earlier stage | Interpretive and reviewable |
| Developer friction | Optional developer-reported smooth, noticeable, or draining experience plus note | Direct report, not a performance grade |
| Verification latency | Implement completion to Verify completion | Medium when artifacts record both boundaries |
| Flow load | Open workstreams at the observation cutoff | High from valid manifests |
| Flow velocity | Workstreams or accepted phases completed per reporting period | High with complete Close and commit records |
| Tool success rate | Successful recorded tool results divided by recorded tool results | High; not a quality score |
| Cost per accepted outcome | Recorded cost divided by accepted phases or criteria | Medium; provider usage may be incomplete |

Never sum overlapping tool intervals as elapsed time. When exact spans become available, use interval unions. Report calendar residence and observed active spans separately.

## Team-safe export

Write a versioned JSON object containing only approved derived data:

```json
{
  "schemaVersion": "myflow-team-flow/v1",
  "analysisVersion": "observing-myflow-v1",
  "project": "repository identity or project key",
  "workstream": "workstream id",
  "classification": { "risk": "recorded value", "depth": "recorded value" },
  "boundaries": { "startedAt": null, "closedAt": null },
  "flow": {
    "workstreamMs": null,
    "stageResidenceMs": {},
    "observableTurnaroundMs": null,
    "unknownGapMs": null,
    "reworkEpisodes": 0,
    "stageReturnCount": 0,
    "lateDiscoveryCount": 0,
    "returnLoopMs": null,
    "developerFriction": "not-captured",
    "verificationLatencyMs": null
  },
  "outcomes": {
    "verifyVerdict": "unknown",
    "acceptedPhaseCount": 0,
    "toolSuccessRate": null
  },
  "versions": {
    "myflow": "unknown",
    "pi": "unknown",
    "model": "unknown"
  },
  "limitations": []
}
```

Do not include developer identity, raw prompts, response text, source code, commands, absolute paths, session filenames, credentials, or a developer-productivity score. A team uses these metrics to improve the delivery system, not rank people.

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

The private account may point to detailed evidence but should remain concise. The curated report includes only the minimum excerpt needed to support a material claim. The team-safe export contains derived values only. Keep all three outside the target worktree. If personal observation-retention policy conflicts with these defaults, stop and ask before publishing more data.
