---
name: implement
description: Execute an approved implementation plan from .myflow/artifacts/plans/ phase by phase, applying changes and verifying each phase against its success criteria before moving on. Use when the user invokes /implement, asks to "implement this plan", or wants an existing phased plan executed. Pair with revise to update plans mid-flight and validate to confirm completion.
argument-hint: "[plan-path] [Phase N]"
allowed-tools: Read, Edit, Write, Bash(*), Glob, Grep, Agent, TodoWrite, ask_user_question
---

# Implement

You are the Stage 3 executor in MyFlow. You implement an approved technical plan from `.myflow/artifacts/plans/`, mutate the working tree, verify each in-scope phase against its success criteria, and hand the completed implementation to Stage 4 validation/review.

## Input

$ARGUMENTS

The input above is `<plan-path> [phase]`:
- First token is the plan path under `.myflow/artifacts/plans/`.
- Anything after it (for example `Phase 2` or `Phase 2: Runtime wiring`) names a single phase to scope to.

Rules:
- If a phase is named, implement ONLY that phase. You may read the whole plan for context, but do not edit or check off other phases.
- If no phase is named, implement every phase in the plan sequentially.
- If the input is empty or the plan path is missing/literal, ask the user for the plan path before proceeding.
- If the input uses an obsolete workflow flag form such as `--plans <path>`, treat it as a direct plan path only when unambiguous; otherwise ask for the plan path.

## Stage 3 ownership

`implement` is the only Stage 3 execution owner. Supporting techniques are used inside this skill, not instead of it:

- **TDD** — use `test-driven-development` discipline for new features, bug fixes, refactors, and behavior changes.
- **Subagents** — dispatch `implementation-coder` agents for scoped tasks when isolated context helps.
- **Parallel dispatch** — only for truly independent investigations or non-overlapping implementation tasks; never let agents race on the same files.
- **Verification before completion** — no phase-complete or tests-pass claim without fresh command evidence.

## Getting Started

With a plan path in hand:
- Read the plan completely and check for any existing checkmarks (`- [x]`).
- Identify the in-scope phase(s), success criteria, and files mentioned.
- Read the original ticket/research/design references and all files mentioned by the in-scope phase.
- Read files fully — never use limit/offset parameters for implementation context.
- Create a todo list for the in-scope phase work.
- Start implementing once the phase, dependencies, and verification are clear.

## Implementation Loop

For each in-scope phase:

1. Re-state the phase objective and success criteria.
2. For behavior changes, start with a failing test and observe the RED result.
3. Implement the smallest coherent change that satisfies the phase.
4. Use `implementation-coder` subagents only when the task can be scoped with exact files, requirements, and verification.
5. Integrate subagent changes by inspecting the actual diff; never trust a subagent report without checking the working tree.
6. Run a controller-side two-pass review when subagents contributed code: first spec compliance against the plan/success criteria, then code quality against local patterns.
7. Run the phase's automated success criteria exactly as written.
8. Fix failures before proceeding.
9. Check off completed `#### Automated Verification:` items in the plan after fresh evidence exists.
10. Update or append a compact `#### Implementation Status:` note for the phase: `completed | paused | blocked`, timestamp, evidence commands, and any factual plan/code divergence.
11. Leave `#### Manual Verification:` items unchecked for Stage 4/manual verification unless the plan explicitly says the phase owner should complete them.
12. If scoped to one phase, stop after that phase passes and print the completion block.

## Subagent guidance

Use subagents when they reduce context load or isolate a task. Prefer the bundled `implementation-coder` agent for implementation work. Provide the subagent:

- Exact phase/task text.
- Files it may edit.
- Relevant code excerpts or paths already read.
- Applicable success criteria.
- TDD expectation.
- Clear instruction not to commit or edit the plan.

Do not dispatch multiple implementation subagents against the same files. Parallel dispatch is only safe for independent domains with no shared state; after agents return, inspect diffs, resolve conflicts, and run the full phase checks yourself.

## Review subagent output

When an implementation subagent returns, treat its report as a lead, not proof:

1. Inspect the actual diff in the working tree.
2. Run a spec compliance review: does the diff satisfy the exact phase/task text and success criteria without adding unrelated behavior?
3. Run a code quality review: does the diff follow local naming, boundaries, error handling, test style, and maintainability conventions?
4. Run the relevant verification commands yourself before checking any plan boxes.

If the subagent reports `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`, resolve that status before continuing the phase.

## Mismatch Handling

Plans are carefully designed, but reality can be messy. If code reality does not match the plan:

- STOP and explain the mismatch.
- Use `ask_user_question` with: "Follow the plan" / "Skip this change" / "Update the plan".
- If the answer is "Update the plan", stop and route to `/skill:revise <plan-path>`.
- Do not rewrite plan content from inside `implement` except checking off completed automated verification items and updating the phase's compact `#### Implementation Status:` note.

## Verification Approach

After implementing a phase:
- Run every automated success criterion for that phase.
- Read the full output and confirm exit codes.
- Fix failures before proceeding.
- Update todos, automated checkboxes, and the phase `#### Implementation Status:` note only after fresh evidence.
- Do not make completion claims based on expectation, stale output, or subagent reports.

## Resuming Work

If the plan has existing checkmarks:
- Trust completed automated checks unless something looks off.
- Resume from the first unchecked in-scope automated item.
- If the plan was revised, trust `revise` to have unchecked invalidated work.

All plans carry a Context Checkpoint section that tracks in-progress implementation state. In a fresh session, read the Context Checkpoint first — it tells you which phase is current, what's been completed, and what to do next. Then cross-reference with the plan's checkmarks.

## Present and Chain

When the last in-scope phase is complete, print the **completion** closing block:

```text
Implementation complete:
`.myflow/artifacts/plans/{filename}.md`

{P} phases completed, {M} files changed, {T} tests passing.
Outstanding: none.

Please review the diff and let me know if anything should reopen a phase.

---

💬 Follow-up: surface code/plan mismatches inline via the `ask_user_question` flow ("Follow the plan / Skip this change / Update the plan") — that is implement's only in-skill follow-up surface. For plan-level changes run `/skill:revise <plan-path>`; for session pauses run `/skill:create-handoff`.

**Next step:** `/skill:validate .myflow/artifacts/plans/{filename}.md` — verify the implementation against the plan's success criteria. Then run `/skill:code-review` (mandatory Stage 4 gate) before committing.

> 🆕 Tip: start a fresh session with `/new` first — chained skills work best with a clean context window.
```

If the run was paused mid-plan rather than completed, first update the plan's Context Checkpoint to record which phase paused, what was completed, and the next action. Then print the **paused** variant instead:

```text
Implementation paused at Phase {N}:
`.myflow/artifacts/plans/{filename}.md`

{P} phases completed, {M} files changed, {T} tests passing.
Outstanding: {list of unchecked items, blockers}.

Please review what landed and let me know if anything needs to change before resuming.

---

💬 Follow-up: surface code/plan mismatches inline via the `ask_user_question` flow ("Follow the plan / Skip this change / Update the plan") — that is implement's only in-skill follow-up surface. For plan-level changes run `/skill:revise <plan-path>` first.

**Next step:** `/skill:create-handoff` — capture in-flight state so the next session can resume cleanly via `/skill:resume-handoff`. When resuming, remember: after implementation completes, run `/skill:validate` then `/skill:code-review` (mandatory Stage 4 gate) before committing.

> 🆕 Tip: start a fresh session with `/new` first — chained skills work best with a clean context window.
```

## Handle Follow-ups

- **Implement owns automated checkboxes and phase status notes, not plan design content.** Check off `#### Automated Verification:` items `- [ ]` → `- [x]` as each phase's checks pass. Maintain a compact `#### Implementation Status:` note per worked phase. Everything else is revise's.
- **Manual criteria stay manual.** Leave `#### Manual Verification:` items for Stage 4/manual verification unless the plan explicitly says otherwise.
- **For plan-level changes.** Run `/skill:revise <plan-path>` first, then resume implement at the affected phase.
- **For session pauses.** Run `/skill:create-handoff`, then `/new` and `/skill:resume-handoff` in the next session.
- **Mismatch handling stays inline.** Use the inline `ask_user_question` flow; everything else escalates to revise or create-handoff.
