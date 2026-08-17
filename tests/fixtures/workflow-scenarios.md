# Desk workflow scenarios

## Trivial

Resolved map: resolver-selected map when policy is needed. The developer keeps a one-turn, reversible change in-session; no workstream artifact is required. If interrupted or expanded, Scope creates a lightweight workstream. Correction: return to Scope if the outcome changes. Manual evidence: not required unless the repository map says otherwise.

## Medium

Resolved map: `discover` selects local/origin/global policy. Scope writes `workstreams/<id>/scope/`; Plan writes a lightweight executable plan; Implement records phase evidence; Verify writes `workstreams/<id>/verify/`; Close records only applicable summary/delivery decisions. Correction: an implementation defect returns to Implement. Manual evidence: Verify supplies a brief only for non-automatable behavior.

## Structural

Resolved map: `discover` selects repository policy before Scope. Scope → specialist evidence → Design → full Plan → committed Implement phases → Verify report/review → proportionate Close summary. Correction: changed architecture returns to Design; changed acceptance criteria returns to Scope. Manual evidence: the plan names human/external checks and Verify retains their outcome.
