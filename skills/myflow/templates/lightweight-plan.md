---
kind: myflow-plan
workstream: "{topic}"
stage: Plan
status: ready # in-progress | ready | blocked | complete | superseded
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: {resolved repository-map path from resolve-repository-map.mjs}
upstream:
  - "{alignment artifact path, if any}"
related_artifacts: []
---

# {Topic} — Lightweight Plan

## Outcome and Acceptance Criteria

{Link or restate the outcome-level acceptance criteria from Scope.}

- [ ] {Observable outcome}

## Design Disposition

**Disposition:** `{locked into existing architecture | localized design}`

- Existing module/pattern or relevant architectural decision: `{path or source}`
- Interfaces, dependencies, data model, operational behavior, and patterns: `{unchanged | concise description of the localized change}`
- New pattern, seam, or specialist required: `{none | description and linked artifact}`

## Implementation

### Phase 1: {Name}

- Files / modules: `{paths}`
- Change: {small, executable description}
- Automated verification: `{commands or tests}`
- Manual verification: `{steps, owner, or not required}`

## Verification Map

| Acceptance criterion | Observable behavior or seam | Verification | Status |
|---|---|---|---|
| {criterion} | {behavior/seam} | `{test, command, or manual step}` | planned |

### Explicit Exclusions

- {Criterion or risk not tested} — {reason and follow-up, or `None`}

## Commit Strategy

Phase 1 is committed after its automated criteria and required repository checks are green. Required manual verification remains visible for Verify.

## Context Checkpoint

- Status: `ready`
- Stage: `Plan`
- Updated: `{iso_timestamp}`

### Completed

- {The settled outcome, design disposition, phase, and verification map}

### Decisions

- {Decision} — {outcome and source/evidence}

### Working Set

- Current artifact: `{this plan path}`
- Relevant files / sources: `{paths and why they matter}`
- Evidence and verification state: {planning evidence and manual checks pending}

### Open Questions or Blockers

- {Question or blocker} — {owner / next action, or `None`}

### Next Action

Begin implementation in a fresh session.

---

## Rehydration Manifest

### Read First

1. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` and read its selected map when `found`
2. `{this plan path}` — full
3. `{alignment and specialist artifacts needed for implementation}`

### Verify Current State

- `git status --short`

### Key Decisions to Preserve

- {Decision}: {outcome}

### Next Command

`/skill:implement {this plan path}`
