---
name: epiphany-tabling
description: Use when an unexpected realization, pattern, follow-up item, or fork in the road surfaces mid-task — table it to the repo's personal MyFlow tabled file instead of derailing the current work
---

# Epiphany Tabling

## Overview

When something unexpected surfaces mid-work — a realization, a fork in the road, a follow-up item, a pattern we almost missed — we do not stop and redesign. We **table it**: add a short entry to this repo's personal MyFlow tabled file with enough context to reconstruct later, then keep going.

Resolve the file path before writing:

```bash
node "${SKILL_DIR}/../_shared/repo-store.mjs" state tabled
```

The tabled file is the single working-memory location for both epiphanies and tabled follow-up work for this repo on this machine. It lives in the global per-repo MyFlow store, not in the target repo's committed docs.

**Announce at start:** "I'm using the epiphany-tabling skill to table `<topic>` — will process it at the next checkpoint."

## The rule

An epiphany is either:

1. **Acted on immediately**, if trivially cheap and in-scope for the current task. ("Trivially cheap" means: the current task will be done at roughly the same time either way.)
2. **Tabled**, otherwise.

Never lost. Never derailing.

## What tabling looks like

Add a bullet to the resolved tabled file with:

- A one-line title stating the insight.
- A 2–4 line description with enough context to reconstruct it later: what you were doing, what you noticed, what the shape of the fix or follow-up probably is.
- Where its next destination probably is (spec, runbook, skill, memory, retro, drop) — when known.

Example:

```markdown
- **Plan drift: `parseEvent` spread ordering in `docker-runner.ts`.** Production
  code at ~line 67–78 spreads `...obj` AFTER setting explicit `type`/`phase`/`msg`
  fields, so malformed JSON with `obj.type !== "status"` could overwrite the typed
  `type` field. Not blocker for M1; fix before M2 if parseEvent is touched.
```

The entry has to be reconstructable cold. Assume future-Claude has not read the current conversation — write enough that the entry stands alone.

## When NOT to table

- **In-scope trivial fixes.** If the fix is three lines and the current task's tests already exercise it, just do it.
- **Clarifications the user just asked for.** Answer in conversation; don't table an answer to a live question.
- **Things already captured elsewhere** (existing tabled entry, spec section, memory entry) — update those, don't duplicate.

## Processing

Tabled entries are processed at:

- An **end-of-artifact checkpoint** (after an approved spec, plan, or major commit set).
- A **milestone retro** (processed alongside keep-doing / stop-or-change).
- A **milestone close** — outstanding items worth keeping roll into the configured status/backlog location; completed/obsolete items are dropped. The tabled file ends each milestone empty — every entry must resolve to a destination (backlog, skill, runbook, memory) or be explicitly dropped. Zero entries is the only acceptable end state.
- **Ad-hoc**, if the working file grows past a screen of content — that is a signal to process, not to let it sprawl.

Each entry is processed into its probable destination (status/backlog, spec amendment, runbook, skill, memory entry, repository documentation, or conscious drop) and then **removed** from the tabled file. The file stays small; entries arrive, get processed, and leave.

## Related practices

- `capturing-learnings` — the promotion rule that decides whether a processed entry becomes a skill, runbook, or memory.
- `writing-retros` — the milestone-level ritual where tabled entries often land.
