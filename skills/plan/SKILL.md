---
name: plan
description: Produce the accepted, executable implementation plan for a MyFlow workstream. Accepts an alignment artifact for lightweight work or a standalone design artifact for structural work.
argument-hint: "[alignment artifact path | design artifact path]"
shell-timeout: 10
---

# Plan

Plan turns settled Scope and design decisions into the authority for autonomous implementation. Every non-trivial workstream has a durable executable plan. It may be lightweight, but it must state the design disposition, phases, verification map, and rehydration information.

Plan is collaborative. Do not edit product source code.

## Input and preconditions

1. Read `.myflow/repository-map.md` when present, then read `workstream.md` and the supplied alignment or design artifact fully.
2. Follow the artifact's workstream ID and resolve the workstream root from the map (default `.myflow/workstreams`).
3. Read all linked specialist artifacts whose findings affect decisions, phase boundaries, or verification.
4. Stop and return to Scope when intent, acceptance criteria, non-goals, or risk classification changed. Stop and return to Design when a material architectural choice remains unresolved.

## Determine the planning path

### Lightweight path

Use the lightweight path when the alignment artifact selects `lightweight` and its design disposition is either:

- **locked into existing architecture** — an existing module/pattern is named and interfaces, dependencies, data model, operational behavior, and patterns remain unchanged; or
- **localized design** — the few relevant technical choices can be settled directly in the plan without a structural design artifact.

Read `../myflow/templates/lightweight-plan.md` relative to this skill. Write one concise phase unless evidence justifies more. Do not inflate it into a full design.

### Full path

Use the full path when Scope selected `full` or a standalone design artifact is supplied. Read `templates/full-plan.md` relative to this skill. The plan consumes the design's settled direction and slices; it may clarify execution order and verification, but does not reopen architectural choices.

If Plan discovers that a supposedly lightweight change needs a new seam, public interface, dependency, persistence/schema change, new pattern, or structural decision, promote it to Design and update the workstream manifest before continuing.

## Create the executable plan

1. Reconfirm the outcome-level acceptance criteria with the developer.
2. Record the design disposition. This is mandatory even for the lightweight path.
3. Define independently verifiable phases. Each phase must have:
   - an outcome, affected files/modules, and executable change description;
   - automated success criteria and required repository checks;
   - manual verification criteria, owner, or an explicit `not required` statement; and
   - a boundary that permits one atomic commit after automated criteria are green.
4. Build the verification map. Connect every applicable acceptance criterion to observable behavior or seam, test level, test location/name or command, and status. List intentional exclusions with a reason and follow-up.
5. Include repository-map delivery constraints: branch/integration policy, required checks, documentation, migration, and manual-verification policy where applicable.
6. Resolve all material questions before marking the plan `ready`.
7. Write the plan under:

   ```text
   <workstream-root>/<workstream-id>/plan/<timestamp>_<topic>.md
   ```

8. Update `workstream.md`: Plan is `ready`, Implement is the current stage, the plan is authoritative, and its next action is:

   ```text
   /skill:implement <plan-path>
   ```

9. Present the plan and ask for acceptance. Only an accepted, `ready` plan authorizes autonomous implementation.

## Review and correction

Planning review checks that the plan faithfully realizes Scope/design decisions, phases are independently executable, and the verification map covers acceptance criteria. Code-quality review of implemented code belongs to Verify through `code-review`.

- Implementation gap → return to Implement, then re-Verify.
- Incorrect or unexecutable plan → return to Plan.
- Architectural decision changed → return to Design.
- Outcome or acceptance criterion changed → return to Scope.

## Guardrails

- Do not require a standalone Design for a lightweight workstream.
- Do not accept a plan without a design disposition or verification map.
- Do not make product source edits or run implementation as part of Plan.
- Do not assume artifact paths, commands, manual verification, or integration policy; read the repository map.
- Do not leave manual verification implicit. Keep it visible for Verify even when it does not block a phase commit.
