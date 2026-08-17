---
myflow_repository_map: 1
status: provisional # provisional | ready
last_reviewed: {iso_timestamp}
last_reviewed_by: {author_or_agent}
---

# MyFlow repository map

This is a compact index of repository-specific workflow knowledge. Linked sources govern when they conflict with this summary.

## Operating instructions

| Source | Applies to | Operational implication |
|---|---|---|
| `{path or none found}` | `{scope}` | `{what MyFlow must do or avoid}` |

## Repository at a glance

- Purpose / primary product: {brief, evidence-backed summary}
- Primary languages and tooling: {languages, package/build systems}
- Important layout or module entry points: {paths or `unknown`}

## Domain language and architecture decisions

- Glossary / ubiquitous-language source: `{path | none found | unknown}`
- Context map / multiple-context guidance: `{path or none found}`
- ADR source and convention: `{path and naming rule | none found | unknown}`
- Operational implication: {which source a skill must read before changing domain language or a durable decision}

## Validation

| Check | Command or authoritative source | Required when | Notes |
|---|---|---|---|
| Tests | `{command | unknown}` | `{condition}` | `{scope or caveat}` |
| Lint | `{command | not applicable | unknown}` | `{condition}` | `{scope or caveat}` |
| Typecheck / build | `{command | not applicable | unknown}` | `{condition}` | `{scope or caveat}` |
| Manual verification | `{procedure/source | unknown}` | `{condition}` | `{who performs it}` |

## Documentation and delivery workflow

| Concern | Authoritative location or policy | Operational implication |
|---|---|---|
| Documentation | `{path | unknown}` | `{when an update/review is required}` |
| Runbooks | `{path | none found | unknown}` | `{when to consult or update}` |
| Status / backlog | `{path | none found | unknown}` | `{when to update}` |
| Changelog / release notes | `{path | none found | unknown}` | `{when required}` |
| Branch, commit, PR, and integration | `{source or confirmed convention | unknown}` | `{what MyFlow must do}` |

## MyFlow artifacts

- Repository map: `.myflow/repository-map.md` (tracked: `{yes | no | pending decision}`)
- Workstream artifact root: `{path | default .myflow/workstreams}`
- Workstream ID convention: `{branch-derived slug | ticket ID | other | unknown}`
- Branch/worktree policy: `{policy, including whether Scope may offer an isolated worktree | unknown}`
- Artifact tracking / retention policy: `{policy | unknown}`
- Manual-verification evidence location: `{path | default workstream verify/}`

## Local capabilities and constraints

| Kind | Name or path | When MyFlow must use or respect it |
|---|---|---|
| Skill / agent / workflow / template / tool | `{name or path}` | `{trigger or purpose}` |

- Required approvals, environment setup, or secret-handling constraints: {confirmed rule or `unknown`}

## Unknowns and decisions needed

- {missing fact, decision owner if known, and the work it could block}

## Sources reviewed

- `{path}` — {what it established}
