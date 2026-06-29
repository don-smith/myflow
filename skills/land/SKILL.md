---
name: land
description: Use at the end of a major piece of work after validation and review pass — bring the cycle to a clean close through commit, documentation, reflection, and integration
---

# Land

## Overview

Bring the current piece of work to a clean close. Commit the code, document what shipped, reflect on the cycle, capture lessons, reconcile memory, and prepare for the next piece of work.

Land is **stage 5 of the 5-stage myflow pipeline** (after Validate & Review). It no longer contains code review or architectural review — those live in stages 2 and 4. This skill focuses on closeout: commit, document, reflect, update, and close.

## When to Use

- After stage 4 (Validate & Review) passes — validation report clean, code-review at zero blockers
- When implementation is verified, reviewed, and ready to ship
- At any significant milestone where the project state has materially changed and you want to close cleanly

This is a **cycle boundary** — the moment between "we finished that" and "what's next."

## When NOT to Use

- Mid-work checkpoints (that's normal commit discipline)
- Bug fixes or small refactors that don't change the project's shape
- Session endings where the work isn't at a natural completion point (just commit and note what's unfinished)
- When code review or architectural review is still needed (those happen in stages 2 and 4)

## The Process

Land has 9 steps in 3 groups. **Each step is a conversation between agent and human, not unilateral execution.** Surface findings or work for the step, get review, decide together when to advance.

### Group 1 — Commit & Document

Ship the code and record what shipped.

#### 1. Commit

Group staged/unstaged changes into logical, atomic commits. Use `/skill:commit [message-hint]` for structured commits. On a feature branch, you may commit close-out artifacts (as-built, retro, memory updates) separately. On `main`, present commit groupings for human approval.

#### 2. As-Built Documentation

Once the code is committed, capture what changed and why in the configured as-built path (`node "${SKILL_DIR}/../_shared/repo-store.mjs" path as_built`). Use the `as-built-documentation` skill — it handles the synthesis, writing, and cleanup of superseded plans. This is the permanent record; specs and plans are scaffolding, as-builts are durable.

### Group 2 — Reflect & Reconcile

Look back at what happened and what we learned.

#### 3. Retro

Reflect on the cycle. What went well, what was hard, patterns to capture, anti-patterns to nudge against. Produce a retro in the personal repo retros directory (`node "${SKILL_DIR}/../_shared/repo-store.mjs" state retros`). **Start by reading the previous retro in that directory** — this threads the continual-improvement loop forward across cycles on this machine. Retro closes off the cycle's work — process improvement, not scope. Promote repo-relevant lessons to committed artifacts when warranted.

#### 4. Capturing Learnings

Run `capturing-learnings` — review tabled observations and apply the promotion rule: **once is a moment; twice is a pattern.** Promote twice-seen patterns to skills, runbooks, or memory entries.

### Group 3 — Update & Close

Update shared context and close the branch.

#### 5. Doc / Knowledge-Graph Review

Sweep over docs touched by this cycle. Add or refresh README files in the significant folders we worked in, per the incremental "build by touched folder" pattern. Look for stale, contradictory, or low-signal docs and prune. Keep signal-to-noise high.

#### 6. AGENTS.md Updates

Root and repo-level. Only update what actually changed during this cycle.

#### 7. Memory Reconcile

Review personal repo memory (`node "${SKILL_DIR}/../_shared/repo-store.mjs" state memory`) against the new state. Correct stale entries, remove redundancies, add new memories warranted by the cycle. Memory is a thin index pointing at authoritative sources, not a duplication.

#### 8. Status Review + Tabled Items Resolution

The tabled file is **ephemeral to this branch.** Entries are captured during the work, and at land they all get reconciled — none carry forward to the next branch. Resolve the paths:

```bash
node "${SKILL_DIR}/../_shared/repo-store.mjs" path status
node "${SKILL_DIR}/../_shared/repo-store.mjs" state tabled
```

