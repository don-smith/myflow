# Assessment artifact contract

The bundle lives under the supplied workstream:

```text
assessment/
  assessment.md
  architecture-model.json
  evidence/
    inventory.md
    flows.md
    evolution.md
  packet.html
```

`architecture-model.json` is authoritative for facts and references. `assessment.md` is authoritative for explanation, judgment, trade-offs, and triage. Evidence files carry exhaustive coverage and traces. `packet.html` presents the same model and triage state.

## Progressive writes

Create the bundle after scope approval. Update it after each runtime unit or cohesive file batch. Run `check-model.mjs` after every batch. Do not wait until the end to reconstruct coverage or evidence from memory.

Recommended progression:

1. `in-progress`: approved inventory and scenarios exist.
2. `in-progress`: recovered model, flows, current view, intended view, and gaps exist.
3. `in-progress`: developer factual corrections are persisted.
4. `in-progress`: strengths, non-risks, findings, trade-offs, and pending recommendations exist.
5. `in-progress`: recommendation outcomes and packet exist.
6. `ready`: all blockers are closed and both checkers pass.

Use `blocked` only when an external action prevents useful progress. Keep the blocker actionable.

## Markdown references

Use `[model:<id>]` wherever prose depends on a model fact. Do not create a second identifier system for findings, flows, or diagrams. Finding IDs may be separate when they identify judgments rather than facts, but every supporting claim still cites model IDs.

## HTML readiness

The packet is self-contained. It has no remote assets. `html-design` chooses the review-packet shell, patterns, diagram forms, accessibility behavior, theme behavior, and print handling.

If `html-design` is unavailable:

- keep status `in-progress`;
- omit `packet.html` rather than creating unchecked markup;
- add a blocker with `kind: html-unavailable` and a concrete resolution;
- continue factual model and Markdown work.

A ready bundle needs:

```text
node <skill-dir>/scripts/check-model.mjs <assessment-dir>/architecture-model.json
node <skill-dir>/scripts/check-assessment.mjs <assessment-dir> --html-skill-dir <html-design-dir>
```

The second command delegates packet validation to:

```text
node <html-design-dir>/scripts/check-artifact.mjs <assessment-dir>/packet.html --profile review-packet
```

## Source protection

The assessment may write only inside its workstream directory until triage. Never edit assessed product source. Hash or diff approved production paths before and after controlled or high-risk runs.

After triage, tracked architecture documentation remains a proposal unless repository policy and the developer authorize publication. Publish only validated facts, accepted direction, decisions, and status. Keep raw evidence, rejected findings, and detailed triage in the workstream.

## Handoff

The ready assessment informs a separate Scope invocation. It does not authorize implementation. Preserve accepted, rejected, and deferred recommendation outcomes so later workstreams do not reopen settled triage by accident.
