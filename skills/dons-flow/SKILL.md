---
name: dons-flow
description: Use when starting or navigating a major piece of work to apply the integrated Superpowers + RPIV + Don's closeout workflow
---

# Don's Flow

**Version 2** of the developer workflow for Don Smith. It composes three independent systems into one working practice:

1. **Superpowers** — Jesse Vincent's agentic methodology: Socratic design, bite-sized plans, red/green TDD, and subagent-driven execution. It is the system that got Don here.
2. **RPIV** — Juice Sharp's observable, artifact-chained delivery pipeline. It adds deliberate checkpoints, self-reflection, and a durable paper trail.
3. **Don's closeout discipline** — the `land` ritual, `epiphany-tabling`, as-built documentation, retros, and memory reconciliation. It closes the cycle so the next one starts clean.

This skill is the map. It does not replace the skills it references — it helps you choose which path to take for a given piece of work, and reminds you which conventions must stay true across all of them.

## Announce at start

> "I'm using the `dons-flow` skill to run the Superpowers + RPIV + closeout triad."

## When to use this skill

- At the **start** of a new piece of work, to choose Superpowers-led, RPIV-led, or mixed mode.
- When you are **mid-work** and unsure whether to keep going, hand off, revise, or close out.
- At the **end** of a validated implementation, to begin the `land` closeout ritual.
- When onboarding a fresh repo to this workflow.

## Required installed packages

This skill assumes the following are available:

- **Superpowers** — the upstream methodology. Installed as a harness plugin (Claude, Codex, Gemini, Cursor, Copilot, etc.), not via npm. See `setup-dons-flow` for per-harness commands. This is the only manual install step.
- **RPIV** (`@juicesharp/rpiv-pi`) — the observable delivery pipeline. Peer dependency; auto-installed with npm 7+ when you install `@locksmithdon/dons-flow`.
- **Pi subagent runtime** (`@tintinweb/pi-subagents`) — runtime used by RPIV. Peer dependency; auto-installed with npm 7+ when you install `@locksmithdon/dons-flow`.
- **Don's Flow** (`@locksmithdon/dons-flow`) — this package, which adds closeout and discipline skills.

If RPIV or the subagent runtime is missing, install them explicitly. If Superpowers is missing, this package's ported skills still provide the closeout workflow, but you will not have access to the upstream Superpowers entry points like `brainstorming` or `test-driven-development`.

## Before you start

If this repo has not been onboarded yet, run:

```bash
/skill:setup-dons-flow
```

That skill checks prerequisites, detects Superpowers, installs RPIV's sibling extensions via `/rpiv-setup`, and creates the repo-owned conventions (`docs/tabled.md`, `docs/status.md`, `docs/memory/`, `docs/changes/`, `docs/retros/`, `docs/runbooks/`, `AGENTS.md`).

## Three modes of working

Don's Flow is not a single mandatory pipeline. Choose the mode that fits the work.

### Mode A — Superpowers-led

Best when the problem is well-shaped and you want autonomous, TDD-driven execution.

```
brainstorming → writing-plans → subagent-driven-development → verification-before-completion → land
```

Use RPIV only if you hit a research or validation gap that Superpowers does not cover on its own.

### Mode B — RPIV-led

Best when the problem needs discovery, research, or a durable decision trail.

```
discover → research → blueprint → implement → validate → code-review → commit → land
```

Use Superpowers inside `implement` for TDD and subagent execution if you want its inner-loop discipline.

### Mode C — Mixed default

Best for substantial work where you want both reflection and autonomy.

```
discover → research → blueprint → implement (with Superpowers TDD + subagents) → validate → code-review → commit → land
```

Between every major artifact, run `capturing-learnings`. During execution, keep `epiphany-tabling` active. If you stop mid-work, use `create-handoff` / `resume-handoff`.

## The RPIV path in detail

When you choose Mode B or C, the pipeline below is the default. Each arrow is a skill invocation. Each skill produces or updates an artifact.

```
Discover → Research → Design/Blueprint → Plan → Implement → Validate → Review → Commit → Land
```

### 1. Discover — capture intent

**Skill:** `/skill:discover "[feature description]"`

**When:** The problem is not yet fully shaped; you need to extract goals, non-goals, constraints, acceptance criteria, and decisions before touching code.

**What it produces:** `.rpiv/artifacts/discover/YYYY-MM-DD_HH-MM-SS_<topic>.md` — a Feature Requirements Document (FRD).

**Integration note:** If you already have a written spec or ticket, pass its path to `discover` for refinement. For free-form ideation, run Superpowers `brainstorming` first and feed the result into `discover`.

**End-of-artifact checkpoint:** After the FRD is written, run `capturing-learnings` before proceeding. Process any `docs/tabled.md` entries that surfaced during the interview.

