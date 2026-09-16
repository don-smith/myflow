---
kind: myflow-validation
workstream: {workstream-id}
stage: Verify
status: {ready for pass; blocked for fail or blocked}
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: {resolved repository-map path from resolve-repository-map.mjs}
plan: {accepted plan path}
implementation_checkpoint: {checkpoint path or plan state}
---

# Validation: {workstream title}

Apply this mapping exactly: confirmed P0/P1 produces validation verdict `fail`; missing mandatory scope or evidence, unavailable lane, or inconclusive verifier produces validation verdict `blocked`. Frontmatter status is `ready` only for `pass` and `blocked` for `fail` or `blocked`.

## Verdict

`{pass | fail | blocked}` — {one-sentence basis}

## Criterion Coverage

| Acceptance criterion | Evidence / seam | Result |
|---|---|---|
| {criterion} | {command, inspection, or explicit exclusion} | {pass | fail | pending} |

## Automated Evidence

- `{command}` — {result}

## Review Evidence

- Review artifact: `{path to separate review artifact}`
- Accepted plan: `{accepted plan path recorded by review}`
- Review scope strategy: `{explicit-range | commit-list | other strategy}`
- Review scope spec: `{exact input passed to review-range.mjs}`
- Review resolved commit set: `{ordered comma-separated full commit IDs for commit-list, or n/a}`
- Review range base: `{exact first implementation commit parent, exact Git empty-tree hash for root-inclusive scope, orientation base for commit-list, or n/a}`
- Review range head: `{exact final implementation commit, orientation tip for commit-list, or n/a}`
- Commit-list provenance: copy the exact scope spec and resolved commit set; range base/head alone is insufficient.
- Review verdict: `{pass | fail | blocked}` — {gate basis}
- Correctness and Risk: `{complete | blocked}` — {evidence}
- Standards and Maintainability: `{complete | blocked}` — {evidence or documented standards unavailable}
- Spec Fidelity: `{complete | blocked}` — {accepted-plan evidence}
- Confirmed P0/P1: `{count}` — {finding IDs or none}
- Retained P2: `{count}` — {finding IDs or none; non-blocking}

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