Walk the status file first — update Recently Completed with what shipped, then read the tabled file. **Resolve every tabled entry** into exactly one destination:

| Destination | When |
|---|---|
| **Decide now** | The item is small enough to fix or decide in this session. Do it, then remove the entry. |
| **Promote to What's Next** | The item is real work but too large for this session. Move its substance into the status file's What's Next section, then remove the tabled entry. |
| **Promote to artifact** | The item is a pattern worth capturing — promote to a skill, runbook, or memory entry via `capturing-learnings`, then remove the tabled entry. |
| **Conscious drop** | The item looked important in the moment but doesn't hold up now. Delete the entry without promotion. |

After this step, the tabled file **must be empty.** It can retain a structural header (e.g. `# Tabled`) but must contain zero entries. A non-empty tabled file at the end of land is a bug — entries don't carry from branch to branch.

Identify the next piece of work — usually the highest-priority item moved to What's Next.

#### 9. Integrate

If on a **feature branch**, invoke the **`finishing-a-development-branch`** skill to handle merge/PR/cleanup decisions.

If on **`main`**, stage all close-out changes in appropriately grouped commits and present a summary for review. Do NOT commit unilaterally — let the human approve groupings first.

## Key Principles

- **Each step is a conversation.** Surface findings, get review, advance together. Don't execute multiple steps in a single agent turn without human checkpoints.
- **This skill owns the sequence; child skills own the execution.** Don't duplicate instructions that live in referenced skills (`as-built-documentation`, `finishing-a-development-branch`, `capturing-learnings`).
- **Documents live where their scope lives.** Repo-specific durable docs go to configured repo paths. MyFlow process state lives in the personal per-repo store.
- **Set up the next agent for success.** Every step should leave the codebase navigable: tabled items resolved, status current, retro filed in the personal store, memories reconciled.
- **Reviews happen before land.** Code review and architectural review live in stages 2 and 4 of the pipeline — do not re-review during closeout unless something changed.

## Anti-patterns

- **Merge before close-out.** Don't partial-merge an in-flight branch and then try to retroactively close out a subset. Close the branch as a complete piece of work.
- **Treating a step as a checkbox.** Each is a conversation. Rushing produces work that needs walking back.
- **Leaving the tabled file non-empty after land.** Step 8 must clear every entry. The tabled file is ephemeral to the branch — entries don't carry forward. If an entry survives land, it leaks into the next cycle without context and rots.
- **Re-reviewing code during closeout.** Code review and architectural review happen in stages 2 and 4. If new issues surface during closeout, table them — don't re-open review.
- **Skipping the retro.** The retro is the mechanism that improves the process. Without it, the same friction repeats cycle after cycle.

## Pipeline Context

Land is stage 5 of the 5-stage myflow pipeline:

1. **Discover & Align** — shape the work (`brainstorming`, `discover`, `explore`)
2. **Research & Design** — decide the approach (`research`, `design`, `architecture-review`, `plan`)
3. **Implement** — build it (`implement` + TDD, subagents, `verification-before-completion`)
4. **Validate & Review** — verify it (`validate`, `code-review`, `receiving-code-review`, `revise`)
5. **Land & Learn** — close it (this skill)

Every stage produces an artifact consumed by the next. `epiphany-tabling` runs across stages 2-4. `capturing-learnings` checks in after stages 1, 2, 4, and 5.

## Related practices

- `myflow` — the 5-stage pipeline map; invokes land at stage 5
- `as-built-documentation` — handles step 2 synthesis and cleanup
- `finishing-a-development-branch` — handles step 9 merge/PR decisions
- `capturing-learnings` — step 4 promotion rule and checkpoint
- `writing-retros` — step 3 retro format
- `epiphany-tabling` — the in-flight practice that feeds tabled items resolved in step 8
- `commit` — structured commits (step 1)

## See also

- Pipeline visual: `docs/myflow-v3-pipeline.html`
