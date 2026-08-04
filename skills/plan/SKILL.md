---
name: plan
description: Inherit phase boundaries 1:1 from a design artifact's Slices section, run post-finalization artifact-code-reviewer + artifact-coverage-reviewer in parallel, and produce a reviewed, implement-ready plan artifact in .myflow/artifacts/plans/. Use after the design skill to sequence a design into implementation phases and run the independent reviewer pair. Prefer plan for the review quality gate; design owns architectural decomposition and slice generation.
argument-hint: "[design artifact path]"
shell-timeout: 10
---

# Plan

You are tasked with sequencing a design artifact into a phased, reviewed implementation plan. The design artifact contains all architectural decisions, full implementation code, and per-slice Success Criteria. Your job is to inherit phase boundaries 1:1 from the design's `## Slices` section, produce the plan artifact, and run the independent post-finalization reviewer pair (artifact-code-reviewer + artifact-coverage-reviewer) against the complete artifact.

## Input

`$ARGUMENTS` — path to a design artifact (`.myflow/artifacts/designs/*.md`).

## Metadata

```!
node "${SKILL_DIR}/../_shared/now.mjs"
echo
node "${SKILL_DIR}/../_shared/git-context.mjs"
```

Copy values verbatim — do not reformat the timezone offset.

## Flow

1. Input → 2. Inherit phase boundaries from design's `## Slices` (1:1) → 3. Write plan (code from Architecture, Success Criteria pass through from `## Slices`) → 4. Independent Plan Review (code-reviewer + coverage-reviewer in parallel) → 5. Triage merged findings → 6. Follow-ups

The final artifact is implement-ready.

## Steps

### Step 1: Read Design Artifact

When this command is invoked:

1. **Determine input mode**:

   **Design artifact provided** (path to a `.md` file in `.myflow/artifacts/designs/`):
   - Read the design artifact FULLY using the Read tool WITHOUT limit/offset
   - Extract: Architecture (the code changes), **`## Slices` (slice boundaries + per-slice Success Criteria — authored by `/skill:design` Step 6.1, verified by slice-verifier at 6.2)**, File Map, Ordering Constraints, Verification Notes, Performance Considerations, Scope
   - These are the inputs for phasing. `## Slices` is the phase contract: each `### Slice N: {name}` becomes `## Phase N: {name}` with the same `**Files**:` list and the same Success Criteria. No reauthoring.
   - Design decisions are settled — do not re-evaluate them
   - If the design has unresolved questions OR the `## Slices` section is missing/empty, STOP — tell the developer to return to design

   **No arguments provided**:
   ```
   I'll create an implementation plan from a design artifact. Please provide the path:

   `/skill:plan .myflow/artifacts/designs/2025-01-20_09-30-00_feature.md`

   Run `/skill:design` first to produce the design artifact. There is no standalone path.
   ```
   Then wait for input.

2. **Read any additional files mentioned** in the design's References — research documents, tickets. Read them FULLY for context.

### Step 2: Inherit Phase Boundaries from `## Slices`

**Slice ≡ phase, 1:1.** Each `### Slice N: {name}` in the design's `## Slices` section becomes `## Phase N: {name}` in the plan. No recomposition: do not merge two slices into one phase, do not split a slice into multiple phases, do not reorder. The slice-verifier (design Step 6.2) already verified each slice's atomicity and cross-slice consistency with code + Success Criteria; recomposing here would discard that guarantee.

The design's Ordering Constraints and File Map are reference material — the slice ordering in `## Slices` already encodes them. Parallelism annotations (e.g., "Phases 2 and 3 can run in parallel after Phase 1") carry forward from the design's Ordering Constraints when slices have no inter-dependency.

Present the inherited phase structure as confirmation only (no recomposition options):

