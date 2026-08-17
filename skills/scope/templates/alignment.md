---
kind: myflow-alignment
workstream: "{workstream-id}"
stage: Scope
status: ready # in-progress | ready | blocked | complete | superseded
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: {resolved repository-map path from resolve-repository-map.mjs}
upstream: []
related_artifacts:
  - "{workstream-manifest-path}"
planning_depth: lightweight # trivial-in-session | lightweight | full
suggested_next_action: "{skill and artifact path}"
---

# Alignment: {topic}

## Intent and Beneficiary

{What problem are we solving, and for whom?}

## Desired Outcome

{What changes when this succeeds?}

## Non-Goals

- {Explicitly out of scope}

## Acceptance Criteria

- [ ] {Concrete, observable outcome-level check}

## Classification and Risk

- Work type: `{feature | defect | technical debt | operational | documentation | other}`
- Risk level: `{low | medium | high}`
- `ambiguous_intent`: `{yes | no}`
- `architecture_impact`: `{yes | no}`
- `external_dependency`: `{yes | no}`
- Constraints: {relevant repository, delivery, or operational constraints}

## Selected Workflow Depth

`{lightweight | full}`

Rationale: {why this depth fits; state why a standalone design is or is not expected.}

## Selected Specialists

- `{skill | none}` — {question it must answer and its expected return artifact/action}

## Decisions

- decision: {decision}
  source: user_provided | agent_inferred | deferred | evidence_confirmed
  rationale: {why}
  affects: scope | acceptance_criteria | risk | stage_selection | implementation

## Open Questions and Blockers

- {question or blocker} — {owner / next action, or `None`}

## Suggested Next Action

`{exact specialist or plan command}`

Rationale: {why this is the next safe action}

## Evidence and References

- `{ticket, note, repository-map source, or narrow file inspected}` — {what it established}

## Context Checkpoint

- Status: `{ready | blocked}`
- Stage: `Scope`
- Updated: `{iso_timestamp}`

### Completed

- {Alignment outcome, acceptance criteria, risk, and depth are settled}

### Decisions

- {Decision} — {outcome and source/evidence}

### Working Set

- Current artifact: `{this alignment path}`
- Relevant files / sources: `{paths and why they matter}`
- Evidence and verification state: {what Scope observed; no implementation verification claimed}

### Open Questions or Blockers

- {Question or blocker} — {owner / next action, or `None`}

### Next Action

{Single next safe action.}

---

## Rehydration Manifest

### Read First

1. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` and read its selected map when `found`
2. `{workstream-manifest path}` — full
3. `{this alignment path}` — full
4. `{selected specialist evidence, if any}`

### Verify Current State

- `git status --short`

### Key Decisions to Preserve

- {Decision}: {outcome}

### Next Command

`{exact selected specialist or plan command}`
