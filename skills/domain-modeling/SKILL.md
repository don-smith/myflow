---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when the user wants to pin down domain terminology or a ubiquitous language, or when another skill needs to maintain the domain model.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, inventing edge-case scenarios, and writing the glossary down the moment a term crystallises. Merely consuming a glossary is not this skill; this skill is for when the model changes.

Architectural decision records belong to `design`. When a domain boundary settles into a decision worth recording, hand it there rather than writing the ADR here.

## Repository sources

Run `node ../myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` from this skill folder first, and read its selected `repository-map.md` when found. Use its mapped glossary and context-map sources rather than assuming `CONTEXT.md` or `CONTEXT-MAP.md`.

If the map is absent or does not name a relevant source, inspect the repository's existing guidance and ask before creating a glossary location. Record the missing mapping for `onboard` to refresh. Create a source lazily only after the developer confirms its location and there is a resolved term to record.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the mapped glossary, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update the mapped glossary inline

When a term is resolved, update the mapped glossary right there. Don't batch these up — capture them as they happen. Use the repository's established format; when this skill's `CONTEXT-FORMAT.md` is the confirmed format, use it.

The glossary should be totally devoid of implementation details. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Hand a settled decision to design

When the session settles an architectural decision rather than a term — a boundary that moves, an integration pattern between contexts, an ownership rule — say so and hand it to `design`, which owns architectural decision records. Keep the glossary to terms.
