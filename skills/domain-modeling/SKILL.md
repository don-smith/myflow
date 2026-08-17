---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when the user wants to pin down domain terminology or a ubiquitous language, record an architectural decision, or when another skill needs to maintain the domain model.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline — challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. Merely consuming a glossary is not this skill; this skill is for when the model changes.

## Repository sources

Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` first and read its selected `repository-map.md` when found. Use its mapped glossary, context-map, and ADR sources rather than assuming `CONTEXT.md`, `CONTEXT-MAP.md`, or `docs/adr/`.

If the map is absent or does not name a relevant source, inspect the repository's existing guidance and ask before creating a glossary or ADR location. Record the missing mapping for `onboard` to refresh. Create a source lazily only after the developer confirms its location and there is a resolved term or qualifying decision to record.

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

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the mapped ADR convention; when this skill's `ADR-FORMAT.md` is the confirmed format, use it.
