---
name: writing-retros
description: Use at milestone close to produce a MyFlow process retrospective — four-section format (keep doing / stop or change / promote to artifact / commit to memory) reflecting on how the MyFlow skills and process performed, feeding improvements back into MyFlow itself
---

# Writing Retros

## Overview

A milestone retrospective is a **MyFlow process reflection** — not a replacement for repository product documentation. The retro asks: *did the MyFlow skills and practices work well? What should change?*

This is one of two feedback loops for improving MyFlow over time (the other is the eval system, developed separately). Together they ensure the process continuously improves with each piece of work. Retros feed directly into MyFlow itself — patterns surfaced here become new skills, existing skills get refined, and practices adjust.

**Announce at start:** "I'm using the writing-retros skill to produce the retro for `<milestone>`."

## Output

One file in the repo's personal MyFlow retro directory. Resolve the directory before writing:

```bash
node "${SKILL_DIR}/../_shared/repo-store.mjs" state retros
```

Write: `<resolved-retros-dir>/YYYY-MM-DD-<milestone>.md`.

Retros are **frozen once accepted**. Future amendments go into a new retro, not this one — inline edits to a retro erode its value as an episodic record.

Retros are MyFlow process records, not target-repo product documentation. If a retro surfaces durable repo knowledge, promote that specific knowledge into the configured runbook path, configured status file, AGENTS file, or the repository's normal documentation location.

## The four sections

Every retro has exactly these sections, in this order, focused on the MyFlow process:

1. **Keep doing.** What MyFlow skills, practices, or patterns worked well and should continue. Name the practice, not just the outcome. ("Epiphany-tabling captured real-time observations without derailing work" is actionable; "M1 went well" is not.)
2. **Stop or change.** What MyFlow skills, practices, or patterns did not work and should change. Be specific about the pain and the proposed change. ("The design skill emitted oversized slices that the plan skill couldn't sequence cleanly — consider capping slice size" is actionable; "design was slow" is not.)
3. **Promote to artifact.** Patterns worth extracting into new skills, runbooks, scripts, or memory entries to improve MyFlow. Cross-reference the **promotion rule** (see `capturing-learnings`) — each item here should have at least one prior sighting the retro can point at.
4. **Commit to memory.** What, if anything, belongs in the personal repo memory system about how MyFlow should operate in this repo. Resolve it with `node "${SKILL_DIR}/../_shared/repo-store.mjs" state memory`. Often a subset of §3; sometimes its own distinct item.

Optional lightweight sections at the end (appendix-style): headline stats, acknowledgements, historical context. Keep them short.

## Process

1. **Gather inputs.**
   - Personal tabled file: `node "${SKILL_DIR}/../_shared/repo-store.mjs" state tabled` — every entry is a candidate for one of the four sections or for processing during retro review.
   - The repository documentation changes (if already drafted) or the spec + plan + git log (if not).
   - Memory writes made during the milestone.
   - Any explicit "save this for retro" notes from the user during execution.

2. **Draft top-to-bottom.** Short, specific bullets under each section focused on the MyFlow process. Avoid the urge to write prose paragraphs — retros are scannable lists. Stay focused: this is about *how we worked*, not *what we built*.

3. **Review with the user before freezing.** Retros are frozen after acceptance, so the review *must* happen first. The retro is a conversation starter about process improvement, not a monologue.

4. **Freeze.** One file in the personal retros directory. After this point, do **not** rewrite the retro inline; if paths or references later need updating, add a note at the top and point at the source of truth.

## Common failure modes

- **Confusing retro with product documentation.** The retro reflects on the MyFlow process. If a section drifts into describing the work rather than the process, it belongs in the repository's documentation, not the retro.
- **Meta-theater.** Reflection that produces more reflection rather than process improvement. If a section has no concrete insight about how to improve MyFlow, cut it or sharpen it.
- **Silent drift.** Practices on paper diverging from practices in use. The retro only catches this if honest — don't smooth over what went wrong with the process.
- **Stale references.** A frozen retro loses value when the paths it references move. Either update the paths before freezing, or add a dated note at the top after freeze — never rewrite inline.
- **Undifferentiated "stop or change."** Generic complaints about the process without a proposed change aren't retro content. If you can't name what to try differently, that's a candidate for §3 "promote to artifact" or for a deliberate drop.

## Related practices

- `capturing-learnings` — the promotion rule that decides whether a retro insight becomes a new skill, runbook, or memory entry feeding back into MyFlow.
- `epiphany-tabling` — the in-flight practice that feeds retro content about what surfaced during work.
- Repository documentation review — the permanent record of *what* shipped. Retros capture *how we worked* (the MyFlow process); repository documentation captures *what* we built. Retros feed back into MyFlow; product documentation follows the repository's own conventions.
