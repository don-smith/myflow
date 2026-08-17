---
kind: myflow-design
workstream: "{workstream-id}"
stage: Plan
status: ready # in-progress | ready | blocked | complete | superseded
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: .myflow/repository-map.md
upstream:
  - "{alignment artifact path}"
related_artifacts:
  - "{research or specialist artifact paths}"
---

# Design: {topic}

## Design Objective

{The outcome and architectural question this design resolves.}

## Current Evidence

- `{path or source}` — {relevant finding, pattern, or constraint}

## Settled Direction

{The chosen solution shape and why it best fits the workstream and repository.}

## Alternatives Considered

- `{alternative}` — {why not selected}

## Module, Interface, and Seam Decisions

- {Module/interface/seam decision, relevant adapter/dependency, and rationale}

## Change Boundaries

### Building

- {What will change}

### Not Building

- {Explicit exclusion or deferred related change}

## Dependencies and Operational Consequences

- {Dependency, persistence, security, delivery, migration, or performance consequence; or `None`}

## Verification Intent

- {Acceptance criterion} → {observable behavior/seam and intended test/manual level}

## Implementation Slices

1. {Slice/phase name} — {small independently verifiable outcome}

## Open Questions and Blockers

- {None, or a question that blocks Plan}

## Context Checkpoint

- Status: `ready`
- Stage: `Plan`
- Updated: `{iso_timestamp}`

### Completed

- {Architectural direction and implementation-slice intent}

### Decisions

- {Decision} — {outcome and evidence}

### Working Set

- Current artifact: `{this design path}`
- Relevant files / sources: `{paths and why they matter}`
- Evidence and verification state: {what has been investigated; manual verification still to plan}

### Open Questions or Blockers

- {None, or blocker and owner}

### Next Action

Create the executable plan.

---

## Rehydration Manifest

### Read First

1. `.myflow/repository-map.md` — if present
2. `{workstream manifest path}` — full
3. `{alignment artifact path}` — full
4. `{this design and supporting artifacts}` — full

### Verify Current State

- `git status --short`

### Key Decisions to Preserve

- {Decision}: {outcome}

### Next Command

`/skill:plan {this design path}`
