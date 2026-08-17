---
name: myflow
description: Use when starting or navigating work that should follow the MyFlow five-stage, artifact-led development workflow
---

# MyFlow

MyFlow is a five-stage workflow for AI-assisted software development. Each stage has one canonical orchestrator, produces or updates a state artifact, and identifies the next action. The workflow adapts its depth to the size and risk of the work; it does not require every specialist skill for every task.

## Use this skill when

- starting a new piece of work
- resuming work when the current stage is unclear
- deciding which stage or specialist skill should run next
- onboarding a repository to the workflow
- checking the relationship between stages, artifacts, and cross-cutting skills

## Collaboration model

- **Scope and Plan:** collaborate with the developer; resolve intent, trade-offs, scope, and architecture together.
- **Implement:** after the plan is accepted and a fresh session begins, operate autonomously against the plan.
- **Verify:** run automated validation and code review autonomously, then return control for manual verification where required.
- **Close:** involve the developer throughout closeout, especially for documentation, learnings, commits, and integration decisions.

## The five stages

```text
1. Scope → 2. Plan → 3. Implement → 4. Verify → 5. Close
```

### 1. Scope

**Orchestrator:** `scope`

Determine the intent, size, ambiguity, risk, and appropriate depth of the work. Select specialists only when needed:

- `discover` for deeper requirements extraction
- `grill-with-docs` for a repository-scoped decision that needs collaborative questioning and may sharpen domain language or record an ADR
- `research` for codebase or external research
- `prototype` for difficult behavior or UI questions
- `wayfinder` for efforts too large to map in one planning session

**Artifact:** alignment artifact, with research artifacts when research is selected.

### 2. Plan

**Orchestrator:** `plan`, with `design` as the collaborative design step

Resolve the solution shape, architectural decisions, implementation slices, ordering, and verification criteria. Use `architecture-review`, `domain-modeling`, `prototype`, or the canonical `tdd` skill when the work requires them.

Every non-trivial workstream has an executable plan. Its **design disposition** says whether work is locked into existing architecture, needs localized design recorded in the plan, or requires a linked standalone design artifact. A truly trivial, uninterrupted change may keep this agreement in-session; if it expands or pauses, write a lightweight plan before continuing.

**Artifacts:** design artifact where needed, implementation plan, and rehydration manifest.

### 3. Implement

**Orchestrator:** `implement`

Execute the accepted plan autonomously. Follow its test-first slices and verification map; use the canonical `tdd` skill again only if a design gap appears. After every completed plan phase whose automated criteria and required checks are green, invoke `commit` to create one atomic phase commit. Update the implementation checkpoint with the commit hash and any outstanding manual verification. Use `epiphany-tabling` only when a new observation should be preserved without expanding the current work.

**Artifact:** implementation checkpoint or updated plan state, plus the working tree.

### 4. Verify

**Orchestrator:** `validate`

Verify the implementation against the plan and its success criteria. Run automated checks, inspect the implementation, and invoke `code-review`. When the work has human-facing or external behavior, prepare a manual-verification brief for the developer.

**Artifact:** validation report and any repository-specific review evidence.

### 5. Close

**Orchestrator:** `close`

Leave the workstream in a clean, understandable, low-debt state. With the developer, select only applicable documentation, status, learning, retrospective, changelog, and delivery actions from Verify evidence and repository policy. Record every unresolved follow-up with a destination rather than forcing it into the current closeout. If applicable closeout changes exist, make a separate final closeout commit and determine integration without inferring a policy.

**Artifacts:** repository-specific closeout updates and a resumable closeout summary when decisions, manual evidence, or follow-ups need to persist.

## Cross-cutting skills

These skills can be invoked at any suitable point:

- `create-handoff` and `resume-handoff` — exceptional mid-stage or mid-slice recovery
- `epiphany-tabling` — preserve useful ideas without derailing current scope
- `grilling` — the model-invocable decision-tree interview technique used by other skills
- `grill-me` — an explicit, stateless interview for a decision not tied to a repository workstream
- `domain-modeling` — establish or sharpen domain language
- `diagnosing-bugs` — resolve bugs, failures, flaky behavior, and performance regressions
- `resolving-merge-conflicts` — recover from an in-progress merge or rebase
- `wait-what` — recover when the current explanation or direction is unclear
- `writing-skills` — maintain and test MyFlow skills
- `langfuse` and telemetry tooling — inspect or improve workflow observability

