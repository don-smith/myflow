---
name: capturing-learnings
description: Use at end-of-artifact checkpoints (after a spec, plan, or major commit set) and when deciding whether something observed during work should become a skill, runbook, memory entry, or be consciously dropped
---

# Capturing Learnings

## Overview

Observations turn into durable artifacts — skills, runbooks, memory entries — or they turn into nothing. The rule is **once is a moment; twice is a pattern.** Don't formalize on first occurrence; wait for the second sighting.

This skill covers two companion practices:

1. The **end-of-artifact checkpoint** — four questions we run after each approved spec, plan, or major commit set.
2. The **promotion rule** — how we decide whether a tabled observation becomes a skill, a runbook, a memory entry, or a conscious drop.

**Announce at start:** "I'm using the capturing-learnings skill to run the end-of-artifact checkpoint" or "…to decide where this learning goes."

## End-of-artifact checkpoint

After each approved spec, plan, or major commit set — and **before proceeding to the next artifact** — answer four questions:

1. **Is the current artifact solid?** Does it include what it should? Any obvious gap or drift?
2. **Are we carrying an assumption that hasn't been tested?** If yes, note it — ideally as a tabled entry or a memory update.
3. **What in the repo's personal tabled file is ready to be processed?** Resolve it with `node "${SKILL_DIR}/../_shared/repo-store.mjs" state tabled`, walk each entry, and decide destination.
4. **What should be promoted to an artifact (skill, runbook, memory) or remembered going forward?**
5. **Any existing personal memory for this repo that is now stale?** Resolve it with `node "${SKILL_DIR}/../_shared/repo-store.mjs" state memory`, glance through the index, and update or remove entries whose rationale has dissolved (milestone shipped, decision reversed, scope narrowed). Announce changes when they affect future work.

The checkpoint produces either (a) a concrete change (a file written, a memory updated, a skill created) or (b) an explicit "nothing to do" — never a vague promise to "come back to this later."

## Promotion rule — once is a moment; twice is a pattern

Premature formalization has the same cost structure as premature abstraction in code. Wait for the second sighting, then capture. Applied consistently:

- **First occurrence of a pattern:** observe. Table if useful; otherwise carry on.
- **Second occurrence:** capture as an artifact.

The second sighting need not be in the same session or milestone — a tabled entry from months ago is perfectly valid as the "first" sighting when the second arrives.

## Which artifact?

When the second sighting arrives, match the learning to an artifact type:

| Learning shape | Artifact | Where it lives | Half-life |
|---|---|---|---|
| A tactical, reusable how-to — the specific steps for doing one thing well (may include a script) | **Skill** | Project-local `.pi/skills/<name>/SKILL.md`, global `~/.pi/agent/skills/<name>/SKILL.md`, or an installed Pi package skill | Long — skills travel. |
| A broader process or practice — often composing multiple skills, sometimes with its own scripts | **Runbook** | Configured runbook path: `node "${SKILL_DIR}/../_shared/repo-store.mjs" path runbooks` | Medium — check on use; runbooks rot fast. |
| A recurring user preference, constraint, or project context to carry across sessions | **Memory entry** | Personal repo memory: `node "${SKILL_DIR}/../_shared/repo-store.mjs" state memory` | Long — until the context shifts. |
| A permanent record of shipped work | **Repository documentation** | The repository's configured documentation location | Follow the repository's documentation policy; do not assume a universal document type. |

**Skill vs runbook — working heuristic:** a **skill** is the tactical detail: how you do one specific thing (e.g. "epiphany-tabling," "repository documentation review," "running a particular class of query"). A **runbook** is a broader process or practice that often orchestrates multiple skills (e.g. "onboard a new agent," "release a new image") and may also carry its own scripts. Both skills and runbooks can reference or invoke scripts; the difference is scope — tactical vs. procedural.

This heuristic is still being refined — we have a few of each to date and expect to recalibrate as the first runbook lands that clearly composes multiple skills. Rewrite is cheap; the important thing is to start putting these artifacts in place so the codebase becomes more navigable for AI agents and humans together.

## Proliferation test

**Before creating any new markdown file, ask: does the content belong in an existing document?**

- If yes → extend the existing document. Add a section, a bullet, a row.
- If no → justify the new file explicitly. Add a row to the document inventory in `docs/ways-of-working.md` in the **same change** that creates the file.

Markdown sprawl is the failure mode. The inventory is the mitigation. Consolidate aggressively; delete willingly.

## When NOT to capture

- **The learning is truly one-off.** The second sighting hasn't arrived and is unlikely to. Drop it, or leave the tabled entry in place for later.
- **It is already documented** somewhere appropriate (existing skill, existing runbook, an existing memory entry). Update the existing artifact rather than creating a new one.
- **It is a mechanical constraint that can be enforced by code or CI** (lint rule, type check, validation). Encode it, don't document it — save documentation for judgment calls.

## Related practices

- `epiphany-tabling` — the source of most learnings this skill processes.
- `writing-retros` — the milestone-level version of the end-of-artifact checkpoint.
- Repository documentation review — the permanent record for a closed piece of work, following that repository's own conventions.
