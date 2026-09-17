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

1. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` and read its selected `repository-map.md` when `found`
2. `{current authoritative artifact}` — full
3. `{upstream or specialist artifacts needed for the next action}`

### Verify Current State

- `{git status / relevant command / condition}`

### Key Decisions to Preserve

- {Decision}: {outcome}

### Next Command

`{exact command, or describe the next human decision required}`

## Lifecycle and private feedback boundary

Record every real state change with `node <myflow-package-root>/skills/myflow/scripts/lifecycle-journal.mjs <mutation>`. Use the semantic subcommand and a stable `--idempotency-key`; never append to or edit `lifecycle/events.jsonl` directly. Keep the returned event and attempt IDs in the checkpoint. Record blocks with `stage-blocked` and `stage-unblocked`. Record correction detection, rerouting, owner readiness, downstream resumption, re-verification, and closure with the matching `return-*` and `verification-completed` subcommands. Preserve earlier attempts and accepted artifact events as history.

Ask once per eligible attempt: "Before we leave {stage}, how did this stage go from your point of view?" Offer exactly `smooth`, `some-friction`, `rough`, and `skip`. When the host exposes `ask_user_question`, use it for the structured interaction. Structured interaction is preferred; a plain-text question with the same wording and choices is the host-neutral fallback. For `some-friction` or `rough`, one optional one-sentence note may follow.

Write the response with `node <myflow-package-root>/skills/observing-myflow/scripts/record-stage-feedback.mjs`. This private CLI captures the MyFlow package version, Git commit when available, governing skill digest, lifecycle schema, and host capability at the attempt boundary. It stores the rating and note only in the workstream's `feedback/` folder. Send only `recorded`, `skipped`, or `pending` and the returned private reference to `lifecycle-journal.mjs feedback-recorded`; rating and note never enter the journal. Record `feedback-requested` only when the question was actually shown.

The pulse is non-blocking. A declined answer, unavailable interaction, or feedback write failure must not block the stage transition. Keep missing, pending, skipped, and recorded coverage distinct. If Implement ends without live interaction, record status pending and defer its one request to Verify entry.
