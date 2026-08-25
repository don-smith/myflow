# Assessment lenses

Apply only lenses tied to approved drivers and scenarios. Record strengths, intentional trade-offs, and non-risks. Then record candidate findings.

## Intent alignment

Compare current code and configuration with tracked intent. Do not blend views. A divergence needs evidence for each side and a concrete impact on a driver or scenario.

## Dependency semantics

Inspect source direction, cycles, package rules, and facade bypass. Keep source dependency separate from calls, commands, events, data access, lifecycle, deployment, and trust. Qualify type-only imports and composition-root knowledge.

## Modules and interfaces

Use `codebase-design` terms. Ask what each module owns, what its interface makes callers learn, where the seam sits, and which adapters vary there. Judge depth by leverage and locality. A large implementation can be deep. A small file can be shallow.

## Contract completeness

Inspect types plus invariants, authority, errors, partial state, ordering, idempotency, consistency, timing, versioning, trust, and compatibility. Compare wire and type contracts across languages. Look for stringly capabilities, partially tagged states, and notifications mistaken for authoritative results.

## Data authority and trust

Separate ownership from read and write access. Trace persistence, replication, recovery, retention, and privilege grants. Identify where current behavior can disagree and which fact wins.

## Sibling consistency

Group modules by role. Derive the documented or dominant pattern. List variants, then look for requirement, authority, failure, or decision evidence that explains them. Report only unexplained variants as candidate inconsistencies.

## Domain language

Compare canonical terms, aliases, homonyms, code spellings, and context translations. Same-context synonyms can split one concept. Different bounded contexts may correctly use different terms. The risk is missing or ambiguous translation at a seam.

## Expected evolution

Run concrete change probes. Name every file and owner touched. Explain additive work, modifications, deletions, central registration, compatibility, tests, and documents. Do not apply open-closed guidance without a driver. Discoverable central policy can be worth one deliberate edit.

## Temporal coupling

Use history only when it has enough meaningful commits. Filter initial imports, formatting, generated changes, migrations, and reorganizations. Inspect surprising cross-module or cross-language co-change. State thresholds, sample limits, and confidence. Never infer causality from co-change alone.

## Runtime and operations

Select qualities named by drivers, such as availability, recovery, consistency, latency, security, deployment, or observability. Trace success and failure paths. Missing production infrastructure is a gap unless approved scope proves absence.

## Candidate architecture checks

Propose objective checks only when the accepted architecture principle has a measurable rule and failure response. Candidates include dependency direction, cycle freedom, public export rules, cross-language contract checks, schema versions, ownership declarations, privileged import rules, and scenario contract tests.

Do not automate subjective labels such as good architecture or readability. Call a check a fitness function only after the developer accepts its threshold and response.

## Finding shape

Each candidate includes evidence, driver, scenario, impact, trade-offs, confidence, options, preservation constraints, candidate checks, and documentation consequences. Keep recommendations pending until final triage.
