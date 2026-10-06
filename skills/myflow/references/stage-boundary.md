# Record stage boundaries

The stage artifacts decide what work is needed. The journal records what happened; it does not authorize stage moves. Use `scripts/stage-boundary.mjs` relative to this skill folder. Pass `--workstream <id> --stage <Scope|Plan|Implement|Verify|Close> --activity <activity> --repository-root <git-root>` on every call. Without `--repository-root`, an installed skill can record the wrong repository.

| Action | Command | Result |
|---|---|---|
| Start work in a stage | `enter` | Records a stage attempt and activity. A different open stage ends as `superseded` with pending feedback. Within Plan, `design` and `planning` share an attempt. |
| Revisit the stage just completed | `enter --new-attempt` | Starts a new attempt. The flag distinguishes a deliberate revisit from a retry of the prior entry. |
| Accept evidence | `accept --artifact <workstream-relative path>` | Records the file path and digest. The stage artifact, not the journal event, holds the decision. |
| Finish a stage | `exit --feedback <answer>` | Completes its open activity and attempt. Use `--terminal-reason superseded` for a correction when exiting explicitly. |
| Record a finding | `correct --action note --finding <text> --owner <name> --owning-stage <stage> --owning-activity <activity> --artifact <evidence path>` | Records the detecting attempt, intended owner, evidence path, and digest. For several findings in one file, add `--finding-selector <stable ID>` to each. It does not enter the owner stage. |

## Correct work without waiting for the journal

When evidence changes earlier work, update `workstream.md` and the owning artifact with the reason, owner, changed decision, affected evidence, and checks to rerun. Record the finding from the detecting stage, including after it ended. Design is an activity within Plan, not a canonical stage. For example, to return from Verify to Plan/design, run these commands from the installed `skills/myflow` folder after writing `verify/findings.md` in the workstream:

```sh
node scripts/stage-boundary.mjs correct --action note --stage Verify --activity verification --workstream traceable-corrections --repository-root /path/to/repo --owning-stage Plan --owning-activity design --finding "Architecture assumption changed" --owner "design owner" --artifact verify/findings.md
node scripts/stage-boundary.mjs enter --stage Plan --activity design --workstream traceable-corrections --repository-root /path/to/repo
```

Replace the workstream ID, repository root, finding, owner, and evidence path with your actual values. The evidence path is relative to the workstream; the detecting stage and activity identify the Verify attempt even if it has ended. Repeat returns as often as necessary; no correction episode, assessment, or resolution receipt is needed. To replace an open attempt in the same stage, exit it as `superseded`, then enter with `--new-attempt`. After the correction, run downstream work that the changed basis affects. Before Close, run fresh Verify against the final implementation and inspect its linked passing review evidence. A prior pass cannot verify later changes.

If a journal command fails, keep working from the authoritative artifacts. Record the failed command, error, and actual work in the workstream checkpoint; retry recording when practical. Do not claim an event succeeded, backdate an attempt, edit the JSONL, or erase the error. A failed journal write cannot waive fresh verification or passing review evidence. A malformed journal, unsafe path, or conflicting retry still reports an error; it is not a workflow veto.

Existing `return`, `correct --action observe|route|revise|ready|assess|resume|supersede|validate|pass|close|resolve`, `slice`, and `approve-audit-gap` commands remain for historical workstreams. Do not start new correction episodes or planned-slice state machines. A new planned slice starts with `enter --stage Plan --activity planning` after Verify; record its accepted Plan, Implement, Verify, and applicable cumulative evidence in the artifacts. Keep historical observations and episodes visible without treating unresolved bookkeeping as an automatic Close veto.

## Stage feedback

Ask once per completed attempt, just before `exit`:

> Before we leave {stage}, how did this stage go from your point of view?

Offer `smooth`, `some-friction`, `rough`, and `skip`. Use the structured-question capability in [capabilities.md](capabilities.md), or plain text if unavailable. For `some-friction` or `rough`, accept one optional sentence. Pass `skip` as `--feedback skipped`. The rating and note stay in the workstream's `feedback/` folder, which syncs with the developer's artifact store. Only coverage status reaches the lifecycle journal. Feedback or sync failure never blocks stage work.

When Implement ends without a live developer, use `--feedback pending` and continue to Verify. At Verify entry, ask the deferred Implement question once if interaction is available; otherwise leave it pending. The command records host and session when available. It derives idempotency keys, links events, and returns receipts; never invent keys or write JSONL by hand. `scripts/lifecycle-journal.mjs` records blocks and `verification-completed` when available. The Verify report is authoritative even if that journal write fails.
