---
name: discover
description: Extract feature intent and requirements through one-question-at-a-time dialogue. Supports both light ideation (when the concept is fuzzy) and structured FRD extraction (when the work is complex). Produces a Feature Requirements Document at .myflow/artifacts/discover/ that chains to research. Invoke explicitly when scope doesn't produce clear enough requirements.
argument-hint: "[free-text feature description | existing artifact path]"
shell-timeout: 10
---

# Discover

<MyFlow-Note>
In MyFlow Stage 1, `/skill:scope` is the canonical entry point.
Use `discover` explicitly when scope reveals ambiguous intent — the work needs deeper requirements extraction than the adaptive alignment flow provides.
Produces: `.myflow/artifacts/discover/`. Chains to: `research`.
</MyFlow-Note>

You are tasked with extracting feature intent and requirements through a one-question-at-a-time dialogue, then writing a Feature Requirements Document (FRD) that downstream skills consume.

Discover operates on a spectrum: from light ideation for fuzzy concepts through structured requirements extraction for complex work. The output adjusts to the depth needed — a few crisp sections for straightforward work, a full FRD for high-stakes features.

## Input

`$ARGUMENTS` — free-text feature description, or path to an existing FRD / ticket / doc for refinement.

## Metadata

```!
node "${SKILL_DIR}/../_shared/now.mjs"
echo
node "${SKILL_DIR}/../_shared/git-context.mjs"
```

Copy values verbatim — do not reformat the timezone offset.

## Flow

1. Input → 2. Intent question → 3. Codebase probe → 4. Lazy tree → 5. Interview loop → 6. Synthesize FRD → 7. Write artifact → 8. Follow-ups

## Steps

### Step 1: Input Handling

1. **No argument provided**:
   ```
   I'll capture feature intent into an FRD. Provide one of:

   `/skill:discover [free-text feature description]`     — fresh interview, write a new FRD
   `/skill:discover [existing artifact path]`            — refine an existing FRD/ticket/doc via fresh interview
   ```
   Then wait for input.

2. **Detect input shape** — parse the input:
   - If the argument is an existing file path, read it FULLY. Treat its content as baseline context — the interview surfaces gaps, missing requirements, and unstated assumptions.
   - Otherwise → fresh-feature mode: the entire argument is the free-text feature description.

3. **Read any other files mentioned** — tickets, docs, related artifacts, explicit `path:line` references — FULLY before proceeding.

**No agent dispatch in Step 1.** Only `Read` on user-named paths. Agent grounding starts in Step 3.

Each invocation always writes a NEW timestamp-distinct artifact (Step 7). To iterate on a prior FRD, re-invoke discover or manually Edit the prior artifact.

### Step 2: Foundational Intent Question

Before any codebase probe, ask the foundational intent question. This is purely conversational — no agents, no recommendation, no `file:line` citations.

1. **Ask one open-ended `intent` question** via `ask_user_question`:
   - Frame: "What problem are you solving and who hits it?" / "What does success look like?" — phrase it for the specific feature.
   - **No `(Recommended)` option.** The developer should generate the framing.
   - **No `file:line` citations** — codebase has nothing to say about intent.
   - Options should be open shapes that route the answer, not solution shapes.

2. **Capture the answer in the developer's own words.** This text feeds into the FRD's Problem & Intent section verbatim.

3. **Probe-readiness check**: does the stated intent support a *narrow* probe slice? If yes → proceed to Step 3. If no (answer is too vague), ask **one more `intent` question** to sharpen scope, then re-check. Cap: 3 `intent` questions before falling through to Step 3.

### Step 3: Lightweight Codebase Probe

Ground the upcoming interview in concrete codebase evidence, shaped by the developer's stated intent from Step 2.

1. **Pick the agent set.** Dispatch `codebase-locator`, `codebase-analyzer`, or both. Cap: 2 agents.

2. **Spawn the chosen agent(s) in parallel.** Draft each prompt from the developer's stated intent — keep the slice narrow (one component, one seam).

3. **Wait for ALL agents to complete before proceeding.**

4. **Read any clearly-relevant files** surfaced by the agents (≤5 files).

5. **Empty results are not fatal.** If the probe returns thin/empty results, record "no codebase precedent" as evidence.

### Step 4: Lazy Tree Setup + Pre-Resolution Confirmation

Synthesize the **next layer** of questions internally before asking anything. Lazy expansion — build only root + immediate children.

1. **Build root + immediate children**:
   - **Root** — the developer's already-stated problem from Step 2.
   - **Immediate children** — Goals/Non-Goals · Functional Requirements · Non-Functional Requirements · Constraints · Acceptance Criteria · Recommended Approach.
   - Order branches by dependency (root → goals → constraints → solution shape → details).

2. **Mark evidence-based pre-resolutions** from Step 3 with `file:line` citations.

3. **Batch-confirm pre-resolutions in a single `ask_user_question` call** before entering the interview loop.

4. The lazy tree stays internal — do NOT present the tree to the developer unless asked.

### Step 5: Interview Loop

Walk the lazy tree depth-first, parent before child. Expand the next layer only after the node resolves. For each unresolved node:

1. **Classify the question by tier**:
   - **`intent`** — already done in Step 2. Do not re-ask intent.
   - **`scope`** (goals · non-goals · functional reqs · constraints) — recommendation grounded in stated intent.
   - **`shape`** (architectural choice) — frame **dialectically**: name the tradeoff axis. Each option's description MUST state what it optimizes for AND what it sacrifices.
   - **`detail`** (acceptance criteria · routine sub-decisions) — batchable when 2-4 sibling leaves are independent.

2. **Recommended answer**: derive from intent + Step 3 evidence + project conventions. Label `(Recommended)`.

