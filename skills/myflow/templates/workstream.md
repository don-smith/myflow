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
- Schema: `myflow-lifecycle/v1`
- Current attempt: `{attempt ID and ordinal | not started | closed}`
- Open correction episode: `{episode ID | none}`
- Return counts: `returnEpisodeCount={n}`, `stageReturnCount={n}`, `activityReturnCount={n}`
- Last receipt: `{event ID | none}`

The journal is the append-only lifecycle authority. This manifest is its current-state projection. Stage artifacts remain the decision and evidence records.

## Worktree and Delivery Context

- Branch policy / branch: `{policy and value}`
- Worktree: `{path or current checkout}`
- Integration policy: `{repository-map source or unknown}`

## Related Artifacts

- `{path}` — {purpose}

## Rehydration

1. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` and read its selected map when `found`.
2. Validate `lifecycle/events.jsonl` with `node skills/myflow/scripts/lifecycle-journal.mjs validate --workstream-id {workstream-id} --repository-root <git-root>`.
3. Read the authoritative current artifact above.
4. Check `git status --short`.
5. Continue with the recorded next action.
