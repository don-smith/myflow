# Stage boundaries

Every MyFlow stage records the same four things at its edges: that it started, what the
developer accepted, how it went, and that it finished. One command does all of it:
`scripts/stage-boundary.mjs` in this skill folder. A stage skill runs it from its own
folder as the sibling `myflow` skill's copy, passing only facts it already knows.

Every subcommand takes `--repository-root <git-root>`, naming the repository the work
belongs to. It is not optional in practice: the command falls back to its own working
directory, which on an installed MyFlow is the skill folder, so omitting it records the
workstream under MyFlow's own identity, or fails outright when the install is not a Git
repository. Pass the `<git-root>` the skill already resolved in its first step, the same
way `resolve-repository-map.mjs discover --cwd <git-root>` takes it.

The command derives each idempotency key from the workstream, the canonical stage, the
stage attempt, the owning activity, and the action. **A skill never invents a key**, and
never appends to `lifecycle/events.jsonl` by hand. Rerunning a command is safe: the
derived keys make the second run a duplicate rather than a second record. Each run prints
one JSON receipt naming every event, whether it was new, the feedback result, and the
sync result. Keep the returned event and attempt IDs in the stage checkpoint.

## Subcommands

The three stage facts travel with `--repository-root`, so every subcommand takes `--stage`,
`--activity`, `--workstream`, and `--repository-root`. The table lists only what each subcommand
requires on top of those four, and the stage skills' examples elide them the same way.

| Subcommand | Also required | Records |
|---|---|---|
| `enter` | — | `stage-entered` and `activity-entered`. Creates the workstream on the first entry, which must be Scope. Completes an activity still open in the same attempt before opening the new one. Syncs. |
| `accept` | `--artifact <workstream-relative path>` | `artifact-accepted`, with the artifact's digest. |
| `exit` | `--feedback <smooth\|some-friction\|rough\|skipped\|pending>` | `feedback-requested` when the question was shown, the private feedback, `feedback-recorded`, `activity-completed`, and `stage-completed --terminal-reason advanced`. Syncs. |
| `return` | `--owning-stage`, `--owning-activity`, `--trigger-source`, `--change-kind` | `return-opened`, and with `--event`, `return-rerouted`, `return-owner-ready`, `return-resumed`, and `return-closed`. Use `correct` for new intent-first routes. |
| `correct --action observe` | `--finding`, `--owner`, `--artifact` | Record a digested observation without a stage entry. Pass the detecting attempt's `--stage` and `--activity`; use `--source-attempt-id` only to identify the current or last terminal attempt. |
| `correct --action route` | `--finding`, `--owner`, `--artifact`, `--change-kind`, `--trigger-source` | Record intent first, then route to the owner if legal. `--observation-id` retries an existing observation. Other actions are `revise`, `ready`, `assess`, `resume`, `supersede`, `validate`, `pass`, `close`, and `resolve`. |
| `slice --stage Plan --activity planning` | `--slice`, `--artifact`, `--planning-basis`, `--scope-basis`, `--design-basis` | Start a named Plan attempt after a completed passing Verify, using accepted planning, Scope, and Design event IDs. |
| `approve-audit-gap --stage Close --activity closeout` | `--observation-id`, `--gap-name`, `--approved-by`, `--follow-up`, `--close-artifact-event` | Record explicit named owner approval against an unresolved observation and an accepted Close artifact event. The observation remains unresolved. |

Options that change what is recorded:

- `--label <name>` on `enter` names one activity among several of the same kind in one
  attempt. Implement passes the plan phase; other stages rarely need it.
- `--note <sentence>` on `exit` carries one optional sentence, allowed only with
  `some-friction` or `rough`.
- `--terminal-reason <advanced|superseded|abandoned|workstream-closed>` on `exit` replaces
  the default `advanced`. Verify uses `superseded` when evidence sends the work back;
  Close uses `workstream-closed`, which also records `workstream-closed`.
- `--host-capability <structured|plain-text|none>` records how the question was actually
  asked. It defaults to `plain-text` when an answer was given and `none` for `pending`.

## Receipts and recovery

A canonical receipt reports actual transition events and the current attempt. A provisional receipt reports an unresolved observation ID, its cause, pending obligations, and a next safe action; it does **not** assert entry into the intended stage. On a provisional route, continue authorized artifact work, project the unresolved observation in `workstream.md`, and retry with `--observation-id` when the route is legal. Never backdate an attempt or edit journal history. A conflicting retry fails; identical retries return the same event. Check the receipt's `sync` result and retry artifact sync if needed without discarding local events.

