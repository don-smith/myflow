---
name: myflow
description: Use when starting or navigating a major piece of work — applies the 5-stage myflow pipeline with artifact-led handoffs between stages
---

# myflow

A single 5-stage pipeline for AI-assisted software development — from discovery through landing. Each stage produces a clear state artifact, so you always know what's next.

Each stage produces an artifact consumed by the next. Each stage has a clear set of skills. There are no modes to choose from — the pipeline adapts to work size via `blueprint` (small) or `design` → `plan` (complex).

## Announce at start

> "I'm using the `myflow` skill to run the 5-stage myflow pipeline."

## When to use this skill

- At the **start** of a new piece of work, to follow the pipeline from Discover through Land.
- When you are **mid-work** and unsure which stage comes next.
- At the **end** of a validated implementation, to begin the Land closeout (stage 5).
- When onboarding a fresh repo to this workflow.

## Prerequisites

Clone this repo and run `pi install <path-to-clone>`. Dependencies install automatically — there are no separate installs.

## Before you start

If this repo has not been onboarded yet, run:

```bash
/skill:setup-myflow
```

If you haven't cloned myflow yet:

```bash
git clone https://github.com/don-smith/myflow.git
pi install ./myflow
```

## The 5-Stage Pipeline

```
Stage 1: Discover & Align → Stage 2: Research & Design → Stage 3: Implement
→ Stage 4: Validate & Review → Stage 5: Land & Learn
```

Each stage produces an artifact that gates the next. The presence of the artifact determines what can run next — no ambiguity about "what's next."

### Stage 1 — Discover & Align

Shape the work. Capture intent. Choose the right amount of rigor.

**Primary skill:**
- `start` — canonical Stage 1 entry point. Accepts rough ideas, transcripts, tickets, or notes; produces an Adaptive Alignment Artifact.

**Supporting skills, used explicitly when needed:**
- `brainstorming` — source material for open-ended ideation when the concept is still fuzzy.
- `discover` — deeper requirements extraction when intent remains ambiguous.
- `explore` — option analysis when multiple viable solution paths need comparison.

**Typical flow:** `/skill:start "[rough idea]"` → recommended next stage. `start` may stay compact for low-risk work or deepen the same artifact when risk triggers justify more alignment.

**Artifact:** `.myflow/artifacts/alignment/` — Adaptive Alignment Artifact containing intent, risk triggers, acceptance criteria, decisions, open questions, replay links, and the suggested next step.

**Checkpoint:** Run `capturing-learnings` after the alignment artifact is accepted.

**Skill invocations:**
| I want to... | Invoke |
|---|---|
| Begin new work | `/skill:start "[rough idea]"` |
| Deepen fuzzy intent explicitly | `brainstorming` or `/skill:discover "[description]"` |
| Compare solution options explicitly | `/skill:explore "[problem]"` |

### Stage 2 — Research & Design

Ground intent in codebase reality. Design the solution. Stress-test the architecture.

**Skills:**
- `research` — codebase analysis, produces Research doc
- `design` — decompose into vertical slices, produces Design doc
- `architecture-review` — stress-test the design against existing architecture (moved from Land)
- `blueprint` — fused design+plan in one pass (fast path for smaller work)
- `plan` — turn design into phased implementation steps (complex path)

**Two paths:**
- **Complex:** `design` → `architecture-review` → `plan` (for large or cross-cutting work)
- **Fast:** `blueprint` (single pass → implement-ready plan)

**Artifact:** `.myflow/artifacts/plans/` — canonical format. `implement` consumes this.

**Checkpoint:** Run `capturing-learnings` after the plan is accepted.

**Cross-cutting:** `epiphany-tabling` active. Any realization not trivially in-scope → the personal repo tabled file (`node "${SKILL_DIR}/../_shared/repo-store.mjs" state tabled`).

**Skill invocations:**
| I want to... | Invoke |
|---|---|
| Analyze the codebase | `/skill:research <artifact-or-topic>` |
| Design + plan separately | `/skill:design <research>` → `/skill:plan <design>` |
| Design + plan together (fast) | `/skill:blueprint <research>` |
| Stress-test architecture | `/skill:architecture-review` |

### Stage 3 — Implement

Execute the plan. Write the code.

**Skills:**
- `implement` — primary executor. Fans out plan phases, gates each on success criteria
- `test-driven-development` — red/green TDD within each phase
- `subagent-driven-development` — fresh subagent per phase task, two-stage review
- `dispatching-parallel-agents` — for independent phase tasks
- `verification-before-completion` (myflow) — no success claim without fresh evidence

**Inner loop:** `implement` is the primary. TDD, subagents, and parallel dispatch are strategies used _inside_ each phase — not replacements for `implement`.

**Artifact:** Working tree changes.

