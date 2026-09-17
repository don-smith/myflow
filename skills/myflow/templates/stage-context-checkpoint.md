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
- Lifecycle receipt: `{event ID and attempt ID for the latest real state change}`
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

Record every stage boundary with the MyFlow stage-boundary command (`stage-boundary.mjs` in the installed `myflow` skill): `enter` on entry, `accept` for each artifact the developer accepts, `exit` with the answer to the stage question before leaving, and `return` for a correction. The command derives every idempotency key and writes the private stage feedback; never invent a key, and never append to or edit `lifecycle/events.jsonl` directly. Keep the returned event and attempt IDs in the checkpoint.

Record blocks with `stage-blocked` and `stage-unblocked`, and re-verification with `verification-completed`, through the lifecycle journal CLI (`lifecycle-journal.mjs` in the installed `myflow` skill). Preserve earlier attempts and accepted artifact events as history.

The question wording, its four choices, the Implement deferral to Verify entry, what the private record captures, and the failure rules are stated once, in `stage-boundary.md` in the installed `myflow` skill's references folder.
