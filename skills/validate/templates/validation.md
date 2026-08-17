---
kind: myflow-validation
workstream: {workstream-id}
stage: Verify
status: ready
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: {resolved repository-map path from resolve-repository-map.mjs}
plan: {accepted plan path}
implementation_checkpoint: {checkpoint path or plan state}
---

# Validation: {workstream title}

## Verdict

`{pass | fail | blocked}` — {one-sentence basis}

## Criterion Coverage

| Acceptance criterion | Evidence / seam | Result |
|---|---|---|
| {criterion} | {command, inspection, or explicit exclusion} | {pass | fail | pending} |

## Automated Evidence

- `{command}` — {result}

## Review Evidence

- Review range: `{base}...{head}`
- Standards: `{pass | findings | unavailable}` — {evidence}
- Spec: `{pass | findings | unavailable}` — {evidence}

## Deviations and Defects

- {None, or deviation/defect and its owner}

## Manual Verification Brief

- `{not required | required}`
- {Developer steps and expected observation, or why no human check applies}

## Explicit Exclusions

- {exclusion and rationale, or None}

## Owner-Correct Next Action

`{ /skill:close | /skill:implement <plan> | /skill:plan <input> | /skill:design <input> | /skill:scope <input> }`

## Context Checkpoint

- Status: `{ready | blocked}`
- Stage: `Verify`
- Completed: {checks and review evidence}
- Resolved map: `{path}`
- Next action: {owner-correct handoff}

## Rehydration Manifest

1. Run `resolve-repository-map.mjs discover` and read the selected map when found.
2. Read this report, the accepted plan, `workstream.md`, and implementation checkpoint.
3. Check `git status --short` before taking the recorded next action.