**Cross-cutting:** `epiphany-tabling` active. Stage artifacts carry routine state; use `create-handoff` / `resume-handoff` only for unusual mid-stage pauses.

**Skill invocations:**
| I want to... | Invoke |
|---|---|
| Execute the plan | `/skill:implement <plan> [Phase N]` |
| Run TDD discipline | `test-driven-development` |
| Dispatch subagents | `subagent-driven-development` |
| Parallel independent tasks | `dispatching-parallel-agents` |
| Save mid-work state | `/skill:create-handoff` |
| Resume saved state | `/skill:resume-handoff <handoff-path>` |

### Stage 4 — Validate & Review

Verify the work. Gate the commit.

**Skills:**
- `validate` — re-check each phase against its success criteria
- `manual-verification` — exercise external services and human-interactive surfaces before land (skip for pure internal refactors)
- `code-review` — structured audit across quality, security, and dependencies. Emits `blockers_count`.
- `receiving-code-review` — process review findings with technical rigor
- `revise` — surgically update the plan from review feedback

**Gate:** `code-review` loops until zero blockers (max 3 passes). Blockers → `revise` → re-implement → re-validate. Zero blockers → proceed to stage 5. Three loops with remaining blockers → stops for human decision.

**Artifact:** `.myflow/artifacts/validation/` + `.myflow/artifacts/reviews/`

**Checkpoint:** Run `capturing-learnings` after validate + review pass.

**Skill invocations:**
| I want to... | Invoke |
|---|---|
| Verify implementation | `/skill:validate <plan>` |
| Verify external deps manually | `manual-verification` |
| Review changes | `/skill:code-review [scope]` |
| Process review feedback | `receiving-code-review` |
| Update plan from review | `/skill:revise <plan-path>` |

### Stage 5 — Land & Learn

Close the cycle. Document. Reflect. Prepare for next.

**Skill:** `/skill:land`

**What it does:** 9 steps in 3 groups:
- **Group 1 — Commit & Document:** `commit` → `as-built-documentation`
- **Group 2 — Reflect & Reconcile:** `writing-retros` → `capturing-learnings`
- **Group 3 — Update & Close:** Doc/knowledge-graph review → configured agents path → memory reconcile → status review + resolve tabled items → `finishing-a-development-branch`

**Artifacts:** configured as-built/status/runbook/agents paths, personal repo retros/memory/tabled files, git commits.

**Skill invocation:**
| I want to... | Invoke |
|---|---|
| Close out the cycle | `/skill:land` |

## Cross-cutting practices

These practices run continuously across the pipeline, not at a single stage.

### Epiphany tabling (`epiphany-tabling`)

Use `epiphany-tabling` whenever an unexpected realization surfaces mid-task during stages 2-4. Add it to the personal repo tabled file (`node "${SKILL_DIR}/../_shared/repo-store.mjs" state tabled`). Never lose it, never let it derail current work. Resolve tabled items at end-of-artifact checkpoints and during Land step 8.

### Capturing learnings (`capturing-learnings`)

After each approved artifact (stages 1, 2, 4, and 5), run `capturing-learnings`. Apply the rule: **once is a moment; twice is a pattern.** Promote tabled observations to skills, runbooks, or memory only on the second sighting.

### Verification before completion (`verification-before-completion`)

Before any completion claim — a test passing, a phase done, a feature working — run the verification command fresh, read the output, and cite the evidence. No shortcuts.

### Telemetry and replay checkpoints

Each stage should have an explicit checkpoint where the artifact captures workflow signals that help evaluate whether MyFlow is working: artifact path, risk/complexity classification, decisions and corrections, restart recommendation, next-stage choice, and telemetry/session references when available. Stage 1 records these in the alignment artifact's `Replay / Telemetry` section. Full workflow telemetry events are deferred future work; the checkpoint discipline starts now.

### Stage-boundary restarts

MyFlow expects fresh sessions at natural stage boundaries when context is getting large:

- after Stage 1 completes and the alignment artifact/worktree exists
- after the Stage 2 plan/design is accepted
- after Stage 3 implementation completes
- after Stage 4 validation/review passes
- after Stage 5 land/learn completes

At these routine boundaries, resume from the artifact path and the recommended next-stage command. Stage 1 should usually recommend a branch/worktree and a fresh session in that worktree before Stage 2.

### Handoffs (`create-handoff` / `resume-handoff`)

Routine stage boundaries use artifacts as handoffs: alignment artifacts, plans, validation reports, reviews, and as-built docs. If you must stop mid-stage because context is high or work is unexpectedly long, use `/skill:create-handoff`. Resume that exceptional handoff with `/skill:resume-handoff <handoff-path>` in a fresh session.

### Future-stage refresh principles