```
Inheriting {N} slices from `{design path}` as {N} phases (1:1):

## Implementation Phases:
1. {Slice 1 name} - {what it delivers} ({N} files)
2. {Slice 2 name} - {what it delivers} ({N} files)
3. {Slice 3 name} - {what it delivers} ({N} files)

Parallelism per design's Ordering Constraints: {e.g., "Phases 2 and 3 independent after Phase 1"}.
Total: {N} files across {M} phases. Success Criteria pass through from design's `## Slices` unchanged.

Proceeding to write the plan artifact.
```

No developer question — boundary changes are out of scope for plan. If the developer wants different boundaries, they revisit `/skill:design` and re-decompose. (Slice-verified atomicity is guaranteed by the design's slice-verifier at Step 6.2.)

### Step 3: Write Plan

Write the plan **incrementally** — skeleton first, then fill each phase. Code comes from the design's `## Architecture` (file-grouped); Success Criteria come from the design's `## Slices` section **unchanged** — no reauthoring, no re-derivation from Verification Notes.

1. **Write the plan skeleton** to `.myflow/artifacts/plans/<slug>_<description>.md` (use `<slug>` from line 1 of the Metadata block above; copy `<iso>` verbatim into frontmatter `date:` and `last_updated:`).
   - Format: `<slug>_<description>.md` where:
     - `<slug>` is the second tab-separated field on line 1 of the Metadata block above
     - description is a brief kebab-case description (may include ticket number)
   - Examples:
     - With ticket: `2025-01-08_14-30-00_ENG-1478-parent-child-tracking.md`
     - Without ticket: `2025-01-08_14-30-00_improve-error-handling.md`
   - The skeleton includes everything EXCEPT large code blocks: frontmatter, Overview, Desired End State, What We're NOT Doing, full phase structure (Overview, Changes Required with file paths and change summaries, **Success Criteria copied verbatim from design's `## Slices`**, parallelism annotations), Context Checkpoint, Testing Strategy, Performance Considerations, Migration Notes, Developer Context, Rehydration Manifest, References. Phase boundaries are inherited 1:1 from `## Slices` — no recomposition.
   - **Frontmatter `phases:` array** — one `{ n, title }` entry per `## Phase N:` section, in body order; `phase_count` equals its length. `implement` fans out over it.

