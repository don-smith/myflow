---
kind: myflow-onboarding-evaluation
status: pending # pending | complete
repository: {repository}
onboarding_report: {report_path}
repository_map: {resolved repository-map path from resolve-repository-map.mjs}
trace_or_session_ref: {trace_id_or_not_configured}
evaluated_at: {blank_until_complete}
evaluator: {blank_until_complete}
---

# MyFlow onboarding evaluation

Complete this after reviewing the resolved repository-map path or using it for a real Scope or Plan task. Scores support comparison across repository types; the evidence and free-text feedback explain them.

## Scorecard

| Dimension | Score (1–5) | Evidence |
|---|---:|---|
| Accuracy — facts, paths, and policies are correct; no unsupported assumptions | | |
| Coverage — downstream skills have the repository knowledge they need | | |
| Traceability — map entries point to their governing sources | | |
| Question efficiency — discovery preceded only material questions | | |
| Usability — a fresh session can operate from the map | | |
| Appropriate depth — effort fit this repository's size and maturity | | |

## What worked well

- {observation}

## Missing, incorrect, or unnecessarily difficult

- {observation, affected map field/skill, and evidence}

## Downstream evidence

- Task or stage used: `{Scope | Plan | other}`
- Did a downstream skill need to rediscover a mapped fact? `{yes/no}`
- If yes, what was missing, stale, or unclear?
- Did onboarding reveal a missing MyFlow capability? `{yes/no}`
- If yes, link or describe the capability gap.

## Telemetry and privacy review

- Trace/session reference: `{link or not configured}`
- Was telemetry permitted and appropriately scoped? `{yes/no/not applicable}`
- Sensitive data concern or follow-up: `{none or description}`

## Improvement decision

- `keep | revise map | revise onboard skill | add/adjust downstream skill | defer | drop`
- Owner / next action: {action}
- Link to tabled item, retro, learning, or issue: {path or `none`}