Carry these Stage 1 refresh concepts into future Stage 2-5 work without redesigning those stages prematurely:

- one clear stage entry point where possible
- artifact-led resumability instead of routine handoffs
- expected fresh-session breakpoints between stages
- workflow telemetry and replay links at explicit checkpoints
- developer-context summaries at transitions
- right-sized rigor based on risk, not ceremony

## Upstream awareness

Upstream projects that contribute skills to myflow evolve independently. The `sync-upstream` skill lets you check for changes — see `docs/runbooks/monitor-upstream-evolution.md` for the process. The default stance is **observe, don't integrate.**

## Storage this workflow expects

MyFlow uses three storage scopes:

| Scope | Location | Purpose |
|---|---|---|
| Global install | myflow package / installed Pi assets | Skills, agents, extensions, templates, workflow defaults. |
| Personal repo store | `~/.myflow/repos/<repo-id>/` | Repo-specific path map, tabled items, memory, retros. |
| Worktree scratch | `<worktree>/.myflow/` | Gitignored artifacts, specs, guidance, handoffs for the current worktree. |

Committed repo artifacts are configurable per repo through the personal repo store:

| Logical path | Default | Purpose |
|---|---|---|
| `as_built` | `docs/changes` | As-built documentation: what shipped and why. |
| `status` | `docs/status.md` | Living status: Recently Completed, What's Next. |
| `runbooks` | `docs/runbooks` | Durable repo-relevant processes and practices. |
| `agents` | `AGENTS.md` | Repo-level agent guidance. |

## Anti-patterns

- **Skipping `land`.** Stage 4 is not the finish line. Close the cycle.
- **Carrying tabled items across cycles.** Resolve every entry during Land step 8.
- **Editing source files during stages 1-2.** Discover, research, design, and blueprint produce artifacts; `implement` (stage 3) edits code.
- **Recomposing slice boundaries.** `design`/`blueprint` owns decomposition; `plan` inherits slices 1:1.
- **Letting verification become a rubber stamp.** Evidence first, claims second.
- **Treating observability as optional memory.** Stage checkpoints must record replay/telemetry fields when available.
- **Holding review findings for Land.** Code review happens in stage 4. Land is for closeout, not re-review.

## Quick reference

| Stage | Primary Skill(s) | Artifact Produced |
|---|---|---|
| 1. Discover & Align | `start` | Alignment (`.myflow/artifacts/alignment/`) |
| 2. Research & Design | `research`, `design`/`blueprint`, `plan` | Plan (`.myflow/artifacts/plans/`) |
| 3. Implement | `implement` + TDD, subagents | Working tree changes |
| 4. Validate & Review | `validate`, `manual-verification`, `code-review`, `revise` | Validation + Manual Verification + Review |
| 5. Land & Learn | `land` (→ commit, as-built, retro...) | Configured repo docs + personal repo retros/memory |

| I want to... | Invoke |
|---|---|
| Onboard a repo | `/skill:setup-myflow` |
| See the pipeline | `/skill:myflow` |
| Begin new work | `/skill:start "..."` |
| Ideate / refine explicitly | `brainstorming` |
| Deepen requirements explicitly | `/skill:discover "..."` |
| Understand the codebase | `/skill:research <artifact-or-topic>` |
| Compare options explicitly | `/skill:explore "..."` |
| Design + plan separately | `/skill:design <research>` → `/skill:plan <design>` |
| Design + plan together | `/skill:blueprint <research>` |
| Execute the plan | `/skill:implement <plan> [Phase N]` |
| Execute with subagents | `subagent-driven-development` |
| Run TDD | `test-driven-development` |
| Verify implementation | `/skill:validate <plan>` |
| Verify external deps manually | `manual-verification` |
| Review changes | `/skill:code-review [scope]` |
| Process review feedback | `receiving-code-review` |
| Update plan from review | `/skill:revise <plan-path>` |
| Commit changes | `/skill:commit` |
| Close out the cycle | `/skill:land` |
| Table a mid-flight realization | `/skill:epiphany-tabling` |
| Run end-of-artifact checkpoint | `/skill:capturing-learnings` |
| Create a handoff | `/skill:create-handoff` |
| Resume a handoff | `/skill:resume-handoff <handoff-path>` |

## See also

- `setup-myflow` — onboarding skill
- `land` — stage 5 closeout (9 steps in 3 groups)
- `epiphany-tabling` — scope control
- `capturing-learnings` — promotion rule and end-of-artifact checkpoints
- `verification-before-completion` — evidence-first discipline
- `manual-verification` — live-dependency and human-surface verification before land
- `docs/runbooks/monitor-upstream-evolution.md` — upstream tracking
- Pipeline visual: `docs/myflow-v3-pipeline.html`
