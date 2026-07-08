---
name: close
description: Use at the end of a major piece of work after review passes — bring the cycle to a clean close through commit, documentation, reflection, and integration
---

# Close

## Overview

Bring the current piece of work to a clean close. Commit the code, document what shipped, reflect on the cycle, capture lessons, reconcile memory, and integrate the branch.

Close is **stage 5 of the 5-stage myflow pipeline** (after Review). It no longer contains code review or architectural review — those live in stages 2 and 4. This skill focuses on closeout: commit, document, reflect, update, and integrate.

## When to Use

- After stage 4 (Review) passes — validation report clean, code-review at zero blockers
- When implementation is verified, reviewed, and ready to ship
- At any significant milestone where the project state has materially changed and you want to close cleanly

This is a **cycle boundary** — the moment between "we finished that" and "what's next."

## When NOT to Use

- Mid-work checkpoints (that's normal commit discipline)
- Bug fixes or small refactors that don't change the project's shape
- Session endings where the work isn't at a natural completion point (just commit and note what's unfinished)
- When code review or architectural review is still needed (those happen in stages 2 and 4)

## The Process

Close has 8 steps in 3 groups. **Each step is a mandatory conversation — the agent must not advance without explicit human approval.** Surface findings or work for the step, present them via `ask_user_question`, and wait for the human to say "Proceed" before advancing. Never execute multiple steps in a single agent turn. Each step ends with a **⛔ GATE** checkpoint that blocks forward progress until answered.

During execution, maintain a Context Checkpoint to track which group/step is current, what's been completed, and what's next. When Close completes, the as-built docs, retros, and memory serve as the Rehydration Manifest — they tell future sessions what shipped and why.

### Group 1 — Commit & Document

Ship the code and record what shipped.

#### 1. Commit

Group staged/unstaged changes into logical, atomic commits. Use `/skill:commit [message-hint]` for structured commits. On a feature branch, you may commit close-out artifacts (as-built, retro, memory updates) separately. On `main`, present commit groupings for human approval.

**⛔ GATE**: After committing, use `ask_user_question` to present the commit summary and ask: "Step 1 complete — proceed to Step 2 (As-Built Documentation)?" Options: "Proceed" / "Revise commits".

#### 2. As-Built Documentation

Once the code is committed, capture what changed and why in the configured as-built path (`node "${SKILL_DIR}/../_shared/repo-store.mjs" path as_built`). Use the `as-built-documentation` skill — it handles the synthesis, writing, and cleanup of superseded plans. This is the permanent record; specs and plans are scaffolding, as-builts are durable.

**⛔ GATE**: After documentation is written, use `ask_user_question` to present a summary and ask: "Step 2 complete — proceed to Step 3 (Retro)?" Options: "Proceed" / "Revise docs".

### Group 2 — Reflect & Reconcile

Look back at what happened and what we learned.

#### 3. Retro

Reflect on the cycle. What went well, what was hard, patterns to capture, anti-patterns to nudge against. Produce a retro in the personal repo retros directory (`node "${SKILL_DIR}/../_shared/repo-store.mjs" state retros`). **Start by reading the previous retro in that directory** — this threads the continual-improvement loop forward across cycles on this machine. Retro closes off the cycle's work — process improvement, not scope. Promote repo-relevant lessons to committed artifacts when warranted.

**⛔ GATE**: After the retro is written, use `ask_user_question` to present key findings and ask: "Step 3 complete — proceed to Step 4 (Capturing Learnings)?" Options: "Proceed" / "Revise retro".

#### 4. Capturing Learnings

Run `capturing-learnings` — review tabled observations and apply the promotion rule: **once is a moment; twice is a pattern.** Promote twice-seen patterns to skills, runbooks, or memory entries.

**⛔ GATE**: After learnings are captured, use `ask_user_question` to present promotion decisions and ask: "Step 4 complete — proceed to Step 5 (Doc Review)?" Options: "Proceed" / "Revise learnings".

### Group 3 — Update & Integrate

Update shared context and close the branch.

#### 5. Doc / Knowledge-Graph Review

Sweep over docs touched by this cycle. Add or refresh README files in the significant folders we worked in, per the incremental "build by touched folder" pattern. Look for stale, contradictory, or low-signal docs and prune. Keep signal-to-noise high.

**⛔ GATE**: After docs are reviewed, use `ask_user_question` to present changes and ask: "Step 5 complete — proceed to Step 6 (AGENTS.md Updates)?" Options: "Proceed" / "Revise docs".

#### 6. AGENTS.md Updates

Root and repo-level. Only update what actually changed during this cycle.

**⛔ GATE**: After AGENTS.md is updated, use `ask_user_question` to present changes and ask: "Step 6 complete — proceed to Step 7 (Memory Reconcile)?" Options: "Proceed" / "Revise AGENTS.md".