### 2. Research — ground intent in code

**Skill:** `/skill:research .rpiv/artifacts/discover/<latest>.md`

**When:** You have an FRD and need to understand the codebase reality that will shape the design.

**What it produces:** `.rpiv/artifacts/research/<slug>_<topic>.md`

**Integration note:** The FRD's `Decisions` block becomes research's Developer Context. Carry any unresolved Open Questions forward.

**End-of-artifact checkpoint:** Run `capturing-learnings` after research is accepted.

### 3. Design / Blueprint / Explore — decide the shape

**Option A — compare approaches first:** `/skill:explore "[problem]"` → `/skill:design .rpiv/artifacts/solutions/<latest>.md`

**Option B — full design artifact:** `/skill:design .rpiv/artifacts/research/<latest>.md`

**Option C — fast path for smaller work:** `/skill:blueprint .rpiv/artifacts/research/<latest>.md`

**When:** Multiple valid approaches exist → `explore`. The design is itself a deliverable or the work is large/cross-cutting → `design` then `plan`. The work is well-understood and you want an implement-ready plan in one pass → `blueprint`.

**What it produces:**
- `explore` → `.rpiv/artifacts/solutions/<slug>_<topic>.md`
- `design` → `.rpiv/artifacts/designs/<slug>_<topic>.md`
- `blueprint` → `.rpiv/artifacts/plans/<slug>_<topic>.md`

**Integration note:** `blueprint` fuses `design` + `plan`. It is the closest RPIV equivalent to the Superpowers `writing-plans` + `subagent-driven-development` combo, but it is codebase-grounded and reviewed.

**End-of-artifact checkpoint:** Run `capturing-learnings` after the design or plan is accepted.

### 4. Plan — sequence the work

**Skill:** `/skill:plan .rpiv/artifacts/designs/<latest>.md`

**When:** You ran `design` separately and now need a phased implementation plan.

**What it produces:** `.rpiv/artifacts/plans/<slug>_<topic>.md`

**Integration note:** Skip this step if you used `blueprint`, which already emitted a plan.

**End-of-artifact checkpoint:** Run `capturing-learnings` after the plan is accepted.

### 5. Implement — execute phase by phase

**Skill:** `/skill:implement .rpiv/artifacts/plans/<latest>.md [Phase N]`

**When:** The plan is `status: ready`.

**What it does:** Applies the plan's code changes to the working tree.

**Integration notes:**
- Keep `epiphany-tabling` active. Any realization, fork, or follow-up that is not trivially cheap and in-scope goes into `docs/tabled.md`.
- Apply `verification-before-completion` discipline: no success claim without fresh verification evidence.
- If a session ends mid-implementation, run `/skill:create-handoff`.
- If code reality diverges from the plan, surface it via implement's mismatch flow or run `/skill:revise <plan-path>` first.
- In mixed mode, invoke Superpowers `test-driven-development` and `subagent-driven-development` inside this phase for the inner loop.

### 6. Validate — verify against the plan

**Skill:** `/skill:validate .rpiv/artifacts/plans/<latest>.md`

**When:** Implementation is complete (or you need a checkpoint).

**What it produces:** `.rpiv/artifacts/validation/<slug>_<topic>.md` with a `verdict: pass | fail`.

**Integration note:** Do not proceed to `commit` or `land` if `verdict: fail`. Fix gaps, then re-run `validate`.

### 7. Review — structured code review

**Skill:** `/skill:code-review [scope]`

**When:** After validate passes and before committing.

**What it produces:** `.rpiv/artifacts/reviews/<slug>_<scope>.md`

**Integration note:** The `land` skill's step 1 (code review) can consume this artifact. Fix small findings now; table substantive ones in `docs/tabled.md`.

### 8. Commit — atomic, logical commits

**Skill:** `/skill:commit [message-hint]`

**When:** The working tree contains validated changes ready to be committed.

**What it does:** Groups staged/unstaged changes into logical commits.

**Integration note:** On a feature branch, you may commit close-out artifacts (as-built, retro, memory updates) separately. On `main`, present commit groupings for human approval.

### 9. Land — close the cycle

**Skill:** `/skill:land`

**When:** The implementation is verified, reviewed, and committed (or about to be merged).

**What it does:** Runs the 10-step closeout ritual:

1. Code review
2. Architectural review
3. Security review
4. As-built documentation (`as-built-documentation`)
5. Doc / knowledge-graph review
6. AGENTS.md updates
7. Memory reconcile
8. Retro (`writing-retros`)
9. Status review + resolve `docs/tabled.md`
10. Integrate (`finishing-a-development-branch`)

**Integration note:** `land` is the cycle boundary neither Superpowers nor RPIV provides. It is the most important addition this package makes.

