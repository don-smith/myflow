---
name: discover
description: Extract feature intent and requirements through grill-me rounds when Scope cannot state the outcome and acceptance criteria clearly enough. Supports light ideation for a fuzzy concept and structured requirements extraction for complex work. Writes a requirements artifact into the workstream and returns to scope.
argument-hint: "[free-text feature description | existing artifact path]"
shell-timeout: 10
---

# Discover

<MyFlow-Note>
In MyFlow Stage 1, `scope` is the canonical entry point.
Use `discover` explicitly when Scope reveals ambiguous intent — the work needs deeper requirements extraction than the adaptive alignment flow provides.
Produces: `<workstream-root>/<workstream-id>/scope/<timestamp>_requirements.md`. Returns to: `scope`.
</MyFlow-Note>

You are tasked with extracting feature intent and requirements through `grill-me` rounds, then writing a requirements document that Scope links from its alignment artifact.

Discover operates on a spectrum: from light ideation for fuzzy concepts through structured requirements extraction for complex work. The output adjusts to the depth needed — a few crisp sections for straightforward work, a full document for high-stakes features.

## Input

`$ARGUMENTS` — free-text feature description, or path to an existing requirements document, ticket, or doc for refinement.

## Metadata

```!
node "${SKILL_DIR}/../_shared/now.mjs"
echo
node "${SKILL_DIR}/../_shared/git-context.mjs"
```

Copy values verbatim — do not reformat the timezone offset.

## Flow

1. Input → 2. Intent question → 3. Codebase look → 4. Requirement branches → 5. Grill-me rounds → 6. Synthesize → 7. Write artifact → 8. Return to Scope

## Steps

### Step 1: Input handling

1. **No argument provided**: ask for a free-text feature description, or the path to an existing requirements document, ticket, or doc to refine. Then wait for input.

2. **Detect input shape** — parse the input:
   - If the argument is an existing file path, read it FULLY. Treat its content as baseline context — the interview surfaces gaps, missing requirements, and unstated assumptions.
   - Otherwise → fresh-feature mode: the entire argument is the free-text feature description.

3. **Read any other files mentioned** — tickets, docs, related artifacts, explicit `path:line` references — FULLY before proceeding.

**No exploration in Step 1.** Read only the paths the developer named. Grounding starts in Step 3.

Each invocation writes a NEW timestamp-distinct artifact (Step 7). To iterate on a prior one, re-invoke discover with its path.

### Step 2: Foundational intent question

Before any codebase look, ask the foundational intent question. This is purely conversational — no exploration, no recommendation, no `file:line` citations.

1. **Ask one open-ended intent question**, through `ask_user_question` where the host supports structured questions and in plain text otherwise:
   - Frame: "What problem are you solving and who hits it?" or "What does success look like?" — phrase it for the specific feature.
   - **No recommended answer.** `grill-me` carries this rule: the developer generates the framing, so an intent question offers open shapes that route the answer, never a recommendation and never a solution shape.
   - **No `file:line` citations** — the codebase has nothing to say about intent.

2. **Capture the answer in the developer's own words.** This text feeds the Problem and Intent section verbatim.

3. **Probe-readiness check**: does the stated intent support a *narrow* look at the code? If yes → Step 3. If not, ask one more intent question to sharpen scope, then re-check. Cap: 3 intent questions before falling through to Step 3.

### Step 3: Short codebase look

Ground the rounds in concrete codebase evidence, shaped by the stated intent.

1. **Keep the slice narrow** — one component, one seam. Locate the relevant code and read what the search surfaces (≤5 files). Read-only exploration in a fresh context is the preferred shape; a direct search in this session is the fallback.

2. **Cap the look at two passes.** Discover is not research: when a question needs a real investigation, name it for `research` instead.

3. **Empty results are not fatal.** If the look returns little, record "no codebase precedent" as evidence.

### Step 4: Requirement branches

Build the design tree `grill-me` works, rooted in the developer's stated problem. Its immediate branches are the requirement categories this skill owns:

- Goals and non-goals
- Functional requirements
- Non-functional requirements — performance, security, UX, accessibility, reliability
- Constraints and assumptions
- Acceptance criteria
- Recommended approach

Order the branches by dependency: root → goals → constraints → solution shape → details. Mark any branch the Step 3 evidence already settles, with its `file:line` citation, and confirm those pre-resolutions in the first round rather than recording them silently. Expand a branch's children only once it resolves; do not present the tree unless the developer asks for it.

### Step 5: Grill-me rounds