2. **Fill code blocks using Edit** — one phase at a time:
   - For each phase, Edit to insert the code blocks from the design's `## Architecture` section into the Changes Required subsections. Use the slice's `**Files**:` list (from the design's `## Slices`) to know which Architecture entries belong to which phase.
   - Success Criteria for each phase are **already populated in the skeleton** from the design's matching `### Slice N` subsection — do not re-author. If the design's criteria look wrong, that's a design defect; do not patch here.

3. **Use this template structure**:

```markdown
---
date: {Current date and time with timezone in ISO format}
author: {`author:` from Metadata block}
commit: {Current commit hash}
branch: {Current branch name}
repository: {Repository name}
topic: "{Feature/Task Name}"
tags: [plan, relevant-component-names]
status: in-progress
parent: "{path to design artifact}"
phase_count: {number of `## Phase N:` sections}
phases:
  - { n: 1, title: {Phase 1 name} }
  - { n: 2, title: {Phase 2 name} }
last_updated: {Same ISO timestamp as `date:` above}
last_updated_by: {`author:` from Metadata block}
---

# {Feature/Task Name} Implementation Plan

## Overview

{Brief description of what we're implementing and why. Reference design artifact.}

## Desired End State

{From design artifact's Desired End State / Summary — what "done" looks like and how to verify it}

## What We're NOT Doing

{From design artifact's Scope → Not Building}

## Phase 1: {Descriptive Name}

### Overview
{What this phase accomplishes}

### Changes Required:

#### 1. {Component/File Group}
**File**: `path/to/file.ext`
**Changes**: {Summary of changes}

```{language}
// Code from design artifact's Architecture section
```

### Success Criteria:

{Copied verbatim from design's `### Slice N` subsection — same `- [ ]` bullets that slice-verifier (design 6.2) already validated against the slice's code. Do NOT re-author here.}

#### Automated Verification:
- [ ] {From design's `## Slices` → `### Slice N` → `#### Automated Verification:`}

#### Manual Verification:
- [ ] {From design's `## Slices` → `### Slice N` → `#### Manual Verification:`}

---

## Phase 2: {Descriptive Name}

{Similar structure with both automated and manual success criteria...}

---

## Testing Strategy

### Automated:
- {Standard project checks from success criteria}

### Manual Testing Steps:
1. {From design's Verification Notes — listed as manual testing steps for reference; not load-bearing for verification since design's `## Slices` Success Criteria already encode the per-phase manual checks}
2. {Another reference step}

## Performance Considerations

{From design artifact — copied directly}

## Migration Notes

{From design artifact — copied directly. If applicable: schema changes, data migration, rollback strategy, backwards compatibility. Empty if not applicable.}

## Developer Context

{Empty at skeleton write; Step 4.4 fallback notes and any post-write developer interactions land here.}

## Context Checkpoint

status: in-progress

### Completed
- {Phases completed during implementation}

### Working Set
- Files changed: {paths}
- Key references: {artifact paths}

### Next Action
- {What to implement or verify next}

---

## Rehydration Manifest

### Artifacts to Read
- `.myflow/artifacts/plans/{timestamp}_{topic}.md` — full

### Source Files to Read
- {Key files from plan phases}

### Key Decisions
- {Decision 1}: {verdict}
- {Decision 2}: {verdict}

### Next Command
`/skill:implement .myflow/artifacts/plans/{timestamp}_{topic}.md`

## References

- Design: `.myflow/artifacts/designs/{file}.md`
- Research: `.myflow/artifacts/research/{file}.md`
- Original ticket: `thoughts/me/tickets/{file}.md`
```

### Step 4: Independent Plan Review

After Step 3 finalizes the artifact, dispatch two independent review subagents in parallel — one to walk every Phase code fence, one to walk every verification intent — both against the live codebase at HEAD. This is the single post-finalization quality gate for the entire `design → plan` pipeline: code review was deliberately deferred from design to here, where code + Success Criteria + phasing are all visible in one artifact for joint review.

#### 4.0. Flip status to in-review

Before dispatching the reviewers, Edit frontmatter `status: in-progress` → `status: in-review` (Step 5 flips to `ready` after triage — keeps consumers off an artifact still being edited).

#### 4.1. Dispatch artifact-code-reviewer and artifact-coverage-reviewer in parallel

Reuse the exact `file_path` string passed to `Write` at Step 3 — the runtime already resolved it for this platform; do not rebuild it from `pwd`. `ls` to verify it still exists; abort dispatch on miss.

Send both Agent calls in a single assistant message so they run in parallel:

```
Agent({
  subagent_type: "artifact-code-reviewer",
  description: "post-finalization plan code review",
  prompt: `Plan artifact: {Step-3 Write file_path, ls-verified}

Review the finalized plan against the live codebase at HEAD. Walk every Phase code fence, audit against code-quality / codebase-fit / actionability, emit one severity-tagged row per finding.`
})

Agent({
  subagent_type: "artifact-coverage-reviewer",
  description: "post-finalization plan coverage review",
  prompt: `Plan artifact: {Step-3 Write file_path, ls-verified}

Review the finalized plan's verification-intent coverage. Walk every ## Verification Notes and ## Precedents & Lessons entry; for each, verify it lands in either a phase's ### Success Criteria: bullet or as a visible code mirror. Emit one severity-tagged row per uncovered entry.`
})
```

#### 4.2. Persist the merged review table to the artifact

Each agent returns a markdown table with columns `plan-loc | codebase-loc | severity | dimension | finding | recommendation`. Merge both tables into one section, prepending a `source` column (`code` for artifact-code-reviewer rows, `coverage` for artifact-coverage-reviewer rows), adding a `classification` column (set to `ordering-only` or `material` at Step 5), and appending a `resolution` column (initially blank, filled progressively at Step 5):

```markdown
## Plan Review (Step 4)

_Independent post-finalization review by artifact-code-reviewer and artifact-coverage-reviewer subagents. Findings triaged at Step 5._

| source   | plan-loc          | codebase-loc                | severity   | classification | dimension             | finding   | recommendation   | resolution         |
| -------- | ----------------- | --------------------------- | ---------- | -------------- | --------------------- | --------- | ---------------- | ------------------ |
| code     | {plan-loc}        | {codebase-loc}              | {severity} | (set Step 5)   | {dimension}           | {finding} | {recommendation} | (set Step 5)       |
| coverage | {plan-loc}        | <n/a>                       | {severity} | (set Step 5)   | verification-coverage | {finding} | {recommendation} | (set Step 5)       |
| ...      |                   |                             |            |                |                       |           |                  |                    |
```

Sort merged rows by severity first (blocker → concern → suggestion), then by source (`code` before `coverage` for stable ordering within a severity). Within a `(severity, source)` bucket, preserve each agent's own emitted order — do not re-sort across source spaces (the two agents key on different artifact loci: `Phase N §M` for code, `## Verification Notes §K` for coverage).

If both agents emit zero rows, still emit the section with a single line: `_No findings — both reviewers cleared the artifact._`. Persistence is mandatory regardless of finding count — the section is the durable audit trail.

#### 4.3. Tally findings for Step 5's prompt

Do not decide the classification from severity alone. In Step 5, inspect each finding and classify it as `ordering-only` or `material` before presenting it. Count only material rows for the developer prompt:

```
{B} material blockers, {C} material concerns, {S} material suggestions; {O} ordering-only findings
```

A finding is `ordering-only` only when the failure is caused solely by cross-phase dependency order and the complete fix is to move already-specified work (including its existing files and Success Criteria) to an earlier or later existing phase. It must not change architecture, scope, API shape, runtime behavior, verification intent, or phase order/numbering. Everything else is `material`.

Material findings are never auto-applied; the developer decides `applied` / `deferred` / `dismissed` at Step 5. Ordering-only findings are the explicit exception: mark them `ordering-only`, do not count them as blockers, and auto-apply them without `ask_user_question` as specified below.

#### 4.4. Failure handling

Per-agent: if one reviewer errors out (subprocess crash, malformed output, timeout) and the other succeeds, persist the successful agent's rows and append a one-line failure note for the missing source. If both fail, append the failure note alone.

- Successful side: persist its rows as in 4.2.
- Failed side: append `_Step 4 {code|coverage} review failed: {one-line cause}._` under the `## Plan Review (Step 4)` heading.
- Record any failure in `## Developer Context`: `Step 4 {code|coverage} review unavailable; proceeded to developer review without {agent-name} findings.`
- Proceed to Step 5 regardless.

The review-table header is retained when only one source returns; only rows from the failing agent are absent. Step 5 classification and triage iterate whatever rows are present.

### Step 5: Review & Iterate

1. **Classify findings before developer triage** (skip if Step 4 returned no findings):

   Inspect every reviewer row, including rows labeled `blocker`, before showing it to the developer. If a row satisfies the exact `ordering-only` predicate from Step 4.3, handle it automatically:

   - Set `classification` to `ordering-only` and `resolution` to `auto-applied: phase ordering — {one-line summary}`.
   - Do not present it through `ask_user_question`, do not count it as a blocker, and do not relabel the reviewer's severity merely to avoid the prompt.
   - Update the **design artifact**, not just the generated plan: move the complete existing Architecture entry, its `Files` assignment, and its matching Success Criteria verbatim into the earlier/later existing `## Slice N` that makes the dependency valid. Preserve slice numbering and order; do not invent, split, merge, or reword work.
   - Update any affected Ordering Constraints and record the automatic correction in the design's existing developer/history context.
   - Dispatch the design skill's `slice-verifier` against the updated design and require a clean result for affected-slice atomicity, cross-slice symbol references, terminal-slice checks, shared-file ownership, and criteria alignment. If the fix is not unambiguous, verification fails, or the verifier is unavailable, stop treating the row as `ordering-only` and classify it as `material`.
   - Regenerate the plan from the updated design and rerun both Step 4 reviewers. Treat the regenerated plan and its fresh findings as authoritative; record the prior plan path as superseded in the regenerated plan's Developer Context and do not ask about stale rows. Allow at most one **automatic ordering-only** regeneration cycle per invocation; developer-directed regeneration for a material design change follows its normal design verifier and is not silently folded into this automatic loop. If the same or any new ordering finding remains after the automatic regeneration, classify it as `material` and send it to developer triage rather than looping.

   Apply independent ordering-only moves together only when their combined destination and dependency order are unambiguous. Otherwise classify the dependent set as `material` and triage it normally. For an ambiguous material ordering finding, an `applied` choice is incomplete until the developer names the destination and the orchestrator verifies it; never silently choose between candidate phases.

   After all safe ordering-only corrections are applied, present only the remaining material rows with severity-grouped framing:

   ```
   Plan-reviewer findings requiring developer triage: {B} material blockers, {C} material concerns, {S} material suggestions; {O} ordering-only findings auto-applied

   Triage each material row before the freeform review below:
   - applied — change made; I'll Edit per the recommendation target when it is a plan-transcription issue (Phase code fence for code findings, or copied Success Criteria only when plan failed to copy the design verbatim) and fill the row's resolution as `applied: {one-line summary}`
   - deferred — noted but not fixing now; resolution cites why (e.g., "out of scope for this plan", "follow-up commit")
   - dismissed — not a real issue; resolution explains why the reviewer was wrong (e.g., "X is intentional because Y")
   ```

   Use `ask_user_question` only for material rows, with options "applied / deferred / dismissed":
   - **applied**: Edit per the recommendation target only when the defect is in plan transcription — if the recommendation names a `## Phase N` code fence, Edit that fence; if it names a copied `### Success Criteria:` bullet that differs from design, restore the design text. If the finding requires new criteria or changed phase boundaries, route it back to `/skill:design`; the design skill's normal slice-verifier and plan re-entry are required, and this plan must not flip to `ready` until the regenerated plan and both reviewers pass again. After any plan-local Edit to a code fence or copied criteria, rerun both Step 4 reviewers before accepting the artifact as ready; fresh findings replace stale rows. Fill `resolution`.
   - **deferred** / **dismissed**: fill `resolution` with the reason.

   **Code finding caveat**: when a material code finding's root cause is in the design's Architecture (not just plan transcription), the patch belongs upstream. Either (a) Edit the design artifact and re-run `/skill:plan`, or (b) apply the fix to the plan's Phase code fence and annotate the resolution with `applied (plan-local; design follow-up: <design path>)`. Option (a) is cleaner; option (b) is acceptable for tactical fixes.

   **Order and batching**: material blockers sequentially (resolution may invalidate later rows). Material concerns and suggestions: batch up to 4 independent rows per `ask_user_question` call. Independent = different files / different intents AND neither recommendation references the other's location; otherwise sequential.

2. **Rebuild `phases:` then flip status to ready**: after the final regenerated plan has passed Step 4 and every material row has a `resolution` (or the table is empty per Step 4's no-findings / failure-fallback path):
   - **Rebuild the `phases:` frontmatter array (and `phase_count`) from the `## Phase N:` headings** — one `{ n, title }` entry per section, in body order. This is a consistency check after transcription edits; phase boundaries must still match the design's `## Slices` 1:1.
   - Compare every regenerated `## Phase N` against its matching design `### Slice N`: `Files`, Architecture/code blocks, and Success Criteria must match the updated design's assignments verbatim. If any differ, keep `status: in-review` and correct/regenerate before proceeding.
   - Edit frontmatter `status: in-review` → `status: ready`. Artifact is now implement-ready.

3. **Present the plan location** (after the final review pass and triage are complete):
   ```
   Implementation plan written to:
   `.myflow/artifacts/plans/{filename}.md`

   {N} phases, {M} total file changes. {T} material reviewer findings triaged at Step 5 ({A} applied, {D} deferred, {DD} dismissed); {O} ordering-only findings auto-applied. If either reviewer hit Step 4.4's per-agent failure-fallback, render this line as `Step 4 {code|coverage|both} review unavailable — proceeded with available findings.`

   Please review:
   - Are the phases properly scoped for worktree execution?
   - Are the success criteria specific enough?
   - Any phase boundary concern that should be sent back to `/skill:design`?

   ---

   💬 Follow-up: describe the change in chat to append a timestamped Follow-up section to this artifact, or use `/skill:revise <plan-path>` for surgical phase edits. Re-run `/skill:plan` for a fresh artifact.

   **Next step:** `/skill:implement .myflow/artifacts/plans/{filename}.md Phase 1` — start execution at Phase 1 (omit `Phase 1` to run all phases sequentially).

   > 🆕 Tip: start a fresh session with `/new` first — chained skills work best with a clean context window.
   ```

### Step 6: Handle Follow-ups

- **Edit in-place.** Use the Edit tool to update the plan artifact directly. Phase numbering stays stable when possible — renumber only when a phase is split or merged.
- **Bump frontmatter.** Update `last_updated` + `last_updated_by`; set `last_updated_note: "<one-line summary>"`.
- **Boundary changes route upstream.** Do not split, merge, or reorder phases in plan; phase boundaries come from design's `## Slices` 1:1. If boundaries or Success Criteria need substantive changes, update the design artifact and re-run `/skill:plan`. The sole automatic exception is an `ordering-only` repair: moving already-specified work and its verbatim criteria between existing slices to satisfy dependency order. Plan-local edits are limited to transcription fixes and review-table resolutions.
- **When to re-invoke instead.** For surgical edits driven by review findings, prefer `/skill:revise <plan-path>`. Re-run `/skill:plan` only when the underlying design changed materially. The previous block's `Next step:` stays valid for the existing plan.

## Guidelines

1. **Trust the Design**:
   - Design decisions are fixed — do not re-evaluate architectural choices
   - Success Criteria are also fixed — pass them through verbatim from design's `## Slices`; do not re-author, re-derive, or "improve" them. Slice-verifier already validated them against the slice's code at design 6.2
   - Phase boundaries are fixed — inherit 1:1 from design's `## Slices`; do not recompose, except for the narrowly defined `ordering-only` repair in Step 5, which relocates existing work without changing slice count, order, or intent
   - If something in the design seems materially wrong, flag it to the developer; do not silently patch it in plan. Safe phase-order-only corrections are not material design changes and are auto-applied upstream as defined in Step 5.
   - The design is the source of truth for what to build. The design skill handles architectural decomposition; plan owns sequencing, safe dependency-order repair, and review.

2. **Pass-Through, Not Author**:
   - Plan transforms a design artifact into phased shape; it does not invent content
   - Code blocks in `## Phase N` come from the design's `## Architecture` entries
   - Success Criteria come from the design's `## Slices` `### Slice N` subsections, unchanged
   - The only place plan exercises judgment is Step 5 classification and triage of reviewer findings. Safe phase-order-only findings are auto-applied; material design-root-cause findings route back to `/skill:design`

3. **Be Practical**:
   - Focus on incremental, testable changes
   - Each phase should leave the codebase in a working state
   - Think about what can be verified independently
   - Include "what we're NOT doing" from the design's scope

4. **Phase for Worktrees**:
   - Each phase should be implementable in an isolated worktree
   - No phase should depend on another phase's uncommitted changes
   - The design already encoded worktree-sized slices via its decomposition + slice-verifier; trust it
   - Do not split or merge phase boundaries inside plan

5. **Track Progress**:
   - Use a todo list to track planning tasks
   - Mark planning tasks complete when done

6. **No Open Questions in Final Plan**:
   - If you encounter open questions during planning, STOP
   - If the design artifact has unresolved questions OR a missing `## Slices` section, send the developer back to design
   - Do NOT write the plan with unresolved questions
   - The implementation plan must be complete and actionable

## Success Criteria — Format Reference

Success Criteria are **authored upstream in `/skill:design` Step 6.1** and verified by slice-verifier at design 6.2. Plan copies them through from the design's `## Slices` section into each phase's `### Success Criteria:` block **unchanged**. The reference below is for understanding the expected shape, not for authoring inside plan.

**Two categories, same shape design produces:**

1. **Automated Verification** (run by execution agents): commands like `make test` / `npm run lint`; file-existence checks; type checking; test suites.
2. **Manual Verification** (requires human): UI/UX, real-conditions performance, hard-to-automate edge cases, UAT.

**Format example:**
```markdown
### Success Criteria:

#### Automated Verification:
- [ ] Database migration runs successfully: `make migrate`
- [ ] All unit tests pass: `go test ./...`
- [ ] No linting errors: `golangci-lint run`
- [ ] API endpoint returns 200: `curl localhost:8080/api/new-endpoint`

#### Manual Verification:
- [ ] New feature appears correctly in the UI
- [ ] Performance is acceptable with 1000+ items
- [ ] Error messages are user-friendly
- [ ] Feature works correctly on mobile devices
```

If the design's criteria don't match this shape, the defect lives upstream — return to `/skill:design` to fix, do not patch in plan.

## Subagent Usage

| Context | Agents Spawned |
|---|---|
| Step 4 post-finalization code review (mandatory) | artifact-code-reviewer |
| Step 4 post-finalization coverage review (mandatory) | artifact-coverage-reviewer |
| Step 5 ordering-only design repair (conditional) | slice-verifier |

Both reviewers dispatch in parallel against the final artifact (code + Success Criteria + phasing all visible). This is the single quality gate for the entire `design → plan` pipeline — design owns no post-finalization review.

## Important Notes

- NEVER edit source files — this skill produces a plan document, not implementation
- Always read the design artifact FULLY before inheriting phase boundaries
- The plan template must be compatible with implement — preserve the phase/success criteria structure
- If the design artifact has unresolved questions OR is missing its `## Slices` section, STOP — send the developer back to design
- **Slice ≡ phase, 1:1**: inherit each slice as its phase and never reauthor Success Criteria. A narrowly scoped `ordering-only` repair may relocate existing work and matching criteria between existing slices, preserving slice count/order and rechecking atomicity and cross-slice alignment; this is not permission to recompose, split, merge, reorder, or invent work
- Plan is the single post-finalization quality gate for the `design → plan` pipeline: code + Success Criteria + phasing are all visible in one artifact for joint review by artifact-code-reviewer + artifact-coverage-reviewer
- ALWAYS dispatch artifact-code-reviewer AND artifact-coverage-reviewer in parallel at Step 4 after Step 3 finalize, BEFORE the developer review at Step 5
- NEVER auto-apply a material Step 4 reviewer finding. The sole exception is a finding proven `ordering-only` by the Step 4.3 predicate; auto-apply that correction upstream in the design, regenerate the plan, and rerun both reviewers before developer triage
- ALWAYS hold `status: in-review` from Step 4.0 through the final Step 5 review pass; flip to `ready` only after every material row has a `resolution` and all auto-applied ordering-only corrections have been regenerated and re-reviewed
- Code in the plan comes from the design artifact's Architecture section — do not invent new code
- **Frontmatter consistency**: Always include frontmatter, use snake_case for multi-word fields, keep tags relevant
