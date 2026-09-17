---
name: verify
description: Use after Implement to verify an accepted MyFlow plan, collect review evidence, and produce a workstream-aware Verify report.
argument-hint: "<accepted-plan-path>"
---

# Verify

Verify execution against the supplied accepted plan. This is Stage 4; it consumes evidence and reports defects, not code changes.

## Rehydrate and inputs

1. Require a plan path, or locate the authoritative plan from the current `workstream.md`; do not search legacy flat artifact directories.
2. Run the resolver from the installed MyFlow package: `node ../myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`, resolving the script path relative to this installed `skills/verify/SKILL.md`. Read its selected map when found.
3. Read the plan, `workstream.md`, implementation checkpoint/phase commits, linked design evidence, and current Git state. Record the resolved map path.
4. Derive the report path as `<workstream-root>/<workstream-id>/verify/<timestamp>_<topic>.md` (normally `.myflow/workstreams/<workstream-id>/verify/`) and a separate review-artifact path in the same directory.

## Lifecycle entry and deferred Implement pulse

Use `node ../myflow/scripts/lifecycle-journal.mjs` with stable `--idempotency-key` values; never write lifecycle JSONL directly. Record `stage-entered --stage Verify --activity verification` on entry.

Before substantive Verify work, inspect lifecycle feedback coverage. If the completed Implement attempt is pending, show its one deferred question using the exact four choices in the shared stage checkpoint. Record `feedback-requested` with `--attempt-id <implement-attempt-id>`, then call `node ../myflow/scripts/record-stage-feedback.mjs` for that same Implement attempt. Record the result with `feedback-recorded --attempt-id <implement-attempt-id>` and only the returned status and private reference. Structured interaction is preferred and plain-text is the fallback. A feedback failure does not block verification or the stage transition; leave pending coverage visible and continue.

After deferred feedback, record `activity-entered --stage Verify --activity verification`. Switch to review by completing that activity, then recording `activity-entered --activity review`; complete every open activity before stage completion. Use `stage-blocked` and `stage-unblocked` for real blockers.

## Verify

- Use the plan's verification map and run its phase-defined automated commands as written.
- Inspect each completed phase against its outcome, commit/checkpoint evidence, deviations, and acceptance-criterion seam.
- Resolve the exact implementation scope from every phase and corrective-phase commit hash. When those commits are contiguous, use an exact implementation range: normally the base is the first implementation commit's parent and the head is the final implementation commit, producing `base..head`; if the first implementation commit has no parent, use `empty-tree..<final implementation commit>`. When an unrelated commit is interleaved, pass the ordered implementation commit IDs as an explicit comma-separated commit list so only named commits are reviewed. Confirm and record the exact scope spec; do not substitute an inferred branch comparison.
- Resolve `../code-review/SKILL.md` relative to this installed `skills/verify/SKILL.md`, read it, and execute it immediately in the current run. Pass that explicit scope form to code-review with the accepted plan as the spec. This is operational composition, not advice to invoke another slash command later.
- Save the review output as the separate review artifact. Record its accepted-plan path, exact scope spec, resolved commit set, orientation base and tip, review verdict, and review evidence required by the loaded code-review skill. For commit-list review, copy the exact scope spec and resolved commit set; range base/head alone is insufficient. Apply one deterministic mapping: confirmed P0/P1 produces validation verdict `fail`; missing mandatory scope or evidence, unavailable lane, or inconclusive verifier produces validation verdict `blocked`. Frontmatter status is `ready` only for `pass` and `blocked` for `fail` or `blocked`; a top-level validation pass cannot override review evidence.
- Prepare a manual-verification brief only when the plan names human-facing, external, or otherwise non-automatable checks. Mark it `not required` otherwise.
- Write one complete report using `templates/validation.md`: verdict, criterion coverage, automated evidence, linked review evidence, deviations, manual-verification brief, explicit exclusions, and owner-correct next action.

## Lifecycle completion and corrections

Record the Verify report with `artifact-accepted`, then record `verification-completed` with its actual status. After a passing re-verification, record `return-closed` for the active correction episode. Run the private Verify stage pulse once, complete the open activity, and use `stage-completed --terminal-reason advanced` only for a Close-ready result. Feedback failure remains non-blocking.

When evidence requires correction, record `return-opened` before `stage-completed --terminal-reason superseded`. Keep trigger source separate from ownership: outcome or acceptance routes to Scope/scope, architecture to Plan/design, an incorrect plan to Plan/planning, and an implementation defect to Implement/phase. Use `return-rerouted` if evidence changes that owner. Preserve prior attempts, accepted artifacts, and review reports as history. The owner records `return-owner-ready`; the first downstream stage records `return-resumed`.

## Corrective loops

An implementation defect returns to Implement. An incorrect or unexecutable plan returns to Plan. A changed architectural decision returns to Design. A changed outcome/acceptance criterion returns to Scope. Record the correction owner and re-run downstream verification after it is corrected.

## Lifecycle boundary, pending feedback, and private stage pulse

Use `node ../myflow/scripts/lifecycle-journal.mjs` for every real state change, always with a stable `--idempotency-key`; never write lifecycle JSONL directly. On Verify entry, record `stage-entered --stage Verify --activity verification`. Record real waits with `stage-blocked` and `stage-unblocked`. After the validation report and linked review artifact are accepted, record `artifact-accepted`, `verification-completed`, and `activity-completed`.

If a correction is needed, the detecting stage owns `return-opened`. Verify records a discovered defect with `return-opened` then `return-rerouted` when ownership shifts. An implementation defect routes to Implement/phase; an incorrect or unexecutable plan routes to Plan/planning; a changed architectural decision routes to Plan/design; a changed outcome or acceptance criterion routes to Scope/scope. When Verify re-enters after owner readiness, record `return-resumed`. When the re-verified attempt passes, record `return-closed`.

Request pending Implement feedback before substantive Verify work. Run the four-choice stage pulse from the shared stage checkpoint exactly once for the closed Implement attempt. This is the deferred request the Implement lifecycle documented. Record `feedback-requested` when the question is shown, then send only the status and its private reference through `feedback-recorded`. If live interaction is unavailable, record status pending and proceed. Feedback failure does not block verification or the stage transition.

After the validation verdict is ready, run the private stage pulse for the current Verify attempt. Write the response through `node ../myflow/scripts/record-stage-feedback.mjs`, then send only `recorded`, `skipped`, or `pending` and the private reference through `lifecycle-journal.mjs feedback-recorded`. The rating and note never enter the journal. Feedback failure does not block `stage-completed --terminal-reason advanced`. Preserve earlier attempts and accepted artifacts as history.

## Completion

Update `workstream.md` with the report path and verdict. A passing report hands off to `close` only when it links passing review evidence with matching plan and exact scope provenance; a failing or blocked report names the owning corrective stage. Do not require deleted helpers, retired validation skills, an issue tracker, or unavailable agents.
