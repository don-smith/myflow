# Stage 2 Design & Planning Restructure

## Quick Reference

- **Date:** 2026-06-29
- **Key files:** `skills/design/SKILL.md`, `skills/plan/SKILL.md`, `extensions/core/built-in-workflows.ts`, `extensions/core/artifact-collector.ts`, workflow tests under `extensions/core/` and `packages/workflow/`
- **Key concepts:** flow over ceremony, right-sized rigor, design/plan boundary, artifact-driven handoffs, workflow refresh, Stage 2 consolidation
- **One-line summary:** Removed the separate `blueprint` skill and collapsed Stage 2 onto `research/explore → design → plan → implement`, preserving quality gates while reducing duplicated process and skill-choice friction.

## Background Context

MyFlow v3 combined three previously separate sources of process: Superpowers skills, RPIV skills, and personal closeout/tabling practices. That consolidation created a single five-stage workflow, but after real use it became clear that the combined system was heavier than intended. It preserved rigor, artifacts, planning, verification, and reflection, but it also introduced too much ceremony: too many entry points, overlapping skills, repeated review gates, and unclear choices about which path to take.

The Stage 1 refresh addressed the front door by introducing `start` as the canonical adaptive alignment entry point. Stage 2 was the next friction point. The design/planning layer had five named skills — `research`, `explore`, `design`, `blueprint`, and `plan` — with overlapping responsibilities. In practice this made it hard to build momentum. The process was time-consuming, felt bloated, and did not feel "flowy": the developer often had to think about the workflow itself instead of the work.

This branch is part of a larger stage-by-stage workflow refresh. The goal is not to remove discipline. The goal is to make each stage more intentional: understand what the stage is for, what each skill contributes, what artifact is produced, and where rigor matters most. MyFlow should provide the right level of quality, architectural thought, and verification without making every change feel like paperwork.

## How Stage 2 Works Now

Stage 2 now has one implementation path:

```text
research/explore → design → plan → implement
```

- `research` grounds the work in codebase reality and produces a research artifact.
- `explore` remains available when multiple solution options need comparison and produces a solutions artifact.
- `design` owns architectural decomposition. It accepts research, solutions, architecture-review, code-review, or free-text input and produces a durable design artifact under `.myflow/artifacts/designs/`.
- `plan` consumes a design artifact, preserves design slices as implementation phases 1:1, runs the post-finalization artifact reviewer pair, and produces the implement-ready plan under `.myflow/artifacts/plans/`.
- `implement` continues to consume plan artifacts only.

The deleted `blueprint` skill used to provide a fast fused design+plan path. Its useful standalone/free-text behavior was absorbed into `design`; its plan-producing role is now handled through `plan`.

## Key Decisions

### Collapse the two Stage 2 paths into one path

**What:** Removed the separate `blueprint` path. Stage 2 now routes through `design → plan` before implementation.

**Why:** The previous fast/complex distinction asked the developer to choose between workflow shapes (`blueprint` vs `design → plan`) before the work was fully understood. That choice created friction and duplicated maintenance. Complexity is now expressed through inputs: a small free-text topic can go directly to `design`, while larger work can pass through `research` or `explore` first.

**Regression risk:** medium

**Rejected alternative:** Keep both paths and document when to use each. Rejected because the skill bodies had substantial overlap and future changes would continue to drift.

### Preserve two Stage 2 artifacts: design and plan

**What:** `design` produces `artifactKind: design`; `plan` produces `artifactKind: plan`. `design` does not emit a plan artifact directly.

**Why:** Design and plan have different lifecycles. The design artifact is durable: it captures architecture, decisions, file map, and slice decomposition. The plan artifact is more ephemeral: it sequences work for Stage 3 implementation and validation. Keeping both artifacts preserves clean handoffs without requiring a novel dual-output skill contract.

**Regression risk:** medium

**Rejected alternative:** Have `design` emit both design and plan artifacts. Rejected because MyFlow skill contracts assume one produced `artifactKind` per skill, and dual-output behavior would complicate workflow tooling.

### Move post-finalization review to `plan`

**What:** The artifact-code-reviewer and artifact-coverage-reviewer pair runs from `plan`, not from both `blueprint` and `plan`.

**Why:** The old model duplicated roughly the same post-finalization review process in two places. `plan` is the point where code, success criteria, and phase boundaries are visible together, so it is the right quality gate for reviewing implementation readiness.

**Regression risk:** low

### Keep `plan` mechanically thin on purpose

**What:** `plan` inherits design slices as phases 1:1. It does not recompose boundaries or reauthor success criteria.

**Why:** Architectural decomposition belongs to `design`. If `plan` can reshape boundaries, it can invalidate the slice-verifier work already done during design. Plan's job is sequencing, plan-document creation, and final review — not redesign.

