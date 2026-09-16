---
name: implement
description: Use when executing an accepted MyFlow implementation plan phase by phase in a fresh or resumed implementation session.
argument-hint: "<accepted-plan-path>"
disable-model-invocation: true
---

# Implement

Execute only an accepted plan. The orchestrator works autonomously through every phase, but it does not implement phases itself: exactly one fresh-context implementation subagent owns each phase. Run those children sequentially so each gets a clean context while their concise completion summaries preserve only the state needed to begin the next phase.

## Rehydrate

1. Run the resolver from the installed MyFlow package, not from the target checkout: `node <myflow-package-root>/skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`. Derive `<myflow-package-root>` from this loaded skill's absolute location (the directory above `skills/`); read the selected map when found.
2. Read the accepted plan, `workstream.md`, linked design/specialist evidence, and `git status --short`.
3. Confirm the plan is `ready`, identify the first incomplete phase or an authorized corrective phase, and record the resolver-selected map path in the implementation checkpoint.

When failed Verify returns an implementation defect after all original phases are complete, create one bounded corrective phase from the linked findings. A fresh-context implementation subagent owns the corrective phase. The parent delegates it fresh; after the corrective phase is green, commit it, update the plan and workstream checkpoints, and immediately rerun complete Verify.

## Per-phase delegation loop

For every incomplete phase, create exactly one fresh-context implementation subagent, sequentially. Do not implement a phase directly in the orchestrator, combine phases in one child, or merely describe a delegation that you do not launch.

1. Give the child the accepted-plan path, its one phase's scope and success criteria, linked evidence, resolver-selected map path, current checkpoint and Git state, and phase-commit authority. It owns the entire phase: follow the test-first seam, make only phase changes, run every automated criterion and required repository check, keep manual verification visible, create the atomic phase commit via `commit` when green, and update the checkpoint.
2. Require a concise completion summary containing: phase outcome; changed files; commands and automated evidence; commit hash; checkpoint path/update; deviations; outstanding manual verification; current Git state; and next-phase or Verify readiness. The checkpoint records the same durable facts, including the resolved map path.
3. Consume that completion summary, then immediately launch the fresh-context child for the next incomplete phase. Do not stop for a progress report, confirmation, or context re-reading between green phases.
4. The phase child fixes an implementation defect within its approved phase. If it finds the plan unexecutable/incorrect, return to Plan; if architecture or outcome changed, return to Design or Scope. Record the reason and do not conceal a correction as a completed phase.

## Lifecycle boundary and deferred feedback

Use `node <myflow-package-root>/skills/myflow/scripts/lifecycle-journal.mjs` for every real state change, always with a stable `--idempotency-key`; never write lifecycle JSONL directly. On Implement entry, record `stage-entered --stage Implement --activity phase`. Around each plan phase, record `activity-entered` and `activity-completed`; record accepted checkpoint artifacts with `artifact-accepted`. Use `stage-blocked` and `stage-unblocked` for real blockers. Preserve completed attempts, phase commits, and accepted artifacts as history.

If a defect routes work back, the detecting stage owns `return-opened`; Implement records `return-owner-ready` only after the corrective phase is green. A changed plan or architecture uses `return-rerouted` to the canonical owner. When downstream execution resumes after owner readiness, record `return-resumed` at the first affected stage.

After the last phase activity completes, handle the private stage pulse before `stage-completed --terminal-reason advanced`. When Implement ends without live developer interaction, run `record-stage-feedback.mjs` with `--status pending --host-capability none`, then send only status pending and its private reference through `lifecycle-journal.mjs feedback-recorded`. Do not show a question during autonomous execution. Verify asks once at entry. If live interaction is already available, use the shared four-choice pulse instead. Feedback failure does not block the stage transition or entry to Verify.

## Enter Verify automatically

After the final green phase commit, update `workstream.md` to make the accepted plan and implementation checkpoint the authoritative Verify input. Continue in the same parent session: resolve `../validate/SKILL.md` relative to this installed `skills/implement/SKILL.md`, read it, and execute its instructions immediately with the accepted-plan path. Proceed without developer action and do not stop after printing a command.

`/skill:validate <accepted-plan-path>` is recovery/rehydration only, for a new session resuming an interrupted transition. It is not the normal Implement-to-Verify gate.

Verify writes its report under `<workstream-root>/workstreams/<workstream-id>/verify/` when the mapped workstream root is not already the repository root (normally `.myflow/workstreams/<workstream-id>/verify/`). It owns validation, linked review evidence, and the conditional manual-verification brief. Do not create the final closeout commit in Implement.

## Guardrails

- Do not start from a flat legacy artifact path or an absent helper script.
- Do not invoke `code-review` as an implementation gate; Verify owns it.
- Do not stop after a green phase: consume its completion summary and continue to the next incomplete phase or Verify.
- Do not expand scope without returning the decision to its owning stage.
