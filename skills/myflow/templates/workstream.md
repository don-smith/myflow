---
kind: myflow-workstream
workstream: "{workstream-id}"
title: "{workstream title}"
status: active # active | blocked | complete | superseded
current_stage: Scope # Scope | Plan | Implement | Verify | Close
created_at: {iso_timestamp}
updated_at: {iso_timestamp}
repository_map: .myflow/repository-map.md
branch: "{branch name | trunk/current checkout}"
worktree: "{path | current checkout}"
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

## Worktree and Delivery Context

- Branch policy / branch: `{policy and value}`
- Worktree: `{path or current checkout}`
- Integration policy: `{repository-map source or unknown}`

## Related Artifacts

- `{path}` — {purpose}

## Rehydration

1. Read `.myflow/repository-map.md` when present.
2. Read the authoritative current artifact above.
3. Check `git status --short`.
4. Continue with the recorded next action.
