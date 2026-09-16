---
name: validate
description: Use after Implement to verify an accepted MyFlow plan, collect review evidence, and produce a workstream-aware Verify report.
argument-hint: "<accepted-plan-path>"
shell-timeout: 10
---

# Validate

Verify execution against the supplied accepted plan. This is Stage 4; it consumes evidence and reports defects, not code changes.

## Rehydrate and inputs

1. Require a plan path, or locate the authoritative plan from the current `workstream.md`; do not search legacy flat artifact directories.
2. Run the resolver from the installed MyFlow package: derive the package root from this loaded skill's absolute location, run `node <myflow-package-root>/skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`, and read its selected map when found.
3. Read the plan, `workstream.md`, implementation checkpoint/phase commits, linked design evidence, and current Git state. Record the resolved map path.
4. Derive the report path as `<workstream-root>/<workstream-id>/verify/<timestamp>_<topic>.md` (normally `.myflow/workstreams/<workstream-id>/verify/`) and a separate review-artifact path in the same directory.

## Verify

- Use the plan's verification map and run its phase-defined automated commands as written.
- Inspect each completed phase against its outcome, commit/checkpoint evidence, deviations, and acceptance-criterion seam.
- Resolve the exact implementation range from the phase commit hashes: the base is the first implementation commit's parent and the head is the final implementation commit. Confirm both revisions and record them; do not substitute an inferred branch comparison.
- Resolve `../code-review/SKILL.md` relative to this installed `skills/validate/SKILL.md`, read it, and execute it immediately in the current run. Supply the exact implementation range and the accepted plan as the spec. This is operational composition, not advice to invoke another slash command later.
- Save the review output as the separate review artifact. Record its accepted-plan path, range base and head, review verdict, and review evidence required by the loaded code-review skill. Missing review output, missing provenance, or a non-passing review makes Verify `fail` or `blocked`; a top-level validation pass cannot override it.
- Prepare a manual-verification brief only when the plan names human-facing, external, or otherwise non-automatable checks. Mark it `not required` otherwise.
- Write one complete report using `templates/validation.md`: verdict, criterion coverage, automated evidence, linked review evidence, deviations, manual-verification brief, explicit exclusions, and owner-correct next action.

## Corrective loops

An implementation defect returns to Implement. An incorrect or unexecutable plan returns to Plan. A changed architectural decision returns to Design. A changed outcome/acceptance criterion returns to Scope. Record the correction owner and re-run downstream verification after it is corrected.

## Completion

Update `workstream.md` with the report path and verdict. A passing report hands off to `close` only when it links passing review evidence with matching plan and range provenance; a failing or blocked report names the owning corrective stage. Do not require deleted helpers, retired validation skills, an issue tracker, or unavailable agents.