3. **Ask via `ask_user_question`.** One question at a time unless independent `detail` leaves are batched.

4. **Classify each response**:
   - **Decision**: Record in Decisions. Resolve the node. Continue.
   - **Correction**: Re-run targeted probe on the new area; ≤1 additional narrow agent. Adjust the affected subtree.
   - **Scope adjustment**: Update the tree. Record in Decisions. Related-but-unrequested observations go to Suggested Follow-ups.
   - **Cross-cutting answer**: Mark the node cross-cutting and re-queue under each affected parent.
   - **Defer**: Add to Open Questions. Resolve by deferral. Continue.

5. **Batching**: When 2-4 sibling `detail` leaves are independent, batch in a single `ask_user_question` call.

6. **Termination — depth check, not bucket-fill**: stop when:
   - (a) every branch has a Decision or a Deferral, AND
   - (b) the developer's own words appear in Problem/Goals, AND
   - (c) no Decision is `Recommendation accepted` without at least one Rationale clause.

   Do not invent questions to pad the interview. Do NOT ask a final "looks good / want to adjust" rubber-stamp question.

**Total agent budget**: 2 (Step 3) + N×1 (Step 5 corrections) = 2-4 agent dispatches per FRD.

### Step 6: Synthesize FRD Body

Read `templates/frd.md` (relative to this skill folder) at runtime to confirm the section list and frontmatter shape.

Compile interview output into the FRD. Redistribute answers into template buckets:

- **Summary** — 2-3 sentences capturing the settled feature concept.
- **Problem & Intent** — the developer's framing from Step 2, in their own words.
- **Goals / Non-Goals** — explicit in/out lists.
- **Functional Requirements** — numbered, each independently testable.
- **Non-Functional Requirements** — perf, security, UX, accessibility, reliability.
- **Constraints & Assumptions** — environmental, technical, schedule, organizational.
- **Acceptance Criteria** — observable pass conditions. Each MUST name a concrete command, output, or visible behavior.
- **Recommended Approach** — 1-2 sentences naming the architectural shape implied by the decisions. This feeds `research`'s scope-tracer topic.
- **Decisions** — full Q/A log per decision.
- **Open Questions** — only items the developer explicitly deferred.
- **Suggested Follow-ups** — related-but-out-of-scope items.
- **References** — input files, mentioned tickets, related artifacts.

### Step 7: Write Artifact, Present, Chain

1. **Determine metadata** (from the Metadata block above):
   - Filename: `.myflow/artifacts/discover/<slug>_<topic>.md`.
   - `repository:` ← `repo:` label; `branch:` / `commit:` ← matching labels.
   - `date:` / `last_updated:` ← `<iso>`.
   - Author: `author:` from the Metadata block.

2. **Write the FRD** using the Write tool. Frontmatter `status: ready`.

3. **Present and chain**:
   ```
   Intent captured to:
   `.myflow/artifacts/discover/<YYYY-MM-DD_HH-MM-SS>_<topic>.md`

   {N} requirements, {M} decisions, {K} open questions.

   ---

   💬 Follow-up: discover writes a fresh FRD per call — re-invoke `/skill:discover` to iterate.

   **Next step:** `/skill:research .myflow/artifacts/discover/<YYYY-MM-DD_HH-MM-SS>_<topic>.md` — ground the intent in codebase reality.

   > 🆕 Tip: start a fresh session with `/new` first — chained skills work best with a clean context window.
   ```

### Step 8: Handle Follow-ups

- **Fresh artifact per call, no in-place append.** Each invocation writes a NEW timestamp-distinct FRD.
- **Iterate by re-invoking.** Re-run `/skill:discover [path-to-prior-FRD]` to produce a fresh FRD.
- **No rubber-stamp question.** NEVER ask a final "looks good / want to adjust" question.
- **Manual edits are allowed.** The developer can Edit the FRD directly.

## Light Mode vs. Full Mode

Discover operates on a spectrum:

- **Light mode** (fuzzy concept, open-ended ideation): fewer questions, focus on clarifying what the work even is. The output may be compact — a Problem & Intent section with goals/non-goals and a few decisions. Enough to unblock `research`.
- **Full mode** (complex work, multiple stakeholders, architectural impact): the full interview loop with detailed FRD output. All template sections present.

The skill adapts naturally — ask questions until the tree resolves. Don't force ceremony for simple work.

## Visual Companion

When the topic involves visual questions (UI mockups, layout comparisons, architecture diagrams), offer an optional browser-based companion once during the interview:

> "Some of what we're working on might be easier to explain visually. I can show mockups, diagrams, and comparisons in a browser. Want to try it?"

This offer MUST be its own message. If they decline, proceed text-only. If they accept, use the browser for questions that benefit from visual treatment — not every question needs it.

## Important Notes

- **Always interview-first, intent-first**: Never write the FRD without running the interview loop.
- **Always one question at a time**: Even with batched `detail` leaves, wait for answers before the next round.
- **`intent` generates, `scope`/`shape`/`detail` reviews**: Intent is the developer's framing — they generate it. Everything else is a proposal — they review it.
- **Lazy tree, no full-tree pre-build**: Build only root + immediate children. Expand each node's children only after the node resolves.
- **Pre-resolutions confirm, never silently record**: Batch-confirm evidence-based nodes.
- **Interview order ≠ FRD section order**: Walk in dependency order; redistribute into FRD sections in Step 6.
- **Never write or edit source files**: This skill produces an artifact only.
- **Fresh artifact every invocation**: Each call writes a NEW timestamp-distinct file.
- **Light fan-out only**: Step 3 ≤2 agents. Step 5 ≤1 additional agent per correction event.
