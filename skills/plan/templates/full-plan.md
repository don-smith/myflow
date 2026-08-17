---
kind: myflow-plan
workstream: "{workstream-id}"
stage: Plan
status: ready # in-progress | ready | blocked | complete | superseded
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: .myflow/repository-map.md
upstream:
  - "{alignment artifact path}"
  - "{design artifact path, when used}"
related_artifacts:
  - "{research and specialist artifacts}"
---

# {Topic} — Implementation Plan

## Outcome and Acceptance Criteria

- [ ] {Observable outcome from Scope}

## Design Disposition

**Disposition:** `structural design required`

- Design artifact: `{path}`
- Settled direction: {summary}
- Interfaces, seams, dependencies, and operational consequences: {summary}

## Implementation Phases

### Phase 1: {Name}

- Outcome: {independently useful, verifiable result}
- Files / modules: `{paths}`
- Changes: {executable description}

#### Automated Verification

- [ ] {command or test}

#### Manual Verification

- [ ] {human check, owner, or `Not required`}

## Verification Map

| Acceptance criterion | Observable behavior or seam | Test level | Test location / command | Status |
|---|---|---|---|---|
| {criterion} | {behavior/seam} | `{unit | integration | contract | e2e | manual}` | `{path, test name, command, or step}` | planned |

### Explicit Exclusions

- {Criterion or risk not tested} — {reason and follow-up, or `None`}

## Commit and Delivery Strategy

Each completed phase is committed after its automated criteria and required repository checks are green. Manual verification remains visible for Verify. {Repository-specific integration constraints.}

## Context Checkpoint

- Status: `ready`
- Stage: `Plan`
- Updated: `{iso_timestamp}`

### Completed

- {Accepted phases and verification map}

### Decisions

- {Decision} — {outcome and evidence}

### Working Set

- Current artifact: `{this plan path}`
- Relevant files / sources: `{paths and why they matter}`
- Evidence and verification state: {planned checks and manual checks pending}

### Open Questions or Blockers

- {None — a ready plan has no material open question}

### Next Action

Start implementation in a fresh session.

---

## Rehydration Manifest

### Read First

1. `.myflow/repository-map.md` — if present
2. `{workstream manifest path}` — full
3. `{this plan path}` — full
4. `{design and specialist artifacts needed for implementation}`

### Verify Current State

- `git status --short`

### Key Decisions to Preserve

- {Decision}: {outcome}

### Next Command

`/skill:implement {this plan path}`
