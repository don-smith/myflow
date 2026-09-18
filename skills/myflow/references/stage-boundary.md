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

| Subcommand | Required | Records |
|---|---|---|
| `enter` | `--stage`, `--activity`, `--workstream`, `--repository-root` | `stage-entered` and `activity-entered`. Creates the workstream on the first entry, which must be Scope. Completes an activity still open in the same attempt before opening the new one. Syncs. |
| `accept` | `--artifact <workstream-relative path>` | `artifact-accepted`, with the artifact's digest. |
| `exit` | `--feedback <smooth\|some-friction\|rough\|skipped\|pending>` | `feedback-requested` when the question was shown, the private feedback, `feedback-recorded`, `activity-completed`, and `stage-completed --terminal-reason advanced`. Syncs. |
| `return` | `--owning-stage`, `--owning-activity`, `--trigger-source`, `--change-kind` | `return-opened`, and with `--event`, the `return-rerouted`, `return-owner-ready`, `return-resumed`, and `return-closed` events. The episode ID is derived and reused. |

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
- An invalid transition is a real error: the command refuses it and records nothing. Fix
  the order, or record the missing event, rather than editing the journal.

## Host and session

The command records the host and the session identifier when the environment names them,
so a journal shows which agent and which session produced each event. An environment that
names neither simply carries no execution reference; nothing is guessed. The variables it
reads are listed in `scripts/lib/host-detection.mjs` and nowhere else, which keeps skill
text free of any one agent's spelling.