A correction routes by change kind: outcome or acceptance to Scope/scope, architecture to Plan/design, plan to Plan/planning, and implementation to Implement/phase. Record owner readiness after corrective work. Assess the detecting attempt's reusable evidence, invalidated evidence, and checks to rerun before `resume` or `supersede`. A child correction validates locally before the parent resumes. Pending Verify obligations remain visible and require fresh passing verification before child-first episode closure. A distinct finding, including one from a terminal detecting attempt, gets its own observation and route.

`correct --action resolve --observation-id <ID>` links later real transition event IDs, attempt IDs, and accepted artifact event IDs with `--linked-event`, `--linked-attempt`, and `--linked-artifact-event`. Resolution never changes the original observation or inserts missing boundaries. Do not resolve an observation merely because its artifact exists. A planned slice is not a correction: accept its detailed Plan, Implement evidence, and Verify evidence separately. Run applicable cumulative checks before final Close; a passing first slice does not verify later slices.

For an unresolved observation at Close, obtain named owner approval and a follow-up destination in the Close artifact before calling `approve-audit-gap`. Supply its accepted Close artifact event ID. This exception does not resolve the observation or waive passing Verify, applicable cumulative checks, or linked passing review evidence with matching plan and implementation scope. Without approval, do not exit Close as `workstream-closed`.

`scripts/lifecycle-journal.mjs` in this skill folder remains the low-level interface for
the events the boundary command does not own: `stage-blocked`, `stage-unblocked`, and
`verification-completed`. It uses explicit keys, so name the action and the attempt.

## The stage question

Ask once per eligible completed attempt, immediately before `exit`:

> Before we leave {stage}, how did this stage go from your point of view?

Offer exactly four choices: `smooth`, `some-friction`, `rough`, and `skip`. Ask through the
structured-question capability in [capabilities.md](capabilities.md) — structured
interaction is preferred where the host provides it, and a plain-text question with the
same wording and the same choices is the fallback. For `some-friction` or `rough`, one
optional one-sentence note may follow. Pass `skip` as `--feedback skipped`.

The rating and the note are private. They are written to the workstream's `feedback/`
folder together with the MyFlow package version, the Git commit when available, the
governing skill digest, the lifecycle schema version, and the host capability at the
attempt boundary. Only the coverage status and a private reference reach the lifecycle
journal; the rating and the note never enter the journal.

Private here means kept out of the lifecycle journal, not kept off the network. The
`feedback/` folder is part of the workstream and syncs with it, so a rating and note
reach the developer's own artifact remote like any other workstream file. Say so if the
developer asks what happens to the note. What never leaves the machine is configuration,
credentials, and raw observations.

## Implement's deferred question

Implement usually ends with no live developer to ask, so it exits with
`--feedback pending`. That records coverage as pending and shows nothing. Do not ask the
question during autonomous execution.

Verify's `enter` reports that pending request in its receipt as `pendingFeedback`, naming
the Implement attempt. Ask the question then, before substantive Verify work, and rerun
the same `enter` with `--feedback <answer>` to record it against that Implement attempt.
Verify's own pulse still happens at its own `exit`. If no live interaction is available at
Verify either, leave the request pending and continue; pending coverage stays visible.

Keep missing, pending, skipped, and recorded coverage distinct. They are different facts.

## When something fails

The pulse and the sync are both non-blocking.

- A declined answer, unavailable interaction, or failed feedback write must not block the
  stage transition. `exit` reports the failure in its receipt and still records
  `activity-completed` and `stage-completed`.
- A failed sync must not block anything either. It is reported in the receipt and left for
  `myflow artifacts status`, which lists the workstreams that have not reached the store.
- Invalid identities and conflicting retries are real errors: fix the input, not the journal.
  An unsupported authorized correction can still return a provisional observation receipt.

## Host and session

The command records the host and the session identifier when the environment names them,
so a journal shows which agent and which session produced each event. An environment that
names neither simply carries no execution reference; nothing is guessed. The variables it
reads are listed in `scripts/lib/host-detection.mjs` and nowhere else, which keeps skill
text free of any one agent's spelling.