TDD is already consolidated: `tdd` is the canonical skill. Use it primarily during Plan/design to shape seams and the verification map; implementation follows the accepted plan unless a design gap appears.

Debugging is already consolidated: `diagnosing-bugs` is the canonical skill. It requires an evidence-first feedback loop before a durable fix; `systematic-debugging` is retired.

`architecture-review` and `improve-codebase-architecture` are complementary specialists: the former is a broad structural audit for Plan/onboarding, and the latter is a focused deepening exploration that Scope can select for technical-debt work.

The grilling family is intentionally layered:

- `grilling` is the model-invocable decision-tree interview technique. Skills that need collaborative decision-making use it rather than inventing another interview.
- `grill-me` is its explicit, stateless front door. It is stage agnostic and appropriate when the decision is not tied to a repository workstream or its artifacts.
- `grill-with-docs` is its repository-scoped Scope specialist. It composes `grilling` with `domain-modeling` when a change can be settled collaboratively and domain language or an ADR may need maintenance.

`grill-with-docs` supplements rather than replaces the Scope artifact: record settled scope, trade-offs, requirements, and next action in the alignment artifact even when they are neither glossary terms nor ADRs. It must use the repository paths discovered during onboarding, not assume `CONTEXT.md` or `docs/adr/`.

## Onboarding

Before using MyFlow seriously in a repository, run `onboard`. It uses `skills/myflow/scripts/resolve-repository-map.mjs` to select an existing repository-local map or personal global map, then creates or refreshes the appropriate repository-policy index. Skills run the resolver before guessing conventional paths; only maps/onboarding records are global, while active workstream artifacts remain local.

`onboard` also writes a run report and pending evaluation record. It is discovery, not an architecture assessment: it inspects first, asks only material unresolved questions, and can leave a repository `provisional` when unknowns do not prevent safe low-risk work.

Optional onboarding specialists remain separate:

- `setup-pre-commit` for commit-time formatting and checks
- `setup-ts-deep-modules` for TypeScript package-boundary enforcement
- `architecture-review` for an architectural baseline
- `domain-modeling` for the repository glossary and important domain decisions
- `langfuse` or repository telemetry setup for workflow evaluation

## Artifact and session rules

[The artifact and stage-boundary contract](../../docs/artifact-and-stage-boundary-contract.md) defines canonical paths, resolver lookup, the common artifact interface, planning depths, and corrective loops. The resolver-selected repository map overrides its defaults.

Stage artifacts are the primary handoff mechanism. Each should make the current state and next action discoverable without conversation history. At minimum, record:

- workstream and stage
- status
- completed work
- decisions
- open questions
- evidence and verification state
- relevant files and artifact paths
- next action and next-session command
- rehydration information

Use a fresh session at a natural stage boundary. Use `create-handoff` only for an exceptional interruption inside a stage or slice; use `resume-handoff` to recover it. The handoff should point to the authoritative stage artifact rather than duplicate it.

## Continuous improvement

MyFlow has two feedback loops:

```text
developer observation → epiphany table / retro → learning promotion
workflow telemetry → evaluation → human feedback → workflow improvement
```

`writing-retros` is useful when a process reflection is warranted, but is not mandatory for every workstream. `capturing-learnings` decides whether repeated observations should become durable skills, runbooks, memory, or deliberate drops.

## Quick reference

| Need | Start with |
|---|---|
| Establish or refresh repository conventions | `onboard` |
| Start or classify work | `scope` |
| Resolve fuzzy requirements | `discover` or a grilling entry point |
| Research reality | `research` |
| Design and sequence | `design` → `plan` |
| Execute accepted work | `implement` |
| Validate implementation | `validate` → `code-review` |
| Close the workstream | `close` |
| Pause unexpectedly | `create-handoff` |
| Resume a pause | `resume-handoff` |
| Preserve a distracting idea | `epiphany-tabling` |
| Improve MyFlow itself | `writing-skills`, telemetry, or a retrospective |