## Monitoring the relationship

We intentionally deferred deciding how to track Superpowers long-term. Review monthly using:

- `docs/memory/monitor_upstream_evolution.md` — decision context and last review date
- `docs/runbooks/monitor-upstream-evolution.md` — the check-in process

After 2–3 projects, decide whether to keep the harness-plugin arrangement, fork Superpowers, or drop the peer dependency.

## Cross-cutting practices

These practices run continuously across the workflow, not at a single stage.

### Epiphany tabling

Use `epiphany-tabling` whenever an unexpected realization surfaces mid-task. Add it to `docs/tabled.md`. Never lose it, never let it derail current work. Resolve tabled items at end-of-artifact checkpoints and during `land` step 9.

### Verification before completion

Before any completion claim — a test passing, a phase done, a feature working — run the verification command fresh, read the output, and cite the evidence. No shortcuts.

### Capturing learnings

After each approved artifact (FRD, research, design, plan, major commit set), run `capturing-learnings`. Apply the rule: **once is a moment; twice is a pattern.** Promote tabled observations to skills, runbooks, or memory only on the second sighting.

### Handoffs

If you must stop mid-work, use `/skill:create-handoff`. Resume with `/skill:resume-handoff .rpiv/artifacts/handoffs/<latest>.md` in a fresh session.

## Repo conventions this workflow expects

Your codebase should contain these documents and folders. They are owned by the team, not by any package:

| Path | Purpose |
|---|---|
| `docs/tabled.md` | Working memory for epiphanies and deferred work (resolved to empty each cycle) |
| `docs/status.md` | Living status: Recently Completed, What's Next, etc. |
| `docs/memory/` | Persistent project/session memory entries |
| `docs/memory/MEMORY.md` | Index of memory entries |
| `docs/changes/` | As-built documentation: what shipped and why |
| `docs/retros/` | Frozen retrospective documents |
| `docs/runbooks/` | Multi-skill processes and practices |
| `AGENTS.md` | Repo-level agent guidance |

## What lives in the codebase vs. what lives in the developer's package

**In the codebase:** `docs/changes/`, `docs/retros/`, `docs/status.md`, `docs/memory/`, `AGENTS.md`, and the actual code changes.

**In this package:** the skills, runbooks, and workflow conventions. They travel with the developer across repos.

## Anti-patterns

- **Skipping `land`.** `validate` is not the finish line. Close the cycle.
- **Carrying `docs/tabled.md` across cycles.** Resolve every entry during `land` step 9.
- **Treating one system as the only system.** Superpowers, RPIV, and Don's closeout each have a zone of excellence. Choose deliberately.
- **Editing source files during discover/research/design/plan.** Those skills produce artifacts; `implement` edits code.
- **Recomposing RPIV slice boundaries.** `design`/`blueprint` owns decomposition; `plan` inherits slices 1:1.
- **Letting verification become a rubber stamp.** Evidence first, claims second.

## Quick reference

| I want to... | Invoke |
|---|---|
| Onboard a repo | `/skill:setup-dons-flow` |
| Choose a workflow mode | `/skill:dons-flow` |
| Ideate / refine a design | `brainstorming` |
| Capture intent (RPIV) | `/skill:discover "..."` |
| Understand the codebase | `/skill:research <artifact-or-topic>` |
| Compare options | `/skill:explore "..."` |
| Design + plan separately | `/skill:design <research>` → `/skill:plan <design>` |
| Design + plan together | `/skill:blueprint <research>` |
| Write a Superpowers plan | `writing-plans` |
| Execute the plan (RPIV) | `/skill:implement <plan> [Phase N]` |
| Execute with subagents (Superpowers) | `subagent-driven-development` |
| Run TDD | `test-driven-development` |
| Verify implementation | `/skill:validate <plan>` |
| Review changes | `/skill:code-review [scope]` |
| Commit changes | `/skill:commit` |
| Close out the cycle | `/skill:land` |
| Table a mid-flight realization | `/skill:epiphany-tabling` |
| Run an end-of-artifact checkpoint | `/skill:capturing-learnings` |
| Create a handoff | `/skill:create-handoff` |
| Resume a handoff | `/skill:resume-handoff <handoff-path>` |

## See also

- Superpowers: [obra/superpowers](https://github.com/obra/superpowers)
- RPIV README: `@juicesharp/rpiv-pi`
- `setup-dons-flow` — onboarding skill
- `land` — the 10-step closeout
- `epiphany-tabling` — scope control
- `capturing-learnings` — promotion rule and end-of-artifact checkpoints
- `verification-before-completion` — evidence-first discipline
- `docs/runbooks/monitor-upstream-evolution.md` — how to track RPIV and Superpowers over time
