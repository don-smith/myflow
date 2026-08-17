---
name: design
description: Resolve material architectural decisions for a MyFlow workstream and write a standalone design artifact only when Scope or Plan requires structural design. Use after Scope and selected research/specialists, before Plan.
argument-hint: "[alignment artifact path | research artifact path]"
shell-timeout: 10
---

# Design

Design is the collaborative architectural step within Plan. It is required when work changes a module's interface or seam, introduces a dependency or pattern, has multiple credible approaches, or otherwise needs a durable structural decision. It is not mandatory for a lightweight plan locked into existing architecture.

A design artifact records the chosen solution shape and its consequences. It does **not** implement product code or generate a second executable plan.

## Input and preconditions

1. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`, read its selected map when `found`, and record the resolved path. Then read the workstream's `workstream.md` and the supplied alignment/research artifact fully.
2. Confirm the artifact's workstream ID and resolve the workstream root from the map (default `.myflow/workstreams`).
3. If Scope selected `lightweight` work and no material architectural question remains, do not manufacture a design artifact. State the locked/localized design disposition for Plan and continue with `/skill:plan <alignment-path>`.
4. If the input lacks a workstream, acceptance criteria, or a question that needs architecture, return to Scope rather than guessing.

## Flow

1. Gather only the evidence needed to resolve the architecture question.
2. Identify the affected modules, interfaces, seams, dependencies, and relevant repository precedents. Use `codebase-design` vocabulary: module, interface, seam, adapter, depth, leverage, and locality.
3. Select `architecture-review`, `domain-modeling`, `prototype`, or targeted research only when the evidence shows it is needed.
4. Present genuine alternatives and trade-offs to the developer. Do not ask for confirmation of an obvious existing pattern; record the evidence instead.
5. Settle one direction, its change boundaries, operational consequences, verification intent, and independently verifiable implementation slices.
6. Read `templates/design.md` relative to this skill and write:

   ```text
   <workstream-root>/<workstream-id>/design/<timestamp>_<topic>.md
   ```

7. Update `workstream.md`: Plan is in progress, the design artifact is the current authoritative planning input, and the next action is Plan.
8. Present a fresh-session command:

   ```text
   /skill:plan <design-artifact-path>
   ```

## Required design outcome

A ready design artifact contains:

- the architectural question and evidence actually used;
- settled direction and rejected alternatives;
- module/interface/seam decisions and dependency consequences;
- explicit build/not-build boundaries;
- verification intent connected to Scope acceptance criteria;
- implementation slices appropriate for phase planning; and
- no material open question that prevents Plan.

If a decision changes the Scope outcome or acceptance criteria, return to Scope. If it only changes implementation sequencing, Plan owns the adjustment.

## Guardrails

- Do not create a standalone design merely because Design was invoked.
- Do not write product source code, copy-paste implementation blocks, or turn Design into Implement.
- Do not assume conventional documentation, ADR, glossary, or artifact paths; consume the resolver-selected repository map.
- Do not claim an architecture review from a shallow scan. Use the specialist when a broad audit is warranted.
- A blocked design remains blocked; do not send it to Plan with unresolved material choices.