Run the interview as `grill-me` rounds: ask the whole frontier — every branch whose prerequisites are settled — in one numbered round, each question with its recommended answer, then wait for the answers before recomputing the frontier. Intent is already settled in Step 2 and carries no recommendation; every requirement branch is a proposal the developer reviews, so it does carry one. Derive each recommendation from the stated intent, the Step 3 evidence, and project conventions.

Classify each response:

- **Decision**: record it, resolve the branch, continue.
- **Correction**: look again at the newly named area, then adjust the affected subtree.
- **Scope adjustment**: update the tree and record the decision. Related but unrequested observations go to Suggested follow-ups.
- **Cross-cutting answer**: mark the branch cross-cutting and re-queue it under each affected parent.
- **Defer**: add it to Open questions, resolve by deferral, continue.

**Termination — depth check, not bucket-fill.** Stop when every branch has a decision or a deferral, the developer's own words appear in Problem and Goals, and no decision reads "recommendation accepted" without a rationale. Do not invent questions to pad the interview, and never ask a final "looks good?" rubber-stamp question.

### Step 6: Synthesize the requirements body

Read `templates/frd.md` (relative to this skill folder) at runtime to confirm the section list and frontmatter shape.

Compile the rounds into the document. Redistribute answers into the template's sections:

- **Summary** — 2-3 sentences capturing the settled feature concept.
- **Problem and intent** — the developer's framing from Step 2, in their own words.
- **Goals / Non-goals** — explicit in and out lists.
- **Functional requirements** — numbered, each independently testable.
- **Non-functional requirements** — performance, security, UX, accessibility, reliability.
- **Constraints and assumptions** — environmental, technical, schedule, organizational.
- **Acceptance criteria** — observable pass conditions. Each MUST name a concrete command, output, or visible behavior.
- **Recommended approach** — 1-2 sentences naming the architectural shape the decisions imply.
- **Decisions** — the full question and answer log per decision.
- **Open questions** — only what the developer explicitly deferred.
- **Suggested follow-ups** — related but out-of-scope items.
- **References** — input files, mentioned tickets, related artifacts.

### Step 7: Write the artifact

1. **Determine metadata** (from the Metadata block above): `repository:` ← `repo:` label; `branch:` and `commit:` ← matching labels; `date:` and `last_updated:` ← `<iso>`; author ← `author:`.

2. **Write the document** to:

   ```text
   <workstream-root>/<workstream-id>/scope/<timestamp>_requirements.md
   ```

   Frontmatter `status: ready`. When no workstream exists yet, `scope` creates one first — do not invent a workstream directory here.

### Step 8: Return to Scope

Report the artifact path, the requirement and decision counts, and the open questions. Then hand control back:

```text
/skill:scope <workstream-root>/<workstream-id>/scope/<timestamp>_requirements.md
```

`scope` links the requirements document from the alignment artifact and owns the depth, specialist, and next-action decisions from there. Discover does not select downstream specialists itself.

Each invocation writes a fresh artifact; iterate by re-invoking discover with the prior path. The developer may also edit the document directly.

## Light mode and full mode

- **Light mode** (fuzzy concept, open-ended ideation): fewer rounds, focused on clarifying what the work even is. The output may be compact — problem and intent, goals and non-goals, a few decisions. Enough for `scope` to size the work.
- **Full mode** (complex work, multiple stakeholders, architectural impact): the full round loop with a complete document. All template sections present.

Ask rounds until the tree resolves. Don't force ceremony for simple work.

## Visual companion

When the topic involves visual questions (UI mockups, layout comparisons, architecture diagrams), offer an optional browser-based companion once during the interview:

> "Some of what we're working on might be easier to explain visually. I can show mockups, diagrams, and comparisons in a browser. Want to try it?"

This offer MUST be its own message. If they decline, proceed text-only. If they accept, use the browser for the questions that benefit from visual treatment — not every question needs it.

## Important notes

- **Always interview-first, intent-first**: never write the document without running the rounds.
- **Intent generates, everything else reviews**: intent is the developer's framing. Every other question is a proposal they review.
- **Lazy tree, no full-tree pre-build**: build the root and its immediate branches only. Expand each branch's children after it resolves.
- **Pre-resolutions confirm, never silently record**: put evidence-based branches in the first round.
- **Interview order is not section order**: walk in dependency order; redistribute in Step 6.
- **Never write or edit source files**: this skill produces one artifact.
- **Short look, not research**: the codebase look stays within two passes. Name a real investigation for `research`.
