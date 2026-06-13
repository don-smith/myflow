# Repo Conventions for RPIV + Superpowers Landing

This workflow expects a small set of project-owned documents in every repo that uses it. These are **not** part of the `@locksmithdon/dons-flow` package; they live in the codebase because they are shared by the whole team.

## Required files and folders

```
docs/
  tabled.md              # Working memory for epiphanies and deferred work
  status.md              # Living status: Recently Completed, What's Next
  memory/
    MEMORY.md            # Index of memory entries
    <type>_<topic>.md    # Individual memory entries
  changes/               # As-built documentation
    YYYY-MM-DD-<topic>.md
  retros/                # Frozen retrospectives
    YYYY-MM-DD-<topic>.md
  runbooks/              # Multi-skill processes and practices
AGENTS.md                # Repo-level agent guidance
```

## `docs/tabled.md`

Single working-memory location for epiphanies, forks, and follow-up items. Add bullet entries as they surface. Process them at end-of-artifact checkpoints and during `land` step 9. The file should end each cycle empty (or near-empty).

## `docs/status.md`

Living document with at least these sections:

- **Recently Completed** — links to the last as-built or retro.
- **What's Next** — highest-priority items moved from `docs/tabled.md`.
- **Active Work** — current branch / milestone.

Update during `land` step 9.

## `docs/memory/`

Persistent context that should carry across sessions. Keep entries short and index them in `MEMORY.md`. Memory is a thin index pointing at authoritative sources (as-builts, runbooks, code), not a duplication of them.

## `docs/changes/`

Permanent record of shipped work. One file per closed piece of work, written by the `as-built-documentation` skill. Specs and plans are scaffolding; as-builts are the durable reference.

## `docs/retros/`

Frozen retrospective documents. Once committed, a retro is not edited inline; future amendments go into a new retro.

## `docs/runbooks/`

Broader processes that compose multiple skills. For example, this workflow itself could be summarized as a runbook (`docs/runbooks/dons-flow.md`) if a project wants a local copy.

## `AGENTS.md`

Repo-level guidance for AI agents. Update only what changed during the cycle (land step 6).
