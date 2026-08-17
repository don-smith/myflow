---
name: onboard
description: Use when introducing MyFlow to a repository, refreshing its repository-specific workflow knowledge, or when a MyFlow skill lacks a required repository path or convention.
argument-hint: "[initial | refresh | missing requirement]"
---

# Onboard

Create or refresh the repository's MyFlow knowledge at one predictable location:

```text
.myflow/repository-map.md
```

The map is a small, tracked index of **authoritative sources**, operational conventions, and explicit unknowns. It is not a copied handbook, architecture review, or generic configuration schema. Other MyFlow skills read it before guessing a repository path or policy.

## Outcomes

An onboarding run writes or updates:

- the durable repository map;
- an evidence-led run report under `.myflow/onboarding/runs/`; and
- a pending evaluation record under `.myflow/onboarding/evaluations/`.

The map records current repository facts. The report records this discovery run. The evaluation record captures later human feedback and downstream evidence; never put either history in the map.

## Flow

1. Locate existing map → 2. Inspect before asking → 3. Confirm material unknowns → 4. Write map and report → 5. Prepare evaluation → 6. State readiness and next action

### 1. Locate and preserve existing knowledge

Start at the Git root. Read `.myflow/repository-map.md` if it exists, then read every agent-instruction file it names that applies to the current path. Preserve confirmed entries; correct only entries disproved by evidence or the developer.

If `.myflow/` is ignored, propose replacing that broad rule (not appending beneath it) with the narrow exception needed to track the map while retaining ignored worktree artifacts:

```gitignore
.myflow/*
!.myflow/
!.myflow/repository-map.md
```

Ask before changing ignore policy. If the repository cannot track MyFlow metadata, record the approved alternate location in the run report and tell the developer that automatic discovery by other skills will require an explicit path until a team convention exists.

### 2. Inspect before asking

Inspect repository evidence before asking questions. Start with applicable instruction files, root manifests and task runners, CI configuration, documentation roots, existing status/changelog/backlog/runbook locations, ADR and glossary candidates, repository-local skills/agents/templates, and Git branch/integration conventions. Record each relevant source and what it establishes.

Do not claim an architecture review, complete domain model, or complete understanding of the codebase from this pass. Those are optional specialist activities. If a later architecture review is needed, it consumes this map and writes its own assessment artifact.

### 3. Ask only material unresolved questions

Present the evidence-backed draft and ask focused questions only where an answer changes how MyFlow operates. Resolve, defer, or mark as unknown:

- required automated checks and manual verification;
- documentation, runbook, status, changelog, backlog, branch, commit, and integration policy;
- the authoritative glossary/context-map and ADR sources, including multiple contexts when applicable;
- artifact location and tracking policy; and
- local skills, agents, workflows, templates, tooling, and secrets/approval constraints MyFlow must respect.

**Unknown is a valid value.** Do not invent a command, policy, glossary, or path merely to complete a section. A small or new repository may be `provisional` yet ready for low-risk Scope work. Explain which unknowns must be resolved before higher-risk work.

### 4. Write the map and run report

Read `templates/repository-map.md` and `templates/onboarding-report.md` relative to this skill before writing. Fill them from confirmed evidence and developer decisions.

The map must point to authoritative sources and summarize only their operational implication. If an instruction file, CI definition, or team policy conflicts with the map, the source governs; update the map.

Use an ISO timestamp with punctuation safe for filenames. Write the report to:

```text
.myflow/onboarding/runs/<timestamp>_<initial|refresh>.md
```

Include a **MyFlow capability gaps** section for facts, policies, or repository conditions that no current skill handles well. This is improvement input, not an invitation to expand the current onboarding run.

### 5. Prepare evaluation and telemetry handoff

Read `templates/onboarding-evaluation.md`. Write a pending evaluation record to:

```text
.myflow/onboarding/evaluations/<timestamp>_<initial|refresh>.md
```

Link the map, report, and evaluation record to one another. Add a Langfuse trace or session reference only when telemetry is configured and permitted by repository policy. Do not send source code, credentials, tokens, personal data, or sensitive repository identifiers to telemetry without explicit approval. Telemetry is optional; the local evaluation record is required.

### 6. Present readiness

Report:

- map, report, and evaluation paths;
- confirmed sources and material unknowns;
- readiness: `ready`, `provisional`, or `blocked`;
- the next safe action; and
- whether a specialist is recommended, such as `architecture-review` or `domain-modeling`.

Do not make an architecture assessment or rich telemetry setup a prerequisite for ordinary work. `blocked` is only for a missing prerequisite that prevents safe operation, such as no applicable instructions or validation policy when the intended work requires them.

## Consumer contract

A MyFlow skill that needs repository-specific information must:

1. read `.myflow/repository-map.md` first when present;
2. follow the mapped authoritative source rather than a conventional filename;
3. perform targeted discovery only for a missing or stale entry; and
4. record the gap for `onboard` to refresh rather than silently creating a competing convention.

## Guardrails

- Do not replace repository policy with MyFlow defaults.
- Do not copy long policies into the map.
- Do not require a rigid schema or every optional section.
- Do not create a domain glossary, ADR directory, changelog, or architecture artifact merely because a template has a place for it.
- Do not treat a map as fresh forever; refresh it after material repository-process changes or when downstream work exposes a gap.
- Do not report success solely because files were found. The map must be usable by a fresh session.