**Regression risk:** medium

### Insert explicit `plan` stages into built-in workflows

**What:** Built-in implementation workflows now route former `blueprint → implement` edges through `design → plan → implement`.

**Why:** `design` publishes `designs`, while `implement` reads `plans`. A mechanical `blueprint` → `design` rename would break artifact compatibility. The explicit `plan` stage preserves the artifact handoff contract.

**Regression risk:** high if future workflow edits bypass `plan`.

### Treat full-pipeline smoke testing as ongoing workflow validation

**What:** Automated validation passed for the restructure, but the optional manual `start → research → design → plan → implement → validate` smoke test is not a merge blocker.

**Why:** This is workflow process design, not a contained application feature. The meaningful verification is continued use while refreshing the remaining stages. Blocking the merge on a synthetic feature would slow the broader refresh and test only a snapshot of a workflow that is intentionally still evolving.

**Regression risk:** low, as long as issues found during real use are captured and fed into later stage refreshes.

## How It Works Now

The current Stage 2 contracts are:

| Skill | Role | Output |
| --- | --- | --- |
| `research` | Answer structured questions about codebase reality | `.myflow/artifacts/research/` |
| `explore` | Compare viable solution options | `.myflow/artifacts/solutions/` |
| `design` | Shape architecture and slice decomposition | `.myflow/artifacts/designs/` |
| `plan` | Convert design slices to phases and run final artifact review | `.myflow/artifacts/plans/` |

`blueprint` no longer exists as a current skill. Historical docs may still mention RPIV's blueprint terminology, but active skill prose and built-in workflows should not route users to `/skill:blueprint`.

## Constraints & Gotchas

- `implement` consumes plans, not designs. Any workflow path to implementation must produce a plan first.
- `design` owns architecture and slice boundaries. `plan` should not split, merge, or reorder slices except by returning the developer to design.
- The `polish` workflow is special: architecture-review phases first produce designs, each design is converted to a plan, then implementation fans out over latest plans.
- `.myflow/artifacts/` files are useful working context but are not tracked by default. Durable decisions must be promoted into `docs/changes/` or another tracked documentation path before deleting a worktree.
- The workflow will continue to evolve. Treat this document as the durable rationale for this Stage 2 shape, not as a claim that the entire MyFlow refresh is finished.

## Verification Summary

Automated validation for the Stage 2 restructure passed in `.myflow/artifacts/validation/2026-06-27_04-18-55_stage-2-design-planning-restructure.md`.

Key checks included:

- `skills/blueprint/SKILL.md` deleted.
- `design` produces `artifactKind: design` and supports standalone/free-text mode.
- `plan` produces `artifactKind: plan`, consumes design artifacts, and owns the reviewer pair.
- Built-in workflows route through `design → plan → implement` with no direct `design → implement` edges.
- In-scope skill files no longer reference `blueprint`, `continue_to_blueprint`, or `/skill:blueprint`.
- Focused workflow and contract test suites passed.

The full-pipeline manual smoke test remains a useful future confidence check but is intentionally not blocking this branch from merging.

## Future-Stage Carry-Forward

The same refresh lens should be applied to Stages 3, 4, and 5:

1. **Flow over ceremony:** every step should help momentum or be removed/merged.
2. **Rigor where it matters:** preserve quality gates at the points of highest leverage.
3. **Artifact-led handoffs:** each stage should have a clear input and output artifact/state.
4. **Right-sized conversations:** skills should avoid asking for more interaction than the work needs.
5. **Observability by default:** stage checkpoints should capture enough replay/telemetry context to improve the workflow later.
6. **Five-stage structure preserved:** the refresh is about what happens inside each stage, not replacing the overall taxonomy.

Likely next areas:

- Stage 3: clarify how `implement`, TDD, subagent-driven development, and parallel dispatch compose without creating competing execution paths.
- Stage 4: clarify validation, manual verification, code review, and revise loops.
- Stage 5: ensure closeout, documentation, changelog, retros, and learning capture are useful without becoming a heavy ritual.

## Source Artifacts

This document distills the ignored planning artifacts from the Stage 2 worktree:

- `.myflow/artifacts/alignment/2026-06-26_23-50-19_stage2-design-planning-audit.md`
- `.myflow/artifacts/solutions/2026-06-27_00-21-41_stage2-design-planning-restructure.md`
- `.myflow/artifacts/designs/2026-06-27_00-56-37_stage2-design-planning-restructure.md`
- `.myflow/artifacts/plans/2026-06-27_03-03-05_stage2-design-planning-restructure.md`
- `.myflow/artifacts/validation/2026-06-27_04-18-55_stage-2-design-planning-restructure.md`
