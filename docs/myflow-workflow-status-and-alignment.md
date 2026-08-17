# MyFlow workflow status and alignment

**Status:** Active coordination record for the MyFlow workflow refactor.

This is the single working record for decisions, remaining work, and skill alignment. It replaces the former stage map and inventory assessment. The normative artifact interface is in [artifact and stage-boundary contract](artifact-and-stage-boundary-contract.md); this document does not duplicate it.

## Document roles

- **This document** — current decisions, alignment inventory, and ordered work.
- **Artifact and stage-boundary contract** — normative stage/artifact interface and right-sized workflow paths.
- **`README.md`** — public overview; update after the active skills are aligned.
- **Repository map** — per-repository policy and sources, created by `onboard`.

## Confirmed workflow

MyFlow has five work stages, each with one canonical orchestrator: **Scope → Plan → Implement → Verify → Close**.

```text
Onboard repository (when needed)
  → Scope → Plan → Implement → Verify → Close
```

| Stage | Canonical orchestrator | Role |
|---|---|---|
| Onboarding | `onboard` | Discover repository-specific instructions, policies, locations, local capabilities, and unknowns. |
| Scope | `scope` | Collaboratively establish intended outcome, acceptance criteria, risk, and appropriate workflow depth. |
| Plan | `plan` | Produce implementation authority, using a standalone `design` artifact only when justified. |
| Implement | `implement` | Autonomously execute accepted plan phases and commit each green phase. |
| Verify | `validate` | Validate plan execution, invoke `code-review`, and prepare human manual verification. |
| Close | `close` | Complete applicable documentation, learning, delivery, and final-closeout work collaboratively. |

`myflow` is the workflow map and navigation layer, not a competing stage.

### Artifact and worktree decisions

- `onboard` uses `skills/myflow/scripts/resolve-repository-map.mjs`: an existing repository-local `.myflow/repository-map.md` wins; otherwise it creates or refreshes a personal global map keyed by normalized `origin` or a common-Git-directory hash. Maps/onboarding records are repository-level; workstream artifacts remain local.
- A **workstream** is one bounded piece of work from Scope through Close. Its filesystem-safe **workstream ID** is established before the first durable workstream artifact is written. A branch name may derive from it, but is optional.
- Workstream artifacts live together at `.myflow/workstreams/<workstream-id>/` by default. This keeps each workstream's progress visible and prevents old artifacts from being mistaken for the current task.
- Scope offers an isolated branch/worktree after it can name the workstream and before the durable alignment artifact is finalized. In trunk-based repositories, it records the same workstream ID and continues in the current checkout.
- A fresh session normally resumes from the workstream manifest and current stage artifact in that directory. Mid-stage interruptions use a handoff in the same workstream directory.

### Planning-depth decisions

- Every executable plan has a **design disposition**: locked into existing architecture, localized design, or structural design required.
- A truly trivial, uninterrupted change may remain in conversation. If it expands or pauses, write a lightweight plan before continuing.
- Low-risk but worthwhile work uses a concise persisted plan. A standalone design artifact is optional.
- Structural, uncertain, multi-phase, or high-risk work uses specialist evidence and a standalone design artifact where appropriate.

## Retained roles and decisions

### Cross-cutting primitives

- `create-handoff` / `resume-handoff` are the canonical exceptional-handoff pair.
- `epiphany-tabling` preserves follow-up ideas without expanding current scope.
- `diagnosing-bugs` is the canonical evidence-first debugging skill; `systematic-debugging` is retired.
- `tdd` is the canonical TDD skill. It primarily shapes Plan/design test seams and the verification map; implementation re-invokes it only for uncovered behavior or a revealed design gap.
- `domain-modeling` is a cross-cutting specialist when domain language or boundaries are unclear or changing.
- `codebase-design` provides shared deep-module vocabulary; it is not a stage.

### Layered specialist families

- `grilling` is the model-invocable decision-tree technique.
- `grill-me` is the stateless, stage-agnostic entry point.
- `grill-with-docs` is a repository-scoped Scope specialist and supplements, never replaces, the alignment artifact.
- `architecture-review` is a broad structural audit selected by Plan or onboarding.
- `improve-codebase-architecture` is a focused Scope entry branch for technical-debt/deepening exploration.

### Retired from MyFlow

`handoff`, `as-built-documentation`, `to-spec`, `to-tickets`, `loop-me`, `triage`, `test-driven-development`, and `systematic-debugging` are retired. Retained skills must not require them.

## Alignment inventory

| Area | Target contract | Status / next action |
|---|---|---|
| Onboarding | Resolver-selected repository map, run report, evaluation record; no assumed local-only filename | **Phase 1 aligned.** Validate global and local compatibility in real repositories. |
| Scope | Code-light, right-sized alignment; establish workstream ID; select specialists rather than force research; offer worktree/trunk path | **Aligned initial version.** Pilot and refine its worktree and depth decisions. |
| Research / discover | Optional Scope specialists with discoverable evidence and explicit return to Scope/Plan | **Research aligned initial version.** `discover` still needs its interface review. |
| Design / Plan | Design disposition always; lightweight plan path; full design only when structural; plan is executable authority | **Aligned initial version.** Pilot the lightweight and structural paths; refine templates from evidence. |
| Implement | Consume accepted plan; resolver-aware checkpoint and commit each green phase; expose manual verification | **Aligned.** |
| Verify | Validation, code review, conditional manual-verification brief; corrective loops to owner | **Aligned.** |
| Close | Right-sized closeout, final closeout commit, delivery status, follow-up disposition | **Aligned.** |
| Architecture specialists and recovery/learning | Resolver-aware sources, reusable artifacts, design handoff, proportionate recovery | **Aligned initial sweep.** |
| Telemetry and evaluation | Local evaluation records plus privacy-safe optional telemetry | **Explicitly deferred and non-blocking.** |
| Documentation | README/public overview agrees with active workflow | **Aligned with desk scenarios.** |

## Ordered work

1. **Repository-map resolver and canonical discovery migration** — a tested resolver selects local/origin/common-Git-dir/override maps; canonical early-stage skills and templates record resolved paths. **Complete.**
2. **Workstream artifact layout and Scope → Plan slice** — establish the workstream ID/layout and retain the aligned optional-specialist/design-disposition/Plan interface. **Initial implementation complete.** This was documentation and skill-instruction work, not a pilot in another repository.
3. **Implement → Verify, Close, and retained-skill slices** — resolver-aware checkpoints, validation/review/manual evidence, proportionate closeout, and initial retained-skill sweep. **Complete.**
4. **Public documentation and scenario testing** — README/contract/status coherence plus trivial, medium, and structural desk scenarios. **Complete.**
5. **Next action: real end-to-end pilot** — use the workflow for one bounded product workstream, capture evaluation/retro evidence only when warranted, and tune from observed friction. Telemetry/evaluation redesign remains explicitly deferred and non-blocking.

## Operating rule

Do not treat this as a one-time specification exercise. Each aligned slice should be tried in real work, evaluated, and revised when evidence shows friction or ambiguity. The contract gives the workflow a stable interface; the skills remain deliberately iterative.
