---
name: close
description: Use after a passing MyFlow Verify report to make proportionate closeout decisions, preserve continuity, and decide delivery with the developer.
argument-hint: "[validation-report-path | workstream path]"
---

# Close

Close consumes Verify evidence; it does not repeat validation or force ceremonial work. Implementation phase commits already exist. Close alone may create a separate final closeout commit.

## Rehydrate

1. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` and read the selected map when found.
2. Read `workstream.md`, the validation report, accepted plan, and current Git state. A failing/blocked report returns to its owner rather than entering Close.
3. Determine the closeout path: `<workstream-root>/<workstream-id>/close/<timestamp>_<topic>.md` (normally `.myflow/workstreams/<workstream-id>/close/`).

## Determine proportionate actions

With the developer, select only actions supported by Verify evidence or mapped repository policy:

- documentation/status update when product behavior or mapped policy requires it;
- learning capture, retrospective, or tabled follow-up only when an observation warrants it;
- changelog/release preparation only when delivery policy requires it;
- a closeout summary whenever close decisions, manual evidence, or follow-ups need to remain resumable.

Do not force a retro, memory edit, status rewrite, AGENTS edit, empty tabled file, branch operation, or integration action. Preserve unresolved follow-ups with a destination (new Scope, mapped backlog, learning artifact, or conscious drop).

## Closeout and delivery

Write/update the closeout summary with Verify verdict, what shipped, applicable documentation/learning actions, outstanding manual evidence, final commit state, integration decision, and every follow-up destination. Update `workstream.md` with the summary and next action.

If closeout changes exist, use `commit` for one distinct final closeout commit after developer approval. Phase commits are never folded into it. Ask the developer whether to push, merge, create a PR, keep the branch, or defer delivery; follow mapped policy when it exists. Do not infer an integration policy.

## Completion and correction

A complete workstream has a passing validation report, a recorded delivery decision, and no unowned follow-up. If new evidence exposes an implementation defect, return to Implement; route plan/design/outcome changes to their owning stage and retain the summary as resumable evidence.
