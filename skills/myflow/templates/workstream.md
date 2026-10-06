---
kind: myflow-workstream
workstream: "{workstream-id}"
title: "{workstream title}"
status: active # active | blocked | complete | superseded
current_stage: Scope # Scope | Plan | Implement | Verify | Close
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: {resolved repository-map path from resolve-repository-map.mjs}
branch: "{branch name | trunk/current checkout}"
worktree: "{path | current checkout}"
flow_item_type: unknown # feature | defect | debt | risk | unknown
---

# {Workstream title}

## Current State

- Current stage: `{stage}`
- Authoritative current artifact: `{path}`
- Next action: `{single next safe action}`

## Stage Progress

| Stage | Status | Authoritative artifact / evidence |
|---|---|---|
| Scope | `{not-started | in-progress | ready | blocked | complete}` | `{path or n/a}` |
| Plan | `{not-started | in-progress | ready | blocked | complete}` | `{path or n/a}` |
| Implement | `{not-started | in-progress | ready | blocked | complete}` | `{path or n/a}` |
| Verify | `{not-started | in-progress | ready | blocked | complete}` | `{path or n/a}` |
| Close | `{not-started | in-progress | ready | blocked | complete}` | `{path or n/a}` |

## Lifecycle Journal

- Journal: `lifecycle/events.jsonl`
- Current attempt and last receipt: `{attempt ID, event ID | recording pending with reason}`
- Corrections: `{finding, owning stage, evidence, affected checks, next action | none}`
- Journal debt: `{failed command, error, actual work, retry owner | none}`
- Planned slices: `{name, Plan, Implement, Verify evidence and status | none}`

The journal is append-only history, not a permission system. Keep this manifest current even when a journal write fails; never claim the missing event exists. Earlier episodes and unresolved observations remain in old journals. Stage artifacts contain decisions and verification evidence.

## Worktree and Delivery Context

- Branch policy / branch: `{policy and value}`
- Worktree: `{path or current checkout}`
- Integration policy: `{repository-map source or unknown}`

## Related Artifacts

- `{path}` — {purpose}

## Rehydration

1. Run the MyFlow repository-map resolver (`resolve-repository-map.mjs` in the installed `myflow` skill) with `discover --cwd <git-root>` and read its selected map when `found`.
2. Validate `lifecycle/events.jsonl` with the MyFlow lifecycle journal CLI (`lifecycle-journal.mjs` in the installed `myflow` skill): `validate --workstream-id {workstream-id} --repository-root <git-root>`.
3. Read the authoritative current artifact above.
4. Check `git status --short`.
5. Continue with the recorded next action.
