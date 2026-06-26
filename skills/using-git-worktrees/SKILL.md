---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - creates isolated git worktrees with smart directory selection and safety verification
---

# Using Git Worktrees

## Overview

Git worktrees create isolated workspaces sharing the same repository, allowing work on multiple branches simultaneously without switching.

**Core principle:** Systematic directory selection + safety verification = reliable isolation.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Directory Selection Process

Follow this priority order:

### 1. Check Existing Directories

```bash
# Check in priority order
ls -d worktrees 2>/dev/null      # Preferred (hidden)
ls -d .worktrees 2>/dev/null     # Alternative
```

**If found:** Use that directory. If both exist, `worktrees` wins.

### 2. Check AGENTS.md

```bash
grep -i "worktree.*director" AGENTS.md 2>/dev/null
```

**If preference specified:** Use it without asking.

### 3. Ask User

If no directory exists and no AGENTS.md or preference:

```
No worktree directory found. Where should I create worktrees?

1. ~/projects/<project>/<project>-worktrees/ (sibling location)
2. .worktrees/ (project-local, hidden)
3. ~/.pi/worktrees/<project-name>/ (global location)

Which would you prefer?
```

**If custom path chosen:** Ask for the full path. Validate it doesn't collide with tracked files (run `git check-ignore` if inside the repo), then create it. Record the choice in AGENTS.md so re-use is automatic next time (step 2).

```
Enter your worktree directory path:
> ~/projects/teamroom/teamroom-worktrees/

Path: ~/projects/teamroom/teamroom-worktrees/
Shall I record this in AGENTS.md so we skip this question next time? (y/n)
> y
```

**If yes:** Append a comment to AGENTS.md:

```bash
# Add to AGENTS.md so step 2 catches it on future runs
echo "# Worktrees" >> AGENTS.md
echo "Worktree directory: $CUSTOM_PATH" >> AGENTS.md
```

## Safety Verification

### For Project-Local Directories (.worktrees or worktrees)

**MUST verify directory is ignored before creating worktree:**

```bash
# Check if directory is ignored (respects local, global, and system gitignore)
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**If NOT ignored:**

Per Jesse's rule "Fix broken things immediately":
1. Add appropriate line to .gitignore
2. Commit the change
3. Proceed with worktree creation

**Why critical:** Prevents accidentally committing worktree contents to repository.

### For Global Directory (~/.pi/worktrees)

No .gitignore verification needed - outside project entirely.

### For Custom Path (third option)

**If inside repo:** Run `git check-ignore` before creating worktree — same as project-local.

**If outside repo:** No .gitignore verification needed.

## Creation Steps

### 1. Detect Project Name

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
```

### 2. Create Worktree

```bash
# Determine full path
case $LOCATION in
  .worktrees|worktrees)
    path="$LOCATION/$BRANCH_NAME"
    ;;
  ~/.pi/worktrees/*)
    path="~/.pi/worktrees/$project/$BRANCH_NAME"
    ;;
  *)
    # Custom path — use as-is
    path="$LOCATION/$BRANCH_NAME"
    ;;
esac

# Create worktree with new branch
mkdir -p "$(dirname "$path")"
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

### 3. Run Project Setup

Auto-detect and run appropriate setup:

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

### 4. Verify Clean Baseline

Run tests to ensure worktree starts clean:

```bash
# Examples - use project-appropriate command
npm test
cargo test
pytest
go test ./...
```

**If tests fail:** Report failures, ask whether to proceed or investigate.

**If tests pass:** Report ready.

### 5. Report Location

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| `project-worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| `.worktrees/` exists | Use it (verify ignored) |
| Both exist | Use `project-worktrees/` |
| Neither exists | Check AGENTS.md → Ask user (3 options incl. sibling) |
| Custom path (from AGENTS.md or user) | Use as-is, no ignore check needed (outside repo) |
| Directory not ignored | Add to .gitignore + commit |
| Tests fail during baseline | Report failures + ask |
| No package.json/Cargo.toml | Skip dependency install |

## Common Mistakes

### Skipping ignore verification

- **Problem:** Worktree contents get tracked, pollute git status
- **Fix:** Always use `git check-ignore` before creating project-local worktree

### Assuming directory location

- **Problem:** Creates inconsistency, violates project conventions
- **Fix:** Follow priority: existing > AGENTS.md > ask (3 options incl. custom path)

### Proceeding with failing tests

- **Problem:** Can't distinguish new bugs from pre-existing issues
- **Fix:** Report failures, get explicit permission to proceed

### Hardcoding setup commands

- **Problem:** Breaks on projects using different tools
- **Fix:** Auto-detect from project files (package.json, etc.)

## Example Workflow

```
You: I'm using the using-git-worktrees skill to set up an isolated workspace.

[Check .worktrees/ - exists]
[Verify ignored - git check-ignore confirms .worktrees/ is ignored]
[Create worktree: git worktree add .worktrees/auth -b feature/auth]
[Run npm install]
[Run npm test - 47 passing]

Worktree ready at /Users/jesse/myproject/.worktrees/auth
Tests passing (47 tests, 0 failures)
Ready to implement auth feature
```

## Red Flags

**Never:**
- Create worktree without verifying it's ignored (project-local)
- Skip baseline test verification
- Proceed with failing tests without asking
- Assume directory location when ambiguous
- Skip AGENETS.md check

**Always:**
- Follow directory priority: existing > AGENETS.md > ask
- Verify directory is ignored for project-local
- Auto-detect and run project setup
- Verify clean test baseline

## Integration

**Called by:**
- **start** — may offer worktree setup at the end of Stage 1 after the topic, branch name, and alignment artifact are clear
- **myflow** — recommended before `/skill:implement` when working on a feature branch
- **any skill needing an isolated workspace**

**Also pairs with:**
- `/skill:implement` — use a worktree for long-running or multi-phase implementation
- `/skill:blueprint` or `/skill:plan` — set up the worktree after the plan is ready

**Pairs with:**
- **finishing-a-development-branch** - REQUIRED for cleanup after work complete
