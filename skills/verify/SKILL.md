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
4. Derive the report path as `<workstream-root>/<workstream-id>/verify/<timestamp>_<topic>.md` and a separate review-artifact path in the same directory.

## Stage boundary

Record this stage with `node ../myflow/scripts/stage-boundary.mjs`, run from this skill's folder. Pass `--repository-root <git-root>` on every subcommand — the same `<git-root>` resolved in step 2 — because the command otherwise records against its own working directory, which on an install is the skill folder rather than the target repository. It derives every idempotency key, writes the private stage feedback, and syncs the workstream; never write lifecycle JSONL directly.

- On entry: `enter --stage Verify --activity verification --workstream <workstream-id> --repository-root <git-root>`. Its receipt reports pending Implement feedback. Ask that one deferred question before substantive Verify work, then rerun the same `enter` with `--feedback <answer>` to record it against the Implement attempt. Feedback failure does not block verification or the stage transition; leave pending coverage visible and continue.
- Switching to review: `enter --stage Verify --activity review --workstream <workstream-id> --repository-root <git-root>`, which completes the verification activity and reuses the open Verify attempt.
- When the validation report and the linked review artifact are accepted: `accept --artifact <path>` for each.
- Before leaving Verify: ask the stage question, then `exit --feedback <answer>`. Use `--terminal-reason superseded` when evidence sends the work back instead of forward.
- For a correction: `return`. Verify records `--event closed` after a passing re-verification.

Record `verification-completed` with its actual status, and any real wait with `stage-blocked` and `stage-unblocked`, through `node ../myflow/scripts/lifecycle-journal.mjs`. Read `../myflow/references/stage-boundary.md` for the question wording and choices, the deferral rule, and what happens when a step fails. Preserve prior attempts, accepted artifacts, and review reports as history.

## Verify

- Use the plan's verification map and run its phase-defined automated commands as written.
- Inspect each completed phase against its outcome, commit/checkpoint evidence, deviations, and acceptance-criterion seam.
- Resolve the exact implementation scope from every phase and corrective-phase commit hash. When those commits are contiguous, use an exact implementation range: normally the base is the first implementation commit's parent and the head is the final implementation commit, producing `base..head`; if the first implementation commit has no parent, use `empty-tree..<final implementation commit>`. When an unrelated commit is interleaved, pass the ordered implementation commit IDs as an explicit comma-separated commit list so only named commits are reviewed. Confirm and record the exact scope spec; do not substitute an inferred branch comparison.
- Resolve `../code-review/SKILL.md` relative to this installed `skills/verify/SKILL.md`, read it, and execute it immediately in the current run. Pass that explicit scope form to code-review with the accepted plan as the spec. This is operational composition, not advice to invoke another slash command later.
- Save the review output as the separate review artifact. Record its accepted-plan path, exact scope spec, resolved commit set, orientation base and tip, review verdict, and review evidence required by the loaded code-review skill. For commit-list review, copy the exact scope spec and resolved commit set; range base/head alone is insufficient. Apply one deterministic mapping: confirmed P0/P1 produces validation verdict `fail`; missing mandatory scope or evidence, unavailable lane, or inconclusive verifier produces validation verdict `blocked`. Frontmatter status is `ready` only for `pass` and `blocked` for `fail` or `blocked`; a top-level validation pass cannot override review evidence.
- Prepare a manual-verification brief only when the plan names human-facing, external, or otherwise non-automatable checks. Mark it `not required` otherwise.
- Write one complete report using `templates/validation.md`: verdict, criterion coverage, automated evidence, linked review evidence, deviations, manual-verification brief, explicit exclusions, and owner-correct next action.

## Corrective loops

An implementation defect returns to Implement. An incorrect or unexecutable plan returns to Plan. A changed architectural decision returns to Design. A changed outcome/acceptance criterion returns to Scope. Record the correction owner and re-run downstream verification after it is corrected.

## Completion

Update `workstream.md` with the report path and verdict. A passing report hands off to `close` only when it links passing review evidence with matching plan and exact scope provenance; a failing or blocked report names the owning corrective stage. Do not require deleted helpers, retired validation skills, an issue tracker, or unavailable agents.
