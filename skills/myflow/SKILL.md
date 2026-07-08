---
name: myflow
description: Use when starting or navigating a major piece of work — applies the 5-stage myflow pipeline with artifact-led handoffs between stages
---

# myflow

A single 5-stage pipeline for AI-assisted software development — from scoping through close. Each stage produces a clear state artifact, so you always know what's next.

Each stage produces an artifact consumed by the next. Each stage has a clear set of skills. There are no modes to choose from — the pipeline adapts to work size through `design` inputs, then `plan` sequences the approved design.

## Announce at start

> "I'm using the `myflow` skill to run the 5-stage myflow pipeline."

## When to use this skill

- At the **start** of a new piece of work, to follow the pipeline from Scope through Close.
- When you are **mid-work** and unsure which stage comes next.
- At the **end** of a validated implementation, to begin the Close stage (stage 5).
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
Stage 1: Scope → Stage 2: Plan → Stage 3: Implement
→ Stage 4: Review → Stage 5: Close
```

Each stage produces an artifact that gates the next. The presence of the artifact determines what can run next — no ambiguity about "what's next."

### Stage 1 — Scope

Frame the work. Capture intent. Understand the codebase. Right-sized rigor — no ceremony for low-risk work.

**Primary skills:**
- `scope` — canonical Stage 1 entry point. Accepts rough ideas, transcripts, tickets, or notes; produces an Adaptive Alignment Artifact. Always chains to `research`.
- `research` — codebase analysis grounded in the alignment artifact. Produces a Research doc.

**Supporting skill, used explicitly when needed:**
- `discover` — deeper requirements extraction when the work is fuzzy or high-stakes. Interview-driven FRD with documented decisions.

**Typical flow:** `/skill:scope "[rough idea]"` → alignment artifact → `/skill:research <alignment-path>` → research artifact. If the work is still fuzzy after scoping, explicitly invoke `/skill:discover` for deeper requirements before research.

**Artifacts:**
- `.myflow/artifacts/alignment/` — Adaptive Alignment Artifact containing intent, risk triggers, acceptance criteria, decisions, open questions, replay links, and the suggested next step.
- `.myflow/artifacts/research/` — Research doc with codebase findings, integration points, and precedents.

**Checkpoints:** Run `capturing-learnings` after each artifact is accepted. Each artifact carries a Context Checkpoint (in-progress state) and a Rehydration Manifest (finalized handoff to the next skill) — see the shared template at `skills/myflow/templates/stage-context-checkpoint.md`.

**Skill invocations:**
| I want to... | Invoke |
|---|---|
| Begin new work | `/skill:scope "[rough idea]"` |
| Deepen fuzzy intent | `/skill:discover "[description]"` |
| Research the codebase | `/skill:research <alignment-path>` |

### Stage 2 — Plan

Design the solution. Stress-test the architecture. Sequence into implementation phases.

**Skills:**
- `design` — decompose into vertical slices, produces Design doc. Includes option comparison (what was `explore`) when multiple viable approaches need structured evaluation.
- `architecture-review` — stress-test the design against existing architecture.
- `plan` — turn design into phased implementation steps and run the review quality gate.

**Path:** `design` → `plan` (with `architecture-review` feeding design when a structural audit is needed).

**Artifacts:**
- `.myflow/artifacts/designs/` — Design doc with architectural decisions, full implementation code, and per-slice Success Criteria.
- `.myflow/artifacts/plans/` — reviewed implementation plan. `implement` consumes this.

**Checkpoints:** Run `capturing-learnings` after the plan is accepted. Each artifact carries a Context Checkpoint (in-progress state during generation) and a Rehydration Manifest (finalized handoff to the next skill).

**Cross-cutting:** `epiphany-tabling` active. Any realization not trivially in-scope → the personal repo tabled file (`node "${SKILL_DIR}/../_shared/repo-store.mjs" state tabled`).

**Skill invocations:**
| I want to... | Invoke |
|---|---|
| Design then plan | `/skill:design <research>` → `/skill:plan <design>` |
| Stress-test architecture | `/skill:architecture-review` |

### Stage 3 — Implement

Execute the plan. Write the code.

**Primary skill:**
- `implement` — Stage 3 executor. Reads a plan artifact, implements phases, uses TDD/subagents/parallel dispatch as tactics, gates completion on success criteria, and updates automated verification checkboxes.

**Supporting tactics, used inside `implement`:**
- `test-driven-development` — red/green TDD within each phase.
- `implementation-coder` subagents — `implement` may dispatch scoped agents when isolated context helps.
- `dispatching-parallel-agents` — independent investigations or non-overlapping tasks only; never racing edits on shared files.
- `verification-before-completion` — no success claim without fresh evidence.

**Inner loop:** `implement` owns Stage 3. Supporting tactics are implementation strategies inside a phase, not replacement entry points.

**Artifact:** Working tree changes plus plan updates: checked automated verification items and per-phase `Implementation Status` notes for restartability.

**Cross-cutting:** `epiphany-tabling` active. Stage artifacts carry routine state; use `create-handoff` / `resume-handoff` only for unusual mid-stage pauses.

**Skill invocations:**
| I want to... | Invoke |
|---|---|
| Execute the plan | `/skill:implement <plan> [Phase N]` |
| Run TDD discipline | `test-driven-development` |
| Save mid-work state | `/skill:create-handoff` |
| Resume saved state | `/skill:resume-handoff <handoff-path>` |

### Stage 4 — Review

Verify the work. Gate the commit.

**Skills:**
- `validate` — re-check each phase against its success criteria
- `manual-verification` — exercise external services and human-interactive surfaces before close (skip for pure internal refactors)
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

### Stage 5 — Close

Close the cycle. Commit, document, reflect, integrate.

**Skill:** `/skill:close`

**What it does:** 8 steps in 3 groups:
- **Group 1 — Commit & Document:** `commit` → `as-built-documentation`
- **Group 2 — Reflect & Reconcile:** `writing-retros` → `capturing-learnings`
- **Group 3 — Update & Integrate:** Doc/knowledge-graph review → AGENTS.md updates → memory reconcile → status review + resolve tabled items → integrate (merge, PR, keep, or discard)

**Artifacts:** configured as-built/status/runbook/agents paths, personal repo retros/memory/tabled files, git commits.

**Skill invocation:**
| I want to... | Invoke |
|---|---|
| Close out the cycle | `/skill:close` |

## Cross-cutting practices

These practices run continuously across the pipeline, not at a single stage.

### Epiphany tabling (`epiphany-tabling`)

Use `epiphany-tabling` whenever an unexpected realization surfaces mid-task during stages 2-4. Add it to the personal repo tabled file (`node "${SKILL_DIR}/../_shared/repo-store.mjs" state tabled`). Never lose it, never let it derail current work. Resolve tabled items at end-of-artifact checkpoints and during Close.

### Capturing learnings (`capturing-learnings`)

After each approved artifact (stages 1, 2, 4, and 5), run `capturing-learnings`. Apply the rule: **once is a moment; twice is a pattern.** Promote tabled observations to skills, runbooks, or memory only on the second sighting.

### Verification before completion (`verification-before-completion`)

Before any completion claim — a test passing, a phase done, a feature working — run the verification command fresh, read the output, and cite the evidence. No shortcuts.

### Telemetry and replay checkpoints

Each stage should have an explicit checkpoint where the artifact captures workflow signals that help evaluate whether MyFlow is working: artifact path, risk/complexity classification, decisions and corrections, restart recommendation, next-stage choice, and telemetry/session references when available. Stage 1 records these in the alignment artifact's `Replay / Telemetry` section.

Every stage artifact also carries two additional state sections, defined by the shared template at `skills/myflow/templates/stage-context-checkpoint.md`:
- **Context Checkpoint** — written progressively during artifact creation. Tracks status, completed items, working set, and next action.
- **Rehydration Manifest** — written at artifact finalization. Lists artifacts to read, source files to read, key decisions, and the next command.

Together these make each artifact self-contained: the current session's context is checkpointed to disk, and the next session knows exactly what to re-read. Full workflow telemetry events are deferred future work; the checkpoint discipline starts now.

### Stage-boundary restarts

MyFlow expects fresh sessions at natural stage boundaries when context is getting large:

- after Stage 1 completes and the alignment and research artifacts exist
- after Stage 2 design and plan artifacts are accepted
- after Stage 3 implementation completes
- after Stage 4 review passes
- after Stage 5 close completes

At these routine boundaries, resume from the artifact path and the recommended next-stage command. Stage 1 should usually recommend a branch/worktree and a fresh session in that worktree before Stage 2.

### Handoffs (`create-handoff` / `resume-handoff`)

Routine stage boundaries use artifacts as handoffs: alignment artifacts, plans, validation reports, reviews, and as-built docs. If you must stop mid-stage because context is high or work is unexpectedly long, use `/skill:create-handoff`. Resume that exceptional handoff with `/skill:resume-handoff <handoff-path>` in a fresh session. These are lightweight backup tools — artifacts are the primary handoff mechanism.

## Standalone tools

These skills are useful but are not part of the 5-stage pipeline. Invoke them directly when needed.

| Skill | Purpose |
|---|---|
| `pr-triage` | Triage an incoming GitHub pull request before committing review effort |
| `frontend-design` | Inject visual design guidance for frontend work |
| `changelog` | Regenerate CHANGELOG.md from commits since last release |
| `annotate-guidance` | Generate .myflow/guidance/ architecture docs for AI assistants |
| `annotate-inline` | Generate CLAUDE.md files alongside source code |
| `migrate-to-guidance` | Migrate inline CLAUDE.md files to .myflow/guidance/ shadow tree |
| `writing-skills` | Create, edit, or verify MyFlow skills |
| `systematic-debugging` | Structured debugging methodology for bugs and test failures |

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

- **Skipping `close`.** Stage 4 is not the finish line. Close the cycle.
- **Carrying tabled items across cycles.** Resolve every entry during Close.
- **Editing source files during stages 1-2.** Scope, research, design and plan produce artifacts; `implement` (stage 3) edits code.
- **Recomposing slice boundaries.** `design` owns decomposition; `plan` inherits slices 1:1.
- **Letting verification become a rubber stamp.** Evidence first, claims second.
- **Treating observability as optional memory.** Stage checkpoints must record replay/telemetry fields when available.
- **Holding review findings for Close.** Code review happens in stage 4. Close is for closeout, not re-review.

## Quick reference

| Stage | Primary Skill(s) | Artifact Produced |
|---|---|---|
| 1. Scope | `scope`, `research` | Alignment + Research (`.myflow/artifacts/alignment/` + `.myflow/artifacts/research/`) |
| 2. Plan | `design`, `plan` | Design + Plan (`.myflow/artifacts/designs/` + `.myflow/artifacts/plans/`) |
| 3. Implement | `implement` + TDD, implementation subagents | Working tree changes + plan verification checkboxes |
| 4. Review | `validate`, `manual-verification`, `code-review`, `revise` | Validation + Manual Verification + Review |
| 5. Close | `close` (→ commit, as-built, retro...) | Configured repo docs + personal repo retros/memory |

| I want to... | Invoke |
|---|---|
| Onboard a repo | `/skill:setup-myflow` |
| See the pipeline | `/skill:myflow` |
| Begin new work | `/skill:scope "..."` |
| Deepen fuzzy requirements | `/skill:discover "..."` |
| Understand the codebase | `/skill:research <artifact-or-topic>` |
| Design then plan | `/skill:design <research>` → `/skill:plan <design>` |
| Execute the plan | `/skill:implement <plan> [Phase N]` |
| Run TDD | `test-driven-development` |
| Verify implementation | `/skill:validate <plan>` |
| Verify external deps manually | `manual-verification` |
| Review changes | `/skill:code-review [scope]` |
| Process review feedback | `receiving-code-review` |
| Update plan from review | `/skill:revise <plan-path>` |
| Commit changes | `/skill:commit` |
| Close out the cycle | `/skill:close` |
| Table a mid-flight realization | `/skill:epiphany-tabling` |
| Run end-of-artifact checkpoint | `/skill:capturing-learnings` |
| Create a handoff | `/skill:create-handoff` |
| Resume a handoff | `/skill:resume-handoff <handoff-path>` |

## See also

- `setup-myflow` — onboarding skill
- `close` — stage 5 closeout (8 steps in 3 groups)
- `epiphany-tabling` — scope control
- `capturing-learnings` — promotion rule and end-of-artifact checkpoints
- `verification-before-completion` — evidence-first discipline
- `manual-verification` — live-dependency and human-surface verification before close
- `docs/runbooks/monitor-upstream-evolution.md` — upstream tracking
- Pipeline visual: `docs/myflow-v3-pipeline.html`
