---
name: architecture-assessment
description: Use when a developer needs an evidence-led, whole-system architecture explanation and assessment before redesign, alignment, or refactoring.
argument-hint: "<alignment-or-research-artifact> [target]"
---

# Architecture assessment

Recover and assess a software system without changing product source. One typed fact index feeds every explanation and diagram. Validate that factual model before making architecture judgments.

Invocation:

```text
architecture-assessment <alignment-or-research-artifact> [target]
```

The input artifact supplies the workstream, drivers, acceptance criteria, repository map, and artifact root. `target` defaults to the Git root only when the artifact clearly requests a whole-system assessment.

## Required composition

**REQUIRED BACKGROUND: `architecture-review`.** Read it when available for inspection and triage discipline. Do not invoke `architecture-review` or nest its per-layer workflow. Reuse these invariants directly:

- enumerate the full approved scope;
- read every included production file;
- cite file-and-line evidence;
- persist work progressively;
- present findings for explicit developer triage;
- never edit assessed product source.

**REQUIRED BACKGROUND: `codebase-design`.** Read it when interfaces or seams are in scope. Use its terms exactly. A module hides implementation behind an interface at a seam. An adapter satisfies that interface where behavior varies. Judge depth by caller leverage and maintainer locality, not file size or interface line counts.

**CONDITIONAL BACKGROUND: `domain-modeling`.** Load it only when code and tracked language leave a same-name, synonym, homonym, or context translation unresolved. Do not create or update a glossary during factual recovery without the developer checkpoint that skill requires.

**REQUIRED SUB-SKILL: `html-design`.** Use it for `packet.html`. Read its profile, pattern, diagram, foundation, example, and quality guidance selected by the packet's content. Run `html-design/scripts/check-artifact.mjs <packet> --profile review-packet`. Without this skill and a passing check, the assessment cannot become `ready`.

The controlled evaluation exception is narrow. A fixed fixture prompt may provide approved drivers, scenarios, target, and `assessment/` output without a MyFlow workstream. Never use that exception for a product repository.

## Rehydrate and validate the input

1. Derive the MyFlow package root from this loaded skill's absolute path. Run:

   ```text
   node <myflow-package-root>/skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>
   ```

2. Read the selected repository map when found, then the supplied artifact, its `workstream.md`, and linked intent, design, research, glossary, decision, and architecture sources.
3. Read `git status --short`. Record the selected repository map and current Git state.
4. Confirm the workstream exists and the input names drivers, audience, scope, exclusions, and expected-change or quality scenarios. If there is no workstream, missing workstream context, unclear scope, or absent drivers, return to Scope. Do not invent an unindexed assessment.
5. Resolve the workstream directory and create this bundle from the templates:

   ```text
   assessment/assessment.md
   assessment/architecture-model.json
   assessment/evidence/inventory.md
   assessment/evidence/flows.md
   assessment/evidence/evolution.md
   assessment/packet.html
   ```

Read [the artifact contract](references/artifact-contract.md) before the first write.

## Checkpoint 1: approve scope and scenarios

Inventory manifests, tracked intent, decisions, deployment files, source, tests, generated files, and relevant history. Propose:

- included and excluded paths with reasons;
- stakeholders and intended audience;
- architecture drivers;
- 3 to 7 concrete runtime, failure, recovery, deployment, or change scenarios.

Get developer approval before exhaustive recovery. A controlled prompt may explicitly preapprove this checkpoint.

Write every approved file to `architecture-model.json.scope.expectedFiles` and `inventory`. Classify excluded, generated, test, and documentation files instead of silently omitting them. Every included production file must end with `coverage: read`.

## Recover facts before judgment

Read [the fact model](references/fact-model.md), then work by runtime unit and responsibility.

1. Read every included production file in full. Use manifests and reference searches to verify consumers and dependency direction.
2. Record system context, people, external systems, runtime and deployment units, packages, crates, important modules, stores, and durable artifacts.
3. Type every significant relationship. Keep source dependency, call, command, event, data read, data write, data ownership, lifecycle, build, deploy, trust, and documented intent distinct.
4. Record each important interface with owner, consumers, inputs, outputs, invariants, errors, ordering, idempotency, consistency, timing, versioning, trust, adapters, and test seam.
5. Trace important startup, request, command, event, mutation, persistence, failure, recovery, and replication flows.
6. Record data authority, ownership, persistence, replication, and retention.
7. Record canonical terms, aliases, homonyms, code spellings, and context translations. Do not treat different bounded-context terms as defects without evidence of missing translation.
8. Record current and intended facts separately. A divergence needs both current code evidence and tracked intent or developer evidence.
9. Run each approved scenario and record its current response. For change scenarios, name additions, modifications, deletions, registration points, layers, languages, contracts, tests, documents, and owners.
10. Use relevant Git history only after filtering initial imports, generated changes, formatting, migrations, and reorganizations. Co-change is association, not causality. Record confidence and history limits.

