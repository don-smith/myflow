# Desk workflow scenarios

Each row names the producing stage's output and the action that consumes it, so a fresh session can continue without conversation history.

## Trivial

Resolved map: not needed for a one-turn reversible change unless repository policy is needed; then `discover` selects the map.

Workstream artifact: none — the in-session agreement is intentionally non-resumable.

Stage handoffs:

| Stage | Output / handoff | Next action |
|---|---|---|
| In-session | Conversation agreement: known reversible change and validation | Apply the change and run its known validation. |
| Expansion or interruption | Start a lightweight workstream | Scope records the outcome, acceptance criteria, and next stage. |

Correction: return to Scope if the outcome changes; create a lightweight workstream if the work expands or pauses.

Manual evidence: not required unless the repository map or changed behavior requires it.

## Medium

Resolved map: `discover` selects existing local/origin/global policy before Onboard or Scope reads repository instructions.

Workstream artifact: `.myflow/workstreams/<id>/`, containing the stage artifacts below.

Stage handoffs:

| Stage | Output / handoff | Next action |
|---|---|---|
| Onboard | Resolver-selected map and, when needed, onboarding report/evaluation | Scope creates the workstream alignment. |
| Scope | `scope/` alignment with outcome, acceptance criteria, and lightweight depth | Plan writes the executable lightweight plan. |
| Plan | `plan/` lightweight executable plan and verification map | Implement completes its phase and checkpoint. |
| Implement | Green phase commit and implementation checkpoint | Verify consumes the plan, commits, and checkpoint. |
| Verify | `verify/` validation report, review evidence, and conditional manual brief | Close consumes a passing report after required manual evidence. |
| Close | Applicable closeout summary and recorded delivery decision | End the workstream or route a follow-up to new Scope. |

Correction: an implementation defect returns to Implement; an incorrect plan returns to Plan; changed outcome returns to Scope.

Manual evidence: Verify supplies a brief only for non-automatable behavior; otherwise it records `not required`.

## Structural

Resolved map: `discover` selects repository policy before Onboard; all fresh stages re-resolve it before reading mapped sources.

Workstream artifact: `.myflow/workstreams/<id>/`, with linked Scope, specialist, Design, Plan, Implement, Verify, and Close evidence.

Stage handoffs:

| Stage | Output / handoff | Next action |
|---|---|---|
| Onboard | Resolver-selected map and repository discovery record | Scope establishes the structural workstream. |
| Scope | `scope/` alignment, full-depth decision, and selected specialists | Specialists/Design settle material architectural decisions. |
| Plan | `plan/` full executable plan, design disposition, phases, and verification map | Implement executes and commits each green phase. |
| Implement | Phase commits and updated plan/checkpoint with remaining manual checks | Verify checks plan execution and review evidence. |
| Verify | `verify/` report, code-review evidence, and required manual brief | Close begins only after a passing report and required manual evidence. |
| Close | Proportionate `close/` summary, delivery decision, and routed follow-ups | End the workstream or begin new Scope for each follow-up. |

Correction: an implementation defect returns to Implement; an incorrect plan returns to Plan; changed architecture returns to Design; changed acceptance criteria return to Scope.

Manual evidence: the plan names human/external checks; Verify retains their outcome before Close.
