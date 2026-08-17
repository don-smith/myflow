---
kind: myflow-research
workstream: "{workstream-id}"
stage: Scope # Scope | Plan
status: ready # in-progress | ready | blocked | complete | superseded
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: .myflow/repository-map.md
upstream:
  - "{alignment or design artifact path}"
related_artifacts: []
---

# Research: {question}

## Question

{The decision or uncertainty this research must resolve.}

## Findings

- {Evidence-backed finding} — `{primary source or code path}`

## Implications

- Scope, design, or plan implication: {what should change or remain true}

## Confidence and Gaps

- {confirmed | inferred | unresolved} — {why}

## Recommended Return

`{Return to Scope | Continue to Design | Continue to Plan}`

Rationale: {why this is now the safest next action.}

## Context Checkpoint

- Status: `ready`
- Stage: `{Scope | Plan}`
- Updated: `{iso_timestamp}`

### Completed

- {Question investigated and evidence gathered}

### Decisions

- {Decision supported, if any} — {evidence}

### Working Set

- Current artifact: `{this research path}`
- Relevant files / sources: `{sources and why they matter}`
- Evidence and verification state: {research evidence only}

### Open Questions or Blockers

- {Question or `None`}

### Next Action

{Exact return action.}

---

## Rehydration Manifest

### Read First

1. `.myflow/repository-map.md` — if present
2. `{workstream manifest path}` — full
3. `{upstream artifact}` — full
4. `{this research artifact}` — full

### Verify Current State

- `git status --short`

### Next Command

`{exact Scope, Design, or Plan command}`
