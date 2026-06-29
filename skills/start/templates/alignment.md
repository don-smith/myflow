---
date: {iso_timestamp}
author: {author}
commit: {commit}
branch: {branch}
repository: {repository}
topic: "{topic}"
status: ready
risk_level: low | medium | high
suggested_next_step: continue_to_research | continue_to_design | implement_directly | stop
tags: [alignment, stage-1]
last_updated: {iso_timestamp}
last_updated_by: {author}
---

# Alignment: {topic}

## Intent

What problem are we solving, and for whom?

## Desired Outcome

What changes when this succeeds?

## Non-Goals

What are we explicitly not doing?

## Risk Level

low | medium | high

## Risk Triggers

- ambiguous_intent: yes/no
- architecture_impact: yes/no
- external_dependency: yes/no

## Acceptance Criteria

- [ ] Concrete observable check or outcome.

## Decisions

- decision: {decision}
  source: user_provided | agent_inferred | deferred | evidence_confirmed
  rationale: {why}
  affects: stage_selection | scope | acceptance_criteria | risk | implementation

## Open Questions

- question: {question}
  status: answer_now | defer | infer | not_relevant
  notes: {notes}

## Suggested Next Step

continue_to_research | continue_to_design | implement_directly | stop

Rationale: {why this is the right next step}

## Replay / Telemetry

- pi_session_id:
- parent_session_id:
- telemetry_trace_id:
- conversation_log_ref:
- created_from_branch:
- created_worktree:
- restart_recommended: yes/no
- next_session_expected_in:

## Future-Stage Carry-Forward

Optional. Capture ideas that should inform later stages without expanding Stage 1 scope.

## References

- {input ticket, note, prior artifact, or repo file}
