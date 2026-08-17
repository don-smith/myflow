---
kind: myflow-onboarding-report
status: complete # complete | needs-follow-up
repository: {repository}
run_at: {iso_timestamp}
run_by: {author_or_agent}
mode: initial # initial | refresh | missing-requirement
repository_map: {resolved repository-map path from resolve-repository-map.mjs}
evaluation_record: {evaluation_path}
telemetry_trace_id: {trace_id_or_not_configured}
---

# MyFlow onboarding report

## Purpose and scope

{Why this run was started and which repository/worktree was inspected. Include the resolved repository-map path. This is discovery only, not an architecture review.}

## Evidence inspected

| Source | What it established | Confidence |
|---|---|---|
| `{path}` | `{finding}` | confirmed | inferred | needs confirmation |

## Map changes

- {added, updated, preserved, or removed entry and why}

## Confirmed repository contract

- {operationally important conclusion; point to the repository map for current details}

## Material unknowns and decisions

- {unknown, why it matters, suggested owner/next action, and whether it blocks current intended work}

## Readiness

- Status: `ready | provisional | blocked`
- Safe next action: `{for example: /skill:scope ...}`
- Specialist recommended: `{none | domain-modeling | architecture-review | other}`
- Rationale: {why this level of readiness is appropriate}

## MyFlow capability gaps

- {A repository fact, policy, or condition that current MyFlow skills do not represent well. State the observed need and affected downstream skill; do not solve it here.}

## Evaluation handoff

- Evaluation record: `{evaluation_path}`
- Suggested time to evaluate: {after the next Scope or Plan task, or immediately for discovery quality}
- Telemetry: `{trace ID/link | not configured | not permitted}`
- Evaluation focus: accuracy, coverage, traceability, question efficiency, usability, appropriate depth

## Rehydration

1. Run `resolve-repository-map.mjs discover` and read the resolved repository-map path when found.
2. Read this report when its unknowns or capability gaps matter.
3. Refresh onboarding when a mapped source changes or downstream work exposes a gap.
