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
- Lifecycle receipt: `{canonical event and attempt ID, or provisional observation ID, cause, and next safe action; never claim a provisional entry}`
- Unresolved observations and verification work: `{finding, owner, evidence, checks to rerun, next action | none}`
- Planned slices: `{name and separate Plan, Implement, Verify evidence; applicable cumulative checks | none}`
- Feedback coverage: `{missing | pending | skipped | recorded}`; private reference: `{reference or none}`

### Open Questions or Blockers

- {Question or blocker} — {owner / next action, or `none`}

### Next Action

{The single next safe action.}

---

## Rehydration Manifest

### Read First

1. Run the MyFlow repository-map resolver (`resolve-repository-map.mjs` in the installed `myflow` skill) with `discover --cwd <git-root>` and read its selected `repository-map.md` when `found`
2. `{current authoritative artifact}` — full
3. `{upstream or specialist artifacts needed for the next action}`

### Verify Current State

- `{git status / relevant command / condition}`

### Key Decisions to Preserve

- {Decision}: {outcome}

### Next Command

`{exact command, or describe the next human decision required}`

## Lifecycle and private feedback boundary

Record boundaries with `stage-boundary.mjs` in the installed `myflow` skill: `enter`, `accept`, and `exit`. For a correction, record the finding and affected evidence in the artifact, call `correct --action note` when available, and `enter` the owning stage. Revisit the just-completed stage with `enter --new-attempt`. Never invent an idempotency key or edit `lifecycle/events.jsonl`. Keep receipts and journal failures in the checkpoint, but do not let recording failure stop needed work.

Record blocks and verification results with `lifecycle-journal.mjs` when available. Preserve earlier attempts and artifacts as history. After any correction, re-run affected work and fresh Verify before Close. At Close, report unresolved observations and journal debt without claiming they are resolved or asking the journal for permission.

The question wording, its four choices, the Implement deferral to Verify entry, what the private record captures, and the failure rules are stated once, in `stage-boundary.md` in the installed `myflow` skill's references folder.
