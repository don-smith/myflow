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
2. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` and read its selected map when found.
3. Read the plan, `workstream.md`, implementation checkpoint/phase commits, linked design evidence, and current Git state. Record the resolved map path.
4. Derive the report path as `<workstream-root>/<workstream-id>/verify/<timestamp>_<topic>.md` (normally `.myflow/workstreams/<workstream-id>/verify/`).

## Verify

- Use the plan's verification map and run its phase-defined automated commands as written.
- Inspect each completed phase against its outcome, commit/checkpoint evidence, deviations, and acceptance-criterion seam.
- Invoke `code-review` with the implementation commit range and the plan as its spec input. Preserve separate Standards and Spec results. If standards or a usable spec are unavailable, report that fact rather than inventing a setup dependency.
- Prepare a manual-verification brief only when the plan names human-facing, external, or otherwise non-automatable checks. Mark it `not required` otherwise.
- Write one complete report using `templates/validation.md`: verdict, criterion coverage, automated evidence, review evidence, deviations, manual-verification brief, explicit exclusions, and owner-correct next action.

## Corrective loops

An implementation defect returns to Implement. An incorrect or unexecutable plan returns to Plan. A changed architectural decision returns to Design. A changed outcome/acceptance criterion returns to Scope. Record the correction owner and re-run downstream verification after it is corrected.

## Completion

Update `workstream.md` with the report path and verdict. A passing report hands off to `close`; a failing report names the owning corrective stage. Do not require deleted helpers, retired validation skills, an issue tracker, or unavailable agents.
