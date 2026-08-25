# Architecture fact model

`architecture-model.json` is authoritative for facts and cross-view references. It is an architecture index, not a symbol graph. Index only elements and relationships needed to explain drivers, flows, ownership, interfaces, and expected change.

## Stable IDs

Use lowercase prefixed IDs:

| Collection | Prefix | Purpose |
|---|---|---|
| sources | `src-` | Code, configuration, intent, decisions, tests, history, external, or developer evidence |
| inventory | `inv-` | Approved file coverage and exclusions |
| elements | `el-` | People, systems, runtime units, deploy nodes, packages, crates, modules, stores, artifacts |
| relationships | `rel-` | Typed static, runtime, data, lifecycle, deployment, trust, or intent edges |
| interfaces | `if-` | Caller knowledge at a seam |
| flows | `flow-` | Ordered runtime and data sequences |
| data | `data-` | Authority, persistence, replication, and retention |
| terms | `term-` | Canonical language, aliases, homonyms, and translations |
| scenarios | `scn-` | Runtime and change probes |
| divergences | `div-` | Current and intended differences |
| claims | `claim-` | Reused concise facts |
| diagrams | `diag-` | Question-specific visual views |

Do not renumber IDs merely because report order changes.

## State and certainty

Every fact has one state and one certainty.

- `current`: observed implementation or configuration.
- `intended`: tracked direction not claimed as current behavior.
- `both`: one statement confirmed by separate current and intent evidence.
- `confirmed`: directly supported by evidence appropriate to its state.
- `inferred`: reasoned from named evidence but not directly established.
- `unresolved`: cannot be settled from approved evidence. Add a concrete `gap`.

A confirmed current or both fact needs code or configuration evidence. A confirmed intended or both fact needs tracked intent, a decision, or developer evidence. Tests support behavior but do not replace implementation evidence for current architecture. History shows association and sequence, not causality.

## Typed relationships

Never collapse all arrows into dependency:

- `source-dependency`: import, use, package, or crate direction.
- `call`: synchronous or awaited runtime invocation.
- `command`: request to perform work with explicit command semantics.
- `event`: publication and subscription through a shared event contract.
- `data-read`, `data-write`, `data-ownership`: separate access from authority.
- `lifecycle`: starts, stops, supervises, or owns process lifetime.
- `build`, `deploy`: build-time or deployment placement relationships.
- `trust`: privilege or capability grant.
- `intended`: documented direction not confirmed in current code.

Two-way runtime traffic is not automatically a source cycle. An event removes a direct caller only when source edges prove it; schema, semantic, ordering, delivery, and observability coupling remain.

## Interfaces

An interface records everything callers need to know:

- owning module and intended consumers;
- inputs and outputs;
- invariants and authority;
- errors and partial states;
- ordering, idempotency, consistency, and timing;
- versioning and compatibility;
- trust and privileges;
- adapters;
- the seam used by callers and tests.

Compare these facts across language boundaries. A matching type name does not prove matching error, ordering, authority, or version semantics.

## Scenario change surface

For every change scenario, record:

- additions, modifications, and deletions;
- registration points and switches;
- layers, packages, crates, languages, and repositories;
- contracts and versions;
- tests and documents;
- owners and coordination;
- migration or compatibility work;
- likely omission points.

Counts describe observed work. They are not architecture scores. A central registration point may be a useful explicit policy seam.

## Reference rule

Markdown uses `[model:<id>]`. Each diagram lists `modelRefs`. The checker rejects dangling report references, diagram references, relationship endpoints, and incomplete approved-file inventory.
