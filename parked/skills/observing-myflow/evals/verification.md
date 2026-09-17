# Skill verification

## GREEN application

A revived baseline agent read `SKILL.md` and `report-contract.md`, then ran two checkpoints against the live `core-runtime-foundation` workstream with a temporary private state root.

The agent verified:

- no duplicate entry IDs across checkpoints;
- conservative turnaround and unknown-gap language;
- private state separated from suggested curated outputs;
- the Plan-to-Design return recorded without a new architecture review;
- developer friction preserved without a productivity grade.

It found loopholes in delegated observer identity, nested-session discovery, account permissions, bare-name attribution, first-run artifact wording, and direct developer-feedback intake.

## REFACTOR

The collector and skill were tightened to:

- exclude current, parent, retained, and repeated explicit observer session IDs;
- recursively discover nested Pi session JSONL while excluding observer artifacts;
- initialize the private account with mode `0600`;
- require a `.myflow/workstreams/<id>` evidence marker rather than a bare workstream-name mention;
- label artifact changes as `baseline` or `since-prior-checkpoint`;
- accept direct developer reports into the private account without treating the observer session as delivery evidence.

Executable tests cover incremental cursors, incomplete final records, redaction, observer lineage, nested sessions, attribution, private permissions, conservative timing, backward flow, Close output, and future telemetry migration.

## Repository-scoped storage correction

A later RED test showed that the collector still suggested Close outputs inside the target worktree and defaulted private state to `~/.myflow/observations`. The corrected test requires both private and curated paths under the resolver-derived personal repository tree. It also proves that collection creates no target-worktree observations directory.

The GREEN implementation now resolves `target` through `resolve-repository-map.mjs`, stores each workstream under `~/.myflow/repositories/<identity>/observations/`, and keeps explicit state-root overrides repository-specific.

## Evidence-qualified economics RED

Before the Phase 1 contract and scripts changed, `node --test tests/observing-myflow.test.mjs` failed at the public command and documentation seams:

- collector entries omitted provider, model, cache read and write, and reasoning usage;
- no `derive-team-flow.mjs` command existed for explicit boundary and stage attribution;
- the skill did not require `myflow-observation-analysis/v1` before producing team-safe output;
- the report contract still exposed inferred `developerFriction` in the v1 team export.

The fixture suite now checks provider/model grouping, missing cost, boundary filtering, repeated stages, overlap rejection, unassigned usage, absent sentiment, and nullable efficiency.

## Deliberate limits

- Pi JSONL cannot provide exact lifecycle spans.
- Branch realization and semantic episode attribution remain observer responsibilities.
- Project-based Langfuse telemetry is the intended richer event source once available.
- The skill does not automatically modify `close`; it can be invoked with `finalize` during Close. Automatic Close orchestration requires a separately tested edit to the Close skill.

## Phase 3: Local stage reviews and return assessment

Executable tests cover:

- `myflow-stage-review/v1` contract validation (required fields, allowed fields, predicate results, outcomes, return assessment).
- Stage-specific mechanical predicate sets for Scope, Plan, Implement, Verify, and Close.
- Developer acceptance requirement for Scope and Plan `satisfied` outcome.
- Predicate `unknown` preservation (not converted to failure).
- Blocked stage detection.
- Every return nature: necessary-learning, changed-intent, delivery-defect, external-change, process-induced, unclassified.
- Counterfactual validation rejecting late discovery when then-available information, lower cost, expected signal, false-positive risk, or quality guardrail is missing.
- Allowlisted public projection excluding comments, paths, evidence excerpts, prompts, commands, code, and identities.
- Historical review preservation (later return creates a new revision without rewriting prior results).
- CLI integration for `evaluate-stage.mjs` with lifecycle journal, artifact, and feedback inputs.
- Return assessment CLI arguments with counterfactual fields.
- Idempotent private record storage.
- Revision increment on subsequent evaluations of the same attempt.
