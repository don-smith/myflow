---
name: land
description: Use at the end of a major piece of work to bring the cycle to a clean close — review the work, document what changed, capture lessons, and prepare for the next cycle
---

# Land

Bring the current piece of work to a clean close. Review what was built, document what changed, capture lessons, and leave the codebase ready for the next cycle.

## When to Use

- A design phase is complete and agreed
- An implementation plan has been fully executed and verified
- Any significant milestone where the project state has materially changed
- Before starting the next piece of work

This is a **cycle boundary** — the moment between "we finished that" and "what's next."

## When NOT to Use

- Mid-work checkpoints (that's normal commit discipline)
- Bug fixes or small refactors that don't change the project's shape
- Session endings where the work isn't at a natural completion point (just commit and note what's unfinished)

## The Process

Land has 10 ordered sub-steps. **Each sub-step is a conversation between agent and human, not unilateral execution.** Surface findings or work for the step, get review, decide together when to advance. See [`docs/ways-of-working.md`](../../../docs/ways-of-working.md) §"Development Lifecycle" for the canonical descriptions.

**Hard ordering rule:** all reviews (1–3) precede all documentation work (4–7). Documentation describes what is true; if a review changes what is true, doc work is wasted.

### 1. Code review

Comprehensive, back-and-forth review of all code that landed during this cycle. Find issues; fix small ones now, table substantive ones in `docs/tabled.md`. Often a substantial conversation in itself.

### 2. Architectural review

Did this work introduce new patterns? Stress the architecture? Indicate that an existing pattern should change? Find structural issues — fix small ones now, table substantive ones.

### 3. Security review

Scope to the change. Find issues, fix small ones now, table substantive ones. (Once `docs/security-register.md` and the security-review skill exist, follow that playbook.)

### 4. As-built documentation

Once the code is final, capture what changed and why in `docs/changes/` (project-level) or per-repo `docs/changes/`. Use the `as-built-documentation` skill — it handles the synthesis, writing, and cleanup of superseded plans.

### 5. Doc / knowledge-graph review

Sweep over docs touched by this cycle. Add or refresh README files in the significant folders we worked in, per the incremental "build by touched folder" pattern (see WoW §"README knowledge graph"). Look for stale, contradictory, or low-signal docs and prune. Keep signal-to-noise high.

If unsure where new information should live, consult [`docs/memory.md`](../../../docs/memory.md).

### 6. AGENTS.md updates

Root and repo-level. Only update what actually changed.

### 7. Memory reconcile

Review persistent memory (markdown files in `docs/memory/` and any auto-loaded project memory) against the new state. Correct stale entries, remove redundancies, add new feedback / project / reference / user memories warranted by the cycle. Memory is a thin index pointing at authoritative sources, not a duplication.

### 8. Retro

Reflect on the cycle. What went well, what was hard, patterns to capture, anti-patterns to nudge against. Produce a permanent retro doc at `docs/retros/YYYY-MM-DD-<topic>.md`. Retro **closes off the cycle's work** — process improvement, not scope. Scope changes already got captured in steps 1–3 as tabled items / memories.

**Start by reading the previous retro in `docs/retros/`** — this threads the continual-improvement loop forward across cycles.

### 9. Status review + tabled-items confirmation + next piece of work

Walk through `docs/status.md` intentionally with the cycle's tabled items in hand. Decide what belongs in "Recently Completed," "What's Next," what to prune. **Resolve every tabled item** — either decide-now (document the decision and remove the entry) or move-to-status (substance moves to "What's Next" and the entry is removed). `docs/tabled.md` should end the cycle empty (or near-empty). Identify the next piece of work — usually the highest-priority moved-to-status item.

### 10. Integrate

If on a **feature branch**, invoke the **finishing-a-development-branch** skill to handle merge/PR/cleanup decisions.

If on **main**, stage all close-out changes in appropriately grouped commits and present a summary for review. Do NOT commit unilaterally — let the human approve groupings first.

## Key Principles

- **Each sub-step is a conversation.** Surface findings, get review, advance together. Don't execute multiple sub-steps in a single agent turn without human checkpoints.
- **This skill owns the sequence; child skills own the execution.** Don't duplicate instructions that live in referenced skills (`as-built-documentation`, `finishing-a-development-branch`).
- **Documents live where their scope lives.** Repo-specific docs in the repo. Cross-repo / project-level docs at the root.
- **Set up the next agent for success.** Every step should leave the codebase navigable: tabled items resolved, status current, retro filed, memories reconciled.

## Anti-patterns

- **Merge before close-out.** Don't partial-merge an in-flight branch and then try to retroactively close out a subset. Close the branch as a complete piece of work, table the continuation, pick up next on a fresh branch.
- **Treating a sub-step as a checkbox.** Each is a conversation. Rushing produces work that needs walking back.
- **Carrying tabled items across cycles.** Step 9 resolves every one.

## Development Lifecycle Context

This project uses a skills-driven development lifecycle (RPIV pipeline + Superpowers-style closeout):

1. **Discover** — Interview-driven intent capture (`/skill:discover` from RPIV)
2. **Research** — Codebase context and precedent mapping (`/skill:research` from RPIV)
3. **Design / Blueprint** — Architecture and phased planning (`/skill:design`, `/skill:blueprint`, or `/skill:explore` from RPIV)
4. **Plan** — Implementation plan sequencing (`/skill:plan` from RPIV, when design and plan are separate)
5. **Implement** — Phased execution (`/skill:implement` from RPIV)
6. **Verify** — Validation against the plan's success criteria (`/skill:validate` from RPIV, guided by `verification-before-completion` discipline)
7. **Review / Commit** — Code review and atomic commits (`/skill:code-review` and `/skill:commit` from RPIV)
8. **Land** — This skill. The 10 sub-steps above bring the cycle to a clean close.

Not every piece of work goes through all stages. Small changes may skip brainstorming and planning. The workflow adapts to size and complexity.