Write the inventory and model progressively after each runtime unit or cohesive file batch. Confirmed current facts require code or configuration evidence. Confirmed intended facts require tracked intent, a decision, or developer evidence. Label inferences and unresolved gaps. Never hide uncertainty in prose.

Run after each batch:

```text
node "$SKILL_DIR/scripts/check-model.mjs" <assessment-dir>/architecture-model.json
```

## Build focused factual views

Use the model to write concise, question-specific views:

- system context and external trust;
- runtime and deployment units;
- important module and source dependency direction;
- interfaces, seams, and adapters;
- selected runtime and data flows;
- data authority and ownership;
- current architecture;
- intended architecture and exact divergences;
- expected-change surfaces.

Every report claim and diagram uses `[model:<id>]` references. A diagram records its question, scope, abstraction level, relationship type, and model IDs before markup exists. Do not mix static dependency and runtime traffic on an unlabeled arrow.

## Checkpoint 2: correct recovered facts

Present the inventory, factual narrative, model, focused views, terms, flows, and unresolved gaps. Ask the developer to correct facts and approve the model for assessment. Persist corrections, then rerun `check-model.mjs`.

Do not assess before factual correction. A controlled prompt may preapprove continuation only after the recovered model and checkpoint record have been persisted.

## Apply assessment lenses

Read [the assessment lenses](references/assessment-lenses.md). Select lenses supported by drivers and evidence. For each lens, record strengths and non-risks before candidate findings.

Assess:

- current alignment with tracked intent;
- dependency direction, real cycles, facade bypass, and typed edge semantics;
- module responsibility, depth, leverage, and locality;
- interface and cross-language type-contract completeness;
- data authority, consistency, and trust;
- sibling consistency and explainable variants;
- domain language and seam translations;
- expected-change surface and extension mechanisms;
- temporal coupling and owner coordination when history supports it;
- relevant runtime and operational qualities;
- existing enforcement and candidate architecture checks.

Do not call every two-way runtime interaction a source cycle. Events retain schema, semantic, ordering, delivery, and observability coupling. Central registries can improve discoverability and validation. Deletions and coordinated edits can be correct. Explain the observed cost and trade-off against the approved scenarios.

Each candidate finding includes:

- stable ID and title;
- code, configuration, intent, decision, or history evidence;
- affected driver and scenario;
- current impact and likely change cost;
- strengths or load-bearing decisions that a change must preserve;
- options and trade-offs;
- certainty and unresolved gaps;
- candidate architecture checks;
- documentation consequences.

Do not compute a universal architecture score.

## Synthesize and publish

Update `assessment.md` with separate current and intended views, load-bearing decisions, strengths, non-risks, candidate findings, trade-offs, and gaps. Keep exhaustive coverage and traces in `evidence/`.

Use `html-design` to build a self-contained review packet from the same model IDs. Choose diagrams by relationship type. Do not copy prose into decorative diagrams or invent a second design system.

If `html-design` is unavailable, keep the model and Markdown `in-progress`, omit `packet.html`, and add an actionable `html-unavailable` blocker. The bundle must not become `ready`.

Run:

```text
node "$SKILL_DIR/scripts/check-assessment.mjs" <assessment-dir> --html-skill-dir <resolved-html-design-dir>
```

## Checkpoint 3: triage recommendations

After factual validation and complete judgment, present each recommendation for the developer to accept, reject, or defer. Persist the outcome, reason, dependencies, and candidate checks immediately. Never auto-accept a recommendation.

Assessment remains source-read-only. Never edit product source. Write only inside the resolved workstream assessment directory until triage. If the repository map names tracked architecture documentation, prepare a separate documentation proposal containing only validated facts, accepted direction, decisions, and status.

Rerun both checkers after triage and packet updates. Mark the bundle `ready` only when no blockers remain, every reference resolves, and the HTML check passes.

## Handoff

Read [the artifact contract](references/artifact-contract.md) for status and publication rules. The ready assessment is evidence for a separate alignment workstream. Return accepted recommendations to Scope rather than implementing them here.

Read [the evaluation guide](references/evaluation.md) only when maintaining this skill, its fixtures, runner, or model matrix.
