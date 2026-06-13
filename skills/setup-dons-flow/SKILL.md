---
name: setup-dons-flow
description: Use when installing or onboarding @locksmithdon/dons-flow in a repo — checks dependencies, detects Superpowers, and creates repo conventions
---

# Setup Don's Flow

Onboard a repo to the Don's Flow v2 triad: **Superpowers** + **RPIV** + **Don's closeout discipline**. This skill checks prerequisites, detects what is already installed, creates the repo-owned conventions, and tells you what still needs to be done.

## Announce at start

> "I'm using the `setup-dons-flow` skill to onboard this repo to Don's Flow v2."

## When to use

- Right after installing `@locksmithdon/dons-flow` in a repo.
- When you suspect prerequisites are missing.
- When setting up a fresh repo for this workflow.
- After switching to a new agent harness.

## What Don's Flow needs

| Component | What it is | How it is installed |
|---|---|---|
| **Superpowers** | Agentic methodology (brainstorming, TDD, subagent-driven development) | Harness plugin (Claude, Codex, Gemini, Cursor, etc.) |
| **RPIV** | Observable delivery pipeline (`discover → ... → commit`) | `pi install npm:@juicesharp/rpiv-pi` |
| **Pi subagent runtime** | Runtime used by RPIV | `pi install npm:@tintinweb/pi-subagents` |
| **Don's Flow** | This package: closeout, scope control, learning capture | `pi install npm:@locksmithdon/dons-flow` |

Superpowers is not an npm package and cannot be installed via `pi install` or `npm install`. It must be installed as a harness plugin.

## Process

### Step 1: Detect installed Pi packages and install RPIV siblings

Run:

```bash
pi list
```

Look for:

| Package | Required? | If missing |
|---|---|---|
| `npm:@juicesharp/rpiv-pi` | Yes | Peer dependency; auto-installed with npm 7+ when you install `@locksmithdon/dons-flow`. If not, run `pi install npm:@juicesharp/rpiv-pi`. |
| `npm:@tintinweb/pi-subagents` | Yes | Peer dependency; auto-installed with npm 7+ when you install `@locksmithdon/dons-flow`. If not, run `pi install npm:@tintinweb/pi-subagents`. |
| `npm:@locksmithdon/dons-flow` | Yes | `pi install npm:@locksmithdon/dons-flow` |

If RPIV is installed but its sibling extensions are missing, run RPIV's setup command automatically:

```bash
/rpiv-setup
```

This installs the sibling plugins:

- `@juicesharp/rpiv-ask-user-question`
- `@juicesharp/rpiv-todo`
- `@juicesharp/rpiv-advisor`
- `@juicesharp/rpiv-i18n`
- `@juicesharp/rpiv-web-tools`
- `@juicesharp/rpiv-args`
- `@juicesharp/rpiv-workflow`

After `/rpiv-setup` completes, **restart Pi** so the new extensions are loaded. Then re-run `/skill:setup-dons-flow` to continue onboarding.

If you cannot restart Pi in this session, report the remaining siblings to the user and ask them to restart before proceeding.

### Step 2: Detect Superpowers

Superpowers is installed via your agent harness, not as a Pi npm package. Check the appropriate method for your harness:

**Claude Code**
```bash
/plugin list
```
Look for `superpowers`. If missing:
```bash
/plugin install superpowers@claude-plugins-official
```
Or via the Superpowers marketplace:
```bash
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

**Codex CLI / Codex App**
```bash
/plugins
```
Search for "Superpowers" and install it.

**Gemini CLI**
```bash
gemini extensions list
```
If missing:
```bash
gemini extensions install https://github.com/obra/superpowers
```

**Factory Droid**
```bash
droid plugin list
```
If missing:
```bash
droid plugin marketplace add https://github.com/obra/superpowers
droid plugin install superpowers@superpowers
```

**OpenCode**
```bash
# Fetch and follow instructions from:
# https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/.opencode/INSTALL.md
```

**Cursor**
```bash
/add-plugin superpowers
```
Or search "superpowers" in the plugin marketplace.

**GitHub Copilot CLI**
```bash
copilot plugin list
```
If missing:
```bash
copilot plugin marketplace add obra/superpowers-marketplace
copilot plugin install superpowers@superpowers-marketplace
```

If you are unsure which harness is active, ask the user. Do not guess.

If Superpowers is not installed, explain that the closeout workflow in this package still works, but the upstream Superpowers entry points (`brainstorming`, `test-driven-development`, `subagent-driven-development`) will not be available.

### Step 3: Check repo conventions

Check whether these project-owned files and folders exist:

```bash
ls docs/tabled.md docs/status.md docs/memory/MEMORY.md docs/changes docs/retros docs/runbooks AGENTS.md 2>/dev/null
```

Expected:

| Path | Purpose |
|---|---|
| `docs/tabled.md` | Working memory for deferred ideas |
| `docs/status.md` | Living status |
| `docs/memory/` | Persistent memory + `MEMORY.md` index |
| `docs/changes/` | As-built documentation |
| `docs/retros/` | Frozen retrospectives |
| `docs/runbooks/` | Multi-skill processes |
| `AGENTS.md` | Repo-level agent guidance |

### Step 4: Create missing conventions

If the user approves, create missing conventions:

```bash
mkdir -p docs/{memory,changes,retros,runbooks}
touch docs/tabled.md docs/status.md docs/memory/MEMORY.md AGENTS.md
```

Seed `docs/status.md` with:

```markdown
# Status

## Active Work

- Onboarding `@locksmithdon/dons-flow`

## Recently Completed

_None yet._

## What's Next

_None yet._
```

Seed `docs/memory/MEMORY.md` with:

```markdown
# Memory Index

Cross-session context for this project.

## Entries

_None yet._
```

Seed `AGENTS.md` with a minimal entry pointing at this workflow:

```markdown
# AGENTS.md

This project uses the `@locksmithdon/dons-flow` workflow:
- Superpowers for design, planning, TDD, and subagent-driven development.
- RPIV pipeline for discovery, research, design/plan, implement, validate, review, commit.
- `land` skill for 10-step cycle closeout.

See `docs/runbooks/` for detailed processes and `docs/memory/` for project context.
```

### Step 5: Report status and next steps

Present a concise summary:

```
Setup status for <repo>:

✓ RPIV installed
✗ @tintinweb/pi-subagents missing — run: pi install npm:@tintinweb/pi-subagents
✓ Repo conventions created
✓ Superpowers detected (Claude Code plugin)

Next step: /skill:dons-flow to see the workflow map.
```

## Anti-patterns

- **Creating conventions without asking.** The repo belongs to the team; don't mutate its doc structure unilaterally.
- **Guessing the harness.** Always detect or ask which agent harness is in use before giving Superpowers install instructions.
- **Treating Superpowers as optional decoration.** It is one of the three pillars of this workflow. Detect it accurately and install it if possible.
- **Installing packages without confirmation.** Present the install commands; let the human run them.

## Integration

- Called automatically on first install if an extension hook is added later.
- Should be re-run after major RPIV or Superpowers updates to refresh conventions.
