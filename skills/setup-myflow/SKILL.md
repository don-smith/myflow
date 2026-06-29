---
name: setup-myflow
description: Use when onboarding myflow in a repo — creates the personal per-repo MyFlow store, initializes worktree scratch space, and records repo-specific artifact paths
---

# Setup myflow

Onboard a repo to myflow. This skill creates or loads the developer's personal per-repo MyFlow store, initializes worktree-local scratch space, and records where this repo keeps committed artifacts such as status and as-built documentation.

## Announce at start

> "I'm using the `setup-myflow` skill to onboard this repo to myflow."

## When to use

- Right after installing myflow in a repo.
- When setting up a fresh repo or worktree for this workflow.
- When a repo stores durable artifacts in non-default paths and MyFlow needs to remember them.

## What myflow provides

Cloning myflow and running `pi install ./myflow` brings everything with it:

- **Pipeline skills** — discover, research, design, implement, validate, code-review, and more.
- **Execution skills** — brainstorming, TDD, subagent-driven development, parallel dispatch.
- **Closeout skills** — landing, documentation, retros, learning capture.
- **Repo-store resolver** — `skills/_shared/repo-store.mjs`, which maps logical artifact roles to repo-specific paths.

The full workflow comes with the clone — no separate installs needed.

## Storage model

MyFlow uses three locations:

| Location | Purpose |
|---|---|
| Global MyFlow install | Skills, agents, extensions, templates, defaults. |
| `~/.myflow/repos/<repo-id>/` | Personal durable state for this repo: path map, tabled items, memory, retros. |
| `<worktree>/.myflow/` | Gitignored branch/worktree scratch: artifacts, specs, guidance, handoffs. |

Target repos should only receive committed artifacts that are useful to the repo/team, such as the configured status file, as-built docs, runbooks, or agent guidance updates. MyFlow-specific process state stays in the personal per-repo store.

## Process

### Step 1: Verify myflow is available

Check that myflow skills are discoverable:

```bash
ls skills/myflow/SKILL.md 2>/dev/null || echo "myflow not found"
```

If missing, clone and install:

```bash
git clone https://github.com/don-smith/myflow.git && pi install ./myflow
```

### Step 2: Initialize the personal repo store

Run the resolver from the target repo/worktree:

```bash
node "${SKILL_DIR}/../_shared/repo-store.mjs" ensure
```

This creates or loads:

```text
~/.myflow/repos/<repo-id>/
  config.toml
  tabled.md
  memory/
  retros/

<worktree>/.myflow/
  artifacts/
  specs/
  guidance/
```

The default `config.toml` maps logical committed artifact roles to conventional paths:

```toml
[paths]
as_built = "docs/changes"
status = "docs/status.md"
runbooks = "docs/runbooks"
agents = "AGENTS.md"
```

If this repo uses different paths, edit the personal config directly. Examples:

```toml
[paths]
as_built = "docs/historical"
status = "roadmap.md"
runbooks = "documentation/runbooks"
agents = "AGENTS.md"
```

### Step 3: Check configured committed artifact paths

Resolve the configured paths:

```bash
node "${SKILL_DIR}/../_shared/repo-store.mjs" path status
node "${SKILL_DIR}/../_shared/repo-store.mjs" path as_built
node "${SKILL_DIR}/../_shared/repo-store.mjs" path runbooks
node "${SKILL_DIR}/../_shared/repo-store.mjs" path agents
```

If a configured committed artifact should exist and is missing, ask before creating it. The repo belongs to the team; do not create committed docs unilaterally.

Useful defaults when the developer approves:

```bash
mkdir -p "$(dirname "$(node "${SKILL_DIR}/../_shared/repo-store.mjs" path status)")"
touch "$(node "${SKILL_DIR}/../_shared/repo-store.mjs" path status)"
mkdir -p "$(node "${SKILL_DIR}/../_shared/repo-store.mjs" path as_built)"
mkdir -p "$(node "${SKILL_DIR}/../_shared/repo-store.mjs" path runbooks)"
```

Seed the configured status file with:

```markdown
# Status

## Active Work

- Onboarding myflow

## Recently Completed

_None yet._

## What's Next

_None yet._
```

A minimal configured agents file can say:

```markdown
# AGENTS.md

This project may use MyFlow-generated artifacts:
- Status is tracked in the configured status file.
- As-built documentation is written to the configured as-built directory.
- MyFlow process state is personal and not committed to this repo.
```

### Step 4: Report status and next steps

Present a concise summary:

```text
Setup status for <repo>:

✓ myflow skills available
✓ Personal repo store ready: ~/.myflow/repos/<repo-id>/
✓ Worktree scratch ready: <worktree>/.myflow/
✓ Committed artifact paths configured

Next step: /skill:myflow to see the workflow map.
```

## Anti-patterns

- **Creating committed docs without asking.** The repo belongs to the team; don't mutate its documentation structure unilaterally.
- **Committing MyFlow process state to target repos.** Tabled items, MyFlow memory, and retros live in the personal repo store.
- **Trying to install components separately.** Everything ships with myflow.

## Integration

- Re-run after major myflow updates to refresh path mappings and scratch directories.
- Re-run in a new worktree to create that worktree's `.myflow/` scratch directories while reusing the same global repo store.
