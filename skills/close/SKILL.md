---
name: close
description: Use after a passing MyFlow Verify report to make proportionate closeout decisions, preserve continuity, and decide delivery with the developer.
argument-hint: "[validation-report-path | workstream path]"
disable-model-invocation: true
---

# Close

Close consumes Verify evidence; it does not repeat validation or force ceremonial work. Implementation phase commits already exist. Close alone may create a separate final closeout commit.

## Rehydrate

1. Run the resolver from the installed MyFlow package: `node ../myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`, resolving the script path relative to this installed `skills/close/SKILL.md`. Read its selected map when found.
2. Read `workstream.md`, the validation report, accepted plan, and current Git state. Do not trust only the validation report's top-level verdict. Follow its linked review artifact and read the review artifact before entering Close.
3. Confirm the linked review artifact exists, names the same accepted plan and implementation range or exact implementation scope as the validation report/checkpoint, contains the required review evidence, and has a passing review verdict. For commit-list review, require the exact scope spec and resolved commit set to match; range base/head alone is insufficient. Missing, failing, blocked, or mismatched review evidence prevents Close and returns to Verify or the recorded corrective owner.
4. Check every planned slice for its Plan, Implement, and passing Verify evidence, with applicable cumulative checks for the outcome. Confirm that the final Verify report covers all changes since the last correction. List unresolved journal observations separately from unresolved product work. Record an owner and destination for each substantive follow-up; leave incomplete journal recording visible as audit debt. Do not require an assessment, resolved episode, or audit-gap approval to do legitimate work or Close. Neither journal status nor an exception substitutes for passing Verify and linked review evidence.
5. Determine the closeout path: `<workstream-root>/<workstream-id>/close/<timestamp>_<topic>.md`.

## Stage boundary

Record this stage with `node ../myflow/scripts/stage-boundary.mjs`, run from this skill's folder. Pass `--repository-root <git-root>` on every subcommand — the same `<git-root>` resolved in step 1 — because the command otherwise records against its own working directory, which on an install is the skill folder rather than the target repository. It derives every idempotency key, writes the private stage feedback, and syncs the workstream; never write lifecycle JSONL directly.

- After the passing Verify handoff: `enter --stage Close --activity closeout --workstream <workstream-id> --repository-root <git-root>`.
- When the closeout summary is accepted: `accept --artifact <path>`. Report unresolved audit entries in the summary without treating them as permission checks.
- To end the workstream: ask the stage question, then `exit --feedback <answer> --terminal-reason workstream-closed`. That one call records the private stage pulse, `activity-completed`, `stage-completed`, and `workstream-closed` in order. Feedback failure blocks none of them.
- If Close discovers a defect or changed basis, record the finding, enter its owning stage, and run a fresh Verify before returning to Close. Do not close on unverified work.

Record a real wait with `stage-blocked` and `stage-unblocked` through `node ../myflow/scripts/lifecycle-journal.mjs`. Read `../myflow/references/stage-boundary.md` for the question wording and choices and what happens when a step fails. Preserve every earlier attempt and accepted artifact as history.

## Determine proportionate actions

With the developer, select only actions supported by Verify evidence or mapped repository policy:

- documentation/status update when product behavior or mapped policy requires it. Write or revise that documentation with `technical-writing`, including the closeout summary and the final commit message;
- learning capture, retrospective, or tabled follow-up only when an observation warrants it;
- changelog/release preparation only when delivery policy requires it;
- a closeout summary whenever close decisions, manual evidence, or follow-ups need to remain resumable.

Do not force a retro, memory edit, status rewrite, AGENTS edit, empty tabled file, branch operation, or integration action. Preserve unresolved follow-ups with a destination (new Scope, mapped backlog, learning artifact, or conscious drop).

## Closeout and delivery

Write/update the closeout summary with Verify verdict, per-slice and applicable cumulative checks, what shipped, applicable documentation/learning actions, outstanding manual evidence, final commit state, integration decision, and every follow-up destination. Report unresolved observations and journal failures honestly; do not claim a complete audit trail while one remains. Update `workstream.md` with the summary and next action.

If closeout changes exist, use `commit` for one distinct final closeout commit after developer approval. Phase commits are never folded into it. Ask the developer whether to push, merge, create a PR, keep the branch, or defer delivery; follow mapped policy when it exists. Do not infer an integration policy.

## Completion and correction

A complete workstream has a passing validation report, linked passing review evidence with valid provenance, a recorded delivery decision, and no unowned follow-up. If new evidence exposes an implementation defect, return to Implement; route plan/design/outcome changes to their owning stage and retain the summary as resumable evidence.
