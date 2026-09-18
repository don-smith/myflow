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
| Implement | `implement` | Autonomously execute accepted plan phases, commit each green phase, then continue to Verify in the same parent session. |
| Verify | `verify` | Load and execute `code-review` with the exact implementation scope and accepted plan, then prepare human manual verification. |
| Close | `close` | Require linked passing review evidence, then complete applicable documentation, learning, delivery, and final-closeout work collaboratively. |

After the final green phase, Implement reads the installed `verify` skill and executes it immediately in the same parent session. Invoking `verify` by hand is recovery/rehydration guidance only, not a user-operated gate. Verify runs fresh Correctness and Risk, Standards and Maintainability, and Spec Fidelity lanes. Confirmed P0/P1 findings block; P2 does not block. Close inspects linked passing review evidence and its plan/scope provenance instead of trusting only a validation report's top-level verdict.

`myflow` is the workflow map and navigation layer, not a competing stage.

### Artifact and worktree decisions

- `onboard` uses `skills/myflow/scripts/resolve-repository-map.mjs`: an existing repository-local `.myflow/repository-map.md` wins; otherwise it creates or refreshes a personal global map keyed by normalized `origin` or a common-Git-directory hash. Maps and onboarding records are repository-level. Workstream artifacts live in the configured artifact store, and the resolver reports its `workstreamRoot`, `storeMode`, and `storeFallback`.
- A **workstream** is one bounded piece of work from Scope through Close. Its filesystem-safe **workstream ID** is established before the first durable workstream artifact is written. A branch name may derive from it, but is optional.
- Workstream artifacts live together under the resolver's `workstreamRoot`, one directory per workstream ID. The developer chooses whether that root is the MyFlow home or the checkout; the contract records both modes. This keeps each workstream's progress visible and prevents old artifacts from being mistaken for the current task.
- Scope offers an isolated branch/worktree after it can name the workstream and before the durable alignment artifact is finalized. In trunk-based repositories, it records the same workstream ID and continues in the current checkout.
- A fresh session normally resumes from the workstream manifest and current stage artifact in that directory. Mid-stage interruptions use a handoff in the same workstream directory.

### Planning-depth decisions

- Every executable plan has a **design disposition**: locked into existing architecture, localized design, or structural design required.
- A truly trivial, uninterrupted change may remain in conversation. If it expands or pauses, write a lightweight plan before continuing.
- Low-risk but worthwhile work uses a concise persisted plan. A standalone design artifact is optional.
- Structural, uncertain, multi-phase, or high-risk work uses specialist evidence and a standalone design artifact where appropriate.

## Retained roles and decisions

### Cross-cutting primitives

- `handoff` is the canonical exceptional-handoff skill, in write and resume modes.
- `stage-boundary.mjs` is the single lifecycle seam. Each stage runs `enter`, `accept`, `exit`, and `return`; no skill assembles journal events or idempotency keys.
- `technical-writing` is the cross-cutting documentation skill, used by Close.
- `diagnosing-bugs` is the canonical evidence-first debugging skill; `systematic-debugging` is retired.
- `tdd` is the canonical TDD skill. It primarily shapes Plan/design test seams and the verification map; implementation re-invokes it only for uncovered behavior or a revealed design gap.
- `domain-modeling` is a cross-cutting specialist when domain language or boundaries are unclear or changing.
- `codebase-design` provides shared deep-module vocabulary; it is not a stage.
- Stage feedback is a private one-question pulse recorded by the boundary command into the workstream's `feedback/` folder. Only its coverage status reaches the lifecycle journal.

### Layered specialist families

- `grill-me` is the model-invocable decision-tree technique and the stage-agnostic entry point. For a repository-scoped decision it supplements, never replaces, the alignment artifact.
- `discover` is the deeper requirements branch Scope selects when the concept is still fuzzy. It questions in `grill-me` rounds and returns to Scope.
- `research`, `prototype`, `domain-modeling`, and `tdd` are the remaining specialists. Scope selects only the ones the work needs.

### Retired from MyFlow

`as-built-documentation`, `to-spec`, `to-tickets`, `loop-me`, `triage`, `test-driven-development`, and `systematic-debugging` are retired. Retained skills must not require them.

### Parked, not retired

The core ships 20 skills. Material this core no longer ships is preserved under `parked/`: the specialist skills (including `architecture-review`, `improve-codebase-architecture`, `unslop`, `epiphany-tabling`, and `observing-myflow`), the subagent definitions, the telemetry extension, and the observation, evaluation, and publication tests. Nothing under `parked/` is packaged, tested, or referenced by a core skill. A future workstream revives anything that earns its place back.

