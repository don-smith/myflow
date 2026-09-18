---
name: design
description: Resolve material architectural decisions for a MyFlow workstream and write a standalone design artifact only when Scope or Plan requires structural design. Use after Scope and selected research/specialists, before Plan.
argument-hint: "[alignment artifact path | research artifact path]"
---

# Design

Design is the collaborative architectural step within Plan. It is required when work changes a module's interface or seam, introduces a dependency or pattern, has multiple credible approaches, or otherwise needs a durable structural decision. It is not mandatory for a lightweight plan locked into existing architecture.

A design artifact records the chosen solution shape and its consequences. It does **not** implement product code or generate a second executable plan.

## Input and preconditions

1. Run `node ../myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` from this skill folder, read its selected map when `found`, and record the resolved path. Then read the workstream's `workstream.md` and the supplied alignment/research artifact fully.
2. Confirm the artifact's workstream ID and resolve the workstream root: the map when it names one, otherwise the `workstreams` directory the artifact-store resolver reports as `workstreamRoot`.
3. If Scope selected `lightweight` work and no material architectural question remains, do not manufacture a design artifact. State the locked/localized design disposition for Plan and hand on to the `plan` skill with `<alignment-path>`.
4. If the input lacks a workstream, acceptance criteria, or a question that needs architecture, return to Scope rather than guessing.

## Flow

1. Gather only the evidence needed to resolve the architecture question.
2. Identify the affected modules, interfaces, seams, dependencies, and relevant repository precedents. Use `codebase-design` as the vocabulary for this step: module, interface, seam, adapter, depth, leverage, and locality.
3. Name the patterns and ADRs in the repository map that this change uses, extends, or conflicts with. A conflict is a design question, not a detail: settle it here or return it to its owning stage.
4. Select `domain-modeling`, `prototype`, or targeted research only when the evidence shows it is needed.
5. Present genuine alternatives and trade-offs to the developer. Do not ask for confirmation of an obvious existing pattern; record the evidence instead.
6. Settle one direction, its change boundaries, operational consequences, verification intent, and independently verifiable implementation slices.
7. Offer an ADR for a decision that qualifies, following the rules below.
8. Read `templates/design.md` relative to this skill and write:

   ```text
   <workstream-root>/<workstream-id>/design/<timestamp>_<topic>.md
   ```

9. Update `workstream.md`: Plan is in progress, the design artifact is the current authoritative planning input, and the next action is Plan.
10. Present a fresh-session command:

   ```text
   The `plan` skill with <design-artifact-path>
   ```

## Stage boundary

Record this stage with `node ../myflow/scripts/stage-boundary.mjs`, run from this skill's folder. Pass `--repository-root <git-root>` on every subcommand — the same `<git-root>` resolved in step 1 — because the command otherwise records against its own working directory, which on an install is the skill folder rather than the target repository. It derives every idempotency key and syncs the workstream; never write lifecycle JSONL directly.

- On entry: `enter --stage Plan --activity design --workstream <workstream-id> --repository-root <git-root>`. A resumed design activity in the same Plan attempt does not create another stage attempt.
- When the developer accepts the design: `accept --artifact <path>`.
- Design does not exit the Plan stage. Planning owns `exit` and the stage question; entering the planning activity completes the design activity.
- When Design owns a correction: `return`, with `--event owner-ready` when the architecture is ready. If Design proves the outcome changed, reroute to Scope rather than changing ownership silently.

Read `../myflow/references/stage-boundary.md` for the question wording and choices, the correction options, and what happens when a step fails. Keep earlier attempts and accepted artifacts as history.

## Record the decision when it qualifies

Design owns architectural decision records. Offer one only when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful.
2. **Surprising without context** — a future reader will wonder "why did they do it this way?".
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons.

If any of the three is missing, skip the ADR. The design artifact already records the decision; an ADR is for the decision a reader will meet in the code long after this workstream closes.

Write it to the ADR location the repository map names. When the map names none, ask before creating one, and record the missing mapping for `onboard` to refresh. `ADR-FORMAT.md` in this skill folder holds the format, the numbering rule, and what qualifies; use it when the developer confirms it as the repository's format.

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
