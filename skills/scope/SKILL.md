---
name: scope
description: Begin a MyFlow workstream with right-sized, code-light scoping. Establishes a workstream ID and durable alignment artifact when needed, selects only the specialists the work requires, and offers an isolated worktree or trunk-based path.
argument-hint: "[rough idea | transcript | ticket path | notes path]"
shell-timeout: 10
---

# Scope

Scope is Stage 1 of MyFlow. It turns a rough request into a shared understanding of the outcome, acceptance criteria, risks, and appropriate workflow depth. It is collaborative and code-light: it reads the repository map and named evidence, but does not perform architectural reconnaissance or implementation.

**Announce at start:** "I'm using the `scope` skill to establish the outcome, risk, and right-sized path for this workstream."

## Output

For non-trivial work, Scope creates or updates:

```text
<workstream-root>/<workstream-id>/
  workstream.md
  scope/<timestamp>_<topic>.md
```

The default workstream root is `.myflow/workstreams`; `.myflow/repository-map.md` may provide a repository-specific root and branch/worktree policy.

A truly trivial, uninterrupted change may remain in conversation. It is not resumable. If it expands or pauses, create a lightweight plan before continuing.

## Flow

1. Read repository context → 2. Frame the request → 3. Establish workstream and checkout path → 4. Align outcome and risk → 5. Select depth and specialists → 6. Write durable state → 7. Present the next action

## 1. Read repository context

1. Start at the Git root. Read `.myflow/repository-map.md` if it exists, then follow its mapped operating instructions and artifact policy. If it is absent or stale for needed work, recommend `onboard`; do not invent repository policy.
2. Read user-provided tickets, notes, or named files fully. Do not dispatch broad codebase agents by default.
3. Ask for a short description when no usable input is provided.

Scope may inspect a narrow source area only when it is necessary to classify material risk or choose a specialist. Deeper codebase, architecture, or external investigation belongs to the selected specialist.

## 2. Frame the request

Reflect the tentative understanding before detailed questions:

```markdown
Here is my current frame:
- Outcome / beneficiary:
- Work type:
- Likely size and risk:
- Known constraints:
- What we still need to settle:
```

Ask focused questions until the work has, at minimum:

- intent and beneficiary;
- desired outcome and explicit non-goals;
- concrete, outcome-level acceptance criteria;
- constraints and material risks; and
- enough information to choose a workflow depth and next action.

Acceptance criteria must be observable but normally do not name files, test names, commands, or a technical design. Plan later owns those details in its verification map.

## 3. Establish the workstream and checkout path

Before writing a durable alignment artifact, establish a filesystem-safe **workstream ID**. Derive a concise kebab-case ID from the agreed topic, a ticket identifier, or an existing branch when unambiguous. Ask the developer only when it cannot be safely inferred. The ID is stable for the workstream; it is not necessarily the branch name.

Inspect the current branch, Git root, and repository-map branch/worktree policy. Present the applicable path:

- **Isolated branch/worktree:** when repository policy permits and the developer chooses it, propose a branch such as `feature/<workstream-id>` and a worktree path. Create it before finalizing the durable artifact. Write `workstream.md` and the alignment artifact directly in that worktree; do not copy artifacts between checkouts.
- **Current checkout / trunk:** when the repository uses trunk-based development, policy disallows branches, or the developer declines isolation, create the same workstream directory in the current checkout and record that choice.

Do not force a branch or worktree. Do not create one without confirmation. If a workstream directory already exists, read its manifest and resume or explicitly supersede it instead of silently creating a duplicate.

Read `skills/myflow/templates/workstream.md` relative to this skill's sibling `myflow` skill before creating the manifest. The manifest is the directory index: keep its current stage, authoritative artifact, stage-progress table, branch/worktree, and next action current.

## 4. Align outcome and risk

Use the following risk triggers visibly:

- `ambiguous_intent` — goal, beneficiary, success condition, or non-goals remain unclear.
- `architecture_impact` — likely changes an interface or seam, public contract, persistence, major abstraction, or cross-module flow.
- `external_dependency` — touches integration, auth, deployment, paid service, data-loss risk, or third-party API.

Record meaningful decisions with provenance:

```markdown
- decision: {decision}
  source: user_provided | agent_inferred | deferred | evidence_confirmed
  rationale: {why}
  affects: scope | acceptance_criteria | risk | stage_selection | implementation
```

Unresolved material questions make the alignment artifact `blocked`; do not conceal them in prose.

## 5. Select depth and specialists

Choose the smallest safe path with the developer:

| Path | Use when | Scope output / next action |
|---|---|---|
| Trivial, in-session | One reversible, known change; known validation; no new/changed interface, dependency, persistence, security, integration, or operational behavior; no expected interruption | State the outcome, acceptance check, and locked-into-existing-architecture conclusion in conversation. Implement directly only while uninterrupted. |
| Lightweight | Low-risk but worthwhile work, likely to outlive this turn, or needing implementation authority | Write alignment artifact; next action is a lightweight Plan with a design disposition. |
| Full | Uncertainty, multiple approaches, architectural impact, new pattern/dependency, multi-phase work, or meaningful external/operational risk | Write alignment artifact; select only needed specialists before a standalone Design and Plan. |

Select specialists by evidence rather than forcing a chain:

- `discover` for unresolved requirements;
- `research` for a specific codebase or external question;
- `grill-with-docs` for a repository-scoped decision that may affect domain language or ADRs;
- `prototype` for uncertain behavior or UI;
- `domain-modeling` for unclear/changing terminology or boundaries;
- `architecture-review` for a structural baseline/audit;
- `improve-codebase-architecture` for a focused technical-debt/deepening workstream;
- `wayfinder` for work too large to plan in one ordinary effort; or
- `wizard` when required human-only setup is discovered.

For lightweight work, record the expected Plan design disposition as `locked into existing architecture` or `localized design`. Scope does not settle code shape; it identifies why a full Design is or is not needed.

## 6. Write durable state

For a non-trivial workstream:

1. Read `templates/alignment.md` relative to this skill.
2. Write or update `<workstream-root>/<workstream-id>/scope/<timestamp>_<topic>.md`.
3. Fill the common checkpoint and rehydration information using `skills/myflow/templates/stage-context-checkpoint.md`.
4. Update `workstream.md` so Scope is `ready` or `blocked`, it identifies the alignment artifact as authoritative, and it records the selected next action.

The alignment artifact must include: intent, desired outcome, non-goals, acceptance criteria, risk level/triggers, classification, selected depth, decisions/provenance, open questions, selected specialists, and suggested next action.

## 7. Present the handoff

Report:

- workstream ID and directory;
- branch/worktree or trunk/current-checkout choice;
- alignment artifact, if written;
- risk triggers and selected depth;
- the selected specialist or exact Plan command; and
- whether a fresh session in the target worktree is recommended.

At a normal stage boundary, a fresh session reads `.myflow/repository-map.md`, `workstream.md`, and the authoritative alignment artifact. Use `create-handoff` only for an interruption inside Scope.

## Guardrails

- Do not edit product source code during Scope.
- Do not require research, a standalone design, a branch, or a worktree merely by convention.
- Do not silently create a new workstream when a matching one exists.
- Do not allow a conversation-only trivial path to become a multi-session or multi-phase change; create a lightweight plan first.
- Do not make an architecture assessment from a map or shallow file scan. Select `architecture-review` or another appropriate specialist when real assessment is needed.