## Alignment inventory

| Area | Target contract | Status / next action |
|---|---|---|
| Onboarding | Resolver-selected repository map, run report, evaluation record; no assumed local-only filename | **Phase 1 aligned.** Validate global and local compatibility in real repositories. |
| Scope | Code-light, right-sized alignment; establish workstream ID; select specialists rather than force research; offer worktree/trunk path | **Aligned initial version.** Pilot and refine its worktree and depth decisions. |
| Research / discover | Optional Scope specialists with discoverable evidence and explicit return to Scope/Plan | **Research aligned initial version.** `discover` still needs its interface review. |
| Design / Plan | Design disposition always; lightweight plan path; full design only when structural; plan is executable authority | **Aligned initial version.** Pilot the lightweight and structural paths; refine templates from evidence. |
| Implement | Consume accepted plan; resolver-aware checkpoint and commit each green phase; expose manual verification; automatic same-parent Verify transition; bounded corrective phase from linked findings after failed Verify | **Aligned with automatic Verify transition and corrective-phase contract.** |
| Verify | Validation, immediate sibling-skill code review with three fresh-context lanes (Correctness and Risk, Standards and Maintainability, Spec Fidelity), independent P0/P1 verification, exact implementation scope (range or commit-list), durable review provenance, conditional manual-verification brief; corrective loops to owner | **Aligned with executable three-lane review composition and commit-list scope.** |
| Close | Require valid linked review evidence with matching plan and exact scope provenance; right-sized closeout, final closeout commit, delivery status, follow-up disposition | **Aligned with review-evidence gate and scope-provenance check.** |
| Architecture specialists and recovery/learning | Resolver-aware sources, reusable artifacts, design handoff, proportionate recovery | **Aligned initial sweep.** |
| Artifact store and stage boundary | User-configured artifact location and optional private remote; one boundary command per stage edge; host and session recorded only where the environment names them | **Aligned.** Confirmed host rows are added as each agent is smoke-tested. |
| Packaging | One skill tree, one documented install step per agent, no per-agent skill copies | **Aligned.** Per-agent install smoke tests are the outstanding evidence. |
| Observation and evaluation | Parked. Pull-based JSONL observation, exports, and rollups are preserved under `parked/` | **Parked.** Comparative use and Langfuse telemetry remain follow-up work. |
| Documentation | README/public overview agrees with active workflow | **Aligned with desk scenarios.** |

## Ordered work

1. **Repository-map resolver and canonical discovery migration** — a tested resolver selects local/origin/common-Git-dir/override maps; canonical early-stage skills and templates record resolved paths. **Complete.**
2. **Workstream artifact layout and Scope → Plan slice** — establish the workstream ID/layout and retain the aligned optional-specialist/design-disposition/Plan interface. **Initial implementation complete.** This was documentation and skill-instruction work, not a pilot in another repository.
3. **Implement → Verify, Close, and retained-skill slices** — resolver-aware checkpoints, automatic Verify transition, three-lane code review with independent P0/P1 verification, exact-scope commit-list support, review-evidence Close gate, corrective-phase contract, proportionate closeout, and initial retained-skill sweep. **Complete** (delivered by proactive-code-review workstream; 9 commits; 93 contract tests).
4. **Public documentation and scenario testing** — README/contract/status coherence plus trivial, medium, and structural desk scenarios. **Complete.**
5. **Real end-to-end pilot** — the first bounded product workstream completed and produced the initial `observing-myflow` skill, collector, and report contract. **Complete.**
6. **Portable core** — slim the package to 20 agent-neutral skills, move workstream artifacts into a user-configured store with an optional private remote, record every stage edge through one boundary command, and ship one documented install step per agent. **Complete, pending per-agent install smoke tests.**
7. **Next action: install smoke tests and comparative pilots** — install the package in each agent the developer runs, confirm the user-only skills and the session variables, then use workstream observations to test whether the recorded improvement hypotheses recur. Keep Langfuse telemetry redesign deferred until JSONL evidence shows a concrete need.

## Operating rule

Do not treat this as a one-time specification exercise. Each aligned slice should be tried in real work, evaluated, and revised when evidence shows friction or ambiguity. The contract gives the workflow a stable interface; the skills remain deliberately iterative.
