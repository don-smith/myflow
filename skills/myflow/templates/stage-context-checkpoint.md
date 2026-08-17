## Context Checkpoint

- Status: `{in-progress | ready | blocked | complete | superseded}`
- Stage: `{Scope | Plan | Implement | Verify | Close}`
- Updated: `{ISO timestamp}`

### Completed

- {What this stage has established or completed}

### Decisions

- {Decision} — {outcome and source/evidence}

### Working Set

- Current artifact: `{path}`
- Relevant files / sources: `{paths and why they matter}`
- Evidence and verification state: {checks run, results, manual checks pending, or explicit exclusions}

### Open Questions or Blockers

- {Question or blocker} — {owner / next action, or `none`}

### Next Action

{The single next safe action.}

---

## Rehydration Manifest

### Read First

1. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` and read its selected `repository-map.md` when `found`
2. `{current authoritative artifact}` — full
3. `{upstream or specialist artifacts needed for the next action}`

### Verify Current State

- `{git status / relevant command / condition}`

### Key Decisions to Preserve

- {Decision}: {outcome}

### Next Command

`{exact command, or describe the next human decision required}`