#### 7. Memory Reconcile

Review personal repo memory (`node "${SKILL_DIR}/../_shared/repo-store.mjs" state memory`) against the new state. Correct stale entries, remove redundancies, add new memories warranted by the cycle. Memory is a thin index pointing at authoritative sources, not a duplication.

**⛔ GATE**: After memory is reconciled, use `ask_user_question` to present changes and ask: "Step 7 complete — proceed to Step 8 (Status Review + Tabled Resolution)?" Options: "Proceed" / "Revise memory".

#### 8. Status Review + Tabled Resolution + Integrate

The tabled file is **ephemeral to this branch.** Entries are captured during the work, and at close they all get reconciled — none carry forward to the next branch. Resolve the paths:

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

After this step, the tabled file **must be empty.** It can retain a structural header (e.g. `# Tabled`) but must contain zero entries. A non-empty tabled file at the end of close is a bug — entries don't carry from branch to branch.

Identify the next piece of work — usually the highest-priority item moved to What's Next.

**Then, integrate the branch.** If on a **feature branch**, determine the base branch and present four options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work
```

**Option 1 — Merge Locally:**
```bash
git checkout <base-branch>
git pull
git merge <feature-branch>
# Verify tests pass
git branch -d <feature-branch>
```

**Option 2 — Push and Create PR:**
```bash
git push -u origin <feature-branch>
gh pr create --title "<title>" --body "<summary>"
```

**Option 3 — Keep As-Is:** Report: "Keeping branch <name>." Do not clean up the worktree.

**Option 4 — Discard:** Require typed "discard" confirmation, then:
```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

**Worktree cleanup:** For options 1 and 4, remove the worktree if applicable:
```bash
git worktree remove <worktree-path>
```

If on **`main`**, stage all close-out changes in appropriately grouped commits and present a summary for review. Do NOT commit unilaterally — let the human approve groupings first.

**⛔ GATE**: After integration, use `ask_user_question` to present the final state and ask: "Close complete — close this cycle?" Options: "Close cycle" / "Return to a previous step".

## Key Principles

- **Every step ends with a ⛔ GATE.** The agent must use `ask_user_question` to present the step's output and get explicit "Proceed" approval before advancing. Never execute multiple steps in a single agent turn. If a step feels check-boxable, you're doing it wrong — slow down and make it a real conversation.
- **This skill owns the sequence; child skills own the execution.** Don't duplicate instructions that live in referenced skills (`as-built-documentation`, `capturing-learnings`).
- **Documents live where their scope lives.** Repo-specific durable docs go to configured repo paths. MyFlow process state lives in the personal per-repo store.
- **Set up the next agent for success.** Every step should leave the codebase navigable: tabled items resolved, status current, retro filed in the personal store, memories reconciled.
- **Reviews happen before close.** Code review and architectural review live in stages 2 and 4 of the pipeline — do not re-review during closeout unless something changed.

## Anti-patterns

- **Merge before close-out.** Don't partial-merge an in-flight branch and then try to retroactively close out a subset. Close the branch as a complete piece of work.
- **Speed-running steps.** The ⛔ GATE at each step exists to prevent this. A step is not complete until the human says "Proceed." Batching multiple steps or presenting outputs without waiting for approval voids the close process — the close-out is invalid and must be redone from the first skipped checkpoint.
- **Leaving the tabled file non-empty after close.** Step 8 must clear every entry. The tabled file is ephemeral to the branch — entries don't carry forward. If an entry survives close, it leaks into the next cycle without context and rots.
- **Re-reviewing code during closeout.** Code review and architectural review happen in stages 2 and 4. If new issues surface during closeout, table them — don't re-open review.
- **Skipping the retro.** The retro is the mechanism that improves the process. Without it, the same friction repeats cycle after cycle.

## Pipeline Context

Close is stage 5 of the 5-stage myflow pipeline:

1. **Scope** — frame the work (`scope`, `research`)
2. **Plan** — design and sequence (`design`, `architecture-review`, `plan`)
3. **Implement** — build it (`implement` + TDD, subagents, `verification-before-completion`)
4. **Review** — verify it (`validate`, `code-review`, `receiving-code-review`, `revise`)
5. **Close** — close it (this skill)

Every stage produces an artifact consumed by the next. `epiphany-tabling` runs across stages 2-4. `capturing-learnings` checks in after stages 1, 2, 4, and 5.

## Related practices

- `myflow` — the 5-stage pipeline map; invokes close at stage 5
- `as-built-documentation` — handles step 2 synthesis and cleanup
- `capturing-learnings` — step 4 promotion rule and checkpoint
- `writing-retros` — step 3 retro format
- `epiphany-tabling` — the in-flight practice that feeds tabled items resolved in step 8
- `commit` — structured commits (step 1)

## See also

- Pipeline visual: `docs/myflow-v3-pipeline.html`
