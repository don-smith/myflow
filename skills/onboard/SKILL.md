---
name: onboard
description: Use when introducing MyFlow to a repository, refreshing repository workflow knowledge, or when a MyFlow skill lacks a required repository path or convention.
argument-hint: "[initial | refresh | missing requirement]"
---

# Onboard

Create or refresh compact repository knowledge through the shipped resolver, never an assumed local path:

```text
node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>
node skills/myflow/scripts/resolve-repository-map.mjs target --cwd <git-root>
```

`discover` selects an explicit override, an existing repository-local map, or an existing personal global map. `target` names the preferred writable **personal global** map for an origin-backed repository or a no-origin common-Git-directory identity. The resolver emits metadata only; read map contents only after it selects a path.

## Outcomes

An onboarding run writes or updates the resolved repository map and, for a personal global map, evidence-led records beside it:

```text
<map-parent>/onboarding/runs/<timestamp>_<initial|refresh>.md
<map-parent>/onboarding/evaluations/<timestamp>_<initial|refresh>.md
```

A repository-local map remains authoritative and compatible. Follow its tracking/retention policy for its run and evaluation records. Workstream artifacts go wherever the developer's artifact storage settings put them (step 4); never move them without `myflow artifacts import`.

## Flow

1. Resolve/preserve the map → 2. Inspect before asking → 3. Confirm material unknowns → 4. Settle artifact storage → 5. Write map/report → 6. Prepare evaluation → 7. State readiness

### 1. Resolve and preserve existing knowledge

Start at the Git root and run `discover`. Record its selected path in all frontmatter. If `found`, read that map and every named applicable instruction file. Preserve confirmed entries; correct only evidence-disproved entries.

If no map exists, run `target`. Use its `mapPath` as the preferred writable location; create its parent only after discovery and developer decisions are complete. Do not create a tracked local map merely because `.myflow/` is available. The exception is a repository-only install: when `discover` reports `storeMode: "checkout"` with `storeFallback: false` and MyFlow's scripts live inside this repository, offer to write the map at `.myflow/repository-map.md` so it travels with the repository. The explicit `--map <path>` option is only for approved exceptional locations. A non-Git or malformed-origin diagnostic is actionable: ask for a valid repository or an explicit override; do not invent a fallback.

### 2. Inspect before asking

Inspect applicable instruction files, manifests/task runners, CI, documentation, status/changelog/runbook locations, ADR/glossary candidates, local skills/templates, and Git delivery conventions. Record each source and what it establishes. This is discovery, not an architecture review; recommend `architecture-review` only when evidence warrants it.

### 3. Ask only material unresolved questions

Ask only where an answer changes operation: required checks/manual verification; documentation and delivery policy; glossary/ADR sources; artifact retention; local capabilities; approvals and sensitive-data constraints. **Unknown** is valid. Do not invent commands, policies, or paths.

### 4. Settle artifact storage

Run `node skills/myflow/scripts/cli.mjs artifacts status --cwd <git-root>`. When it reports `configured: false`, ask the developer, one question at a time:

1. Should workstream artifacts be kept outside this repository, in their MyFlow home? (`home`, recommended when MyFlow is installed globally) Or next to the code in the checkout, ignored by Git? (`checkout`)
2. For `home` only: should they be backed up to a Git repository the developer owns? If so, which URL? For example `git@github.com:<you>/myflow-artifacts.git`. The repository should be private.

Then run `node skills/myflow/scripts/cli.mjs artifacts init --location <home|checkout> [--remote <url> | --no-remote]` and report its `warnings`. These settings are personal configuration in `<MYFLOW_HOME>/config/myflow.json`; never write them into the repository map or name a particular artifact repository in repository files. If `status` lists `needsImport`, offer `artifacts import`. If the developer declines to decide, leave the configuration absent; MyFlow then follows the install location.

### 5. Write the map and report

Read `templates/repository-map.md` and `templates/onboarding-report.md`. Fill them from evidence. The map points to authoritative sources rather than copying policy; those sources win on conflict. Use a punctuation-safe ISO timestamp and record the **resolved repository-map path** in the map, report, and evaluation frontmatter.

Include **MyFlow capability gaps** in the report for needs no current skill handles. Do not expand this run to solve them.

### 6. Prepare evaluation and telemetry handoff

Read `templates/onboarding-evaluation.md`; write its pending record beside the report and link all three records. Telemetry is optional. Never send source, credentials, tokens, personal data, sensitive repository identifiers, or the original remote URL without explicit approval.

### 7. Present readiness

Report the resolved map, report, and evaluation paths; the artifact store mode, workstream root, and whether a remote is configured; confirmed sources/material unknowns; `ready`, `provisional`, or `blocked` status; next safe action; and any specialist recommendation. A missing map alone does not block ordinary low-risk Scope work once onboarding has written its target.

## Consumer contract

A skill needing repository-specific information must run `resolve-repository-map.mjs discover`, read its selected map when `found`, follow mapped sources, and record a missing/stale gap for `onboard`. Do not hard-code `.myflow/repository-map.md` as the only supported source.

## Guardrails

- Do not replace repository policy with MyFlow defaults or bulk-migrate legacy local maps/flat artifacts.
- Do not read map contents in the resolver or emit remote credentials/URLs.
- Do not require a rigid schema, a glossary, ADR directory, changelog, architecture assessment, or telemetry setup.
- Do not report success solely because files exist: a fresh session must be able to resolve and use the map.
