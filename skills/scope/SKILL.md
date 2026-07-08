---
name: scope
description: Begin a MyFlow workstream with right-sized Stage 1 scoping. Accepts rough ideas, voice transcripts, tickets, or notes; produces an Adaptive Alignment Artifact under .myflow/artifacts/alignment/ and chains to research.
argument-hint: "[rough idea | transcript | ticket path | notes path]"
shell-timeout: 10
---

# Scope

Begin a MyFlow workstream with Stage 1 **Scope**. This skill turns rough narrative input into a compact, evolving **Adaptive Alignment Artifact** and chains to `research`.

**Announce at start:** "I'm using the `scope` skill to begin a MyFlow workstream with right-sized scoping."

## Purpose

Stage 1 answers:

> Do we understand the work well enough to proceed to codebase research?

`scope` is conversational and progressive. It is not a rigid FRD interview, not a solution-design phase, and not an implementation phase.

## Input

`$ARGUMENTS` may be:

- a rough idea
- a voice transcript
- a ticket or issue description
- a path to existing notes or an artifact

If no input is provided, ask the user for a short description of the work before probing the repo.

If the input names readable files, read them fully before framing the work. Do not edit source files during Stage 1.

## Metadata

```!
node "${SKILL_DIR}/../_shared/now.mjs"
echo
node "${SKILL_DIR}/../_shared/git-context.mjs"
```

Copy values verbatim when writing the artifact. Do not reformat timezone offsets.

## Flow

1. Input → 2. Frame back → 3. Conversation tracks → 4. Minimum alignment → 5. Risk assessment → 6. Decision provenance → 7. Write artifact → 8. Observability checkpoint → 9. Chain to research → 10. Worktree & restart → 11. Present & chain

## Steps

### Step 1: Input Handling

1. **No argument provided** — ask:
   ```
   What work should we scope? A rough idea, transcript, ticket, or note path is enough.
   ```
   Then wait.

2. **Argument provided** — detect whether it contains paths:
   - Read any mentioned file paths fully.
   - Treat the rest as narrative context.

3. **Do not dispatch broad agents by default.** Stage 1 may inspect named files and lightweight repo guidance, but deeper codebase research belongs to `research`. Scope frames the work; research grounds it in code.

### Step 2: Frame the Work Back

Reflect the work in a compact block before asking detailed questions:

```markdown
Here's what I think this is:
- Work type:
- Likely size:
- Likely risk:
- Why:
- Things we may need to discuss:
```

Use tentative language. The developer can correct any part of the frame.

### Step 3: Offer Conversation Tracks

Offer a short menu of useful tracks. The user controls whether to answer now, defer, authorize inference, or skip.

Common tracks:

- goals and non-goals
- current friction or pain
- acceptance criteria
- risk and blast radius
- artifact / handoff / restart needs
- telemetry and replay needs

Ask one focused question at a time unless 2-4 independent details can be batched safely. When the question offers concrete choices, use the `ask_user_question` tool rather than a prose menu; lead with the recommended option when one exists and rely on the tool's automatic free-text escape hatch for corrections or combinations.

### Step 4: Minimum Alignment

Before Stage 1 can finish, capture at least:

- Intent — what problem is being solved, and for whom
- Desired Outcome — what changes when this succeeds
- Non-Goals — what is explicitly out of scope
- Acceptance Criteria — concrete observable checks or outcomes
- Risk Level — low, medium, or high
- Risk Triggers — yes/no for each trigger below
- Suggested Next Step — always `continue_to_research`

Acceptance criteria must be concrete enough for later validation. Avoid vague statements like "works well" or "improves UX" without observable checks.

### Step 5: Risk Assessment

Classify risk using exactly these triggers:

1. **ambiguous_intent** — goal, user, success condition, or non-goals remain unclear.
2. **architecture_impact** — changes boundaries, public APIs, persistent data, major abstractions, or cross-component flow.
3. **external_dependency** — touches integrations, paid services, auth, deployment, data-loss risk, or third-party APIs.

Risk assessment shapes the depth of the alignment artifact but does not change the next step: scope always chains to `research`. If intent remains fuzzy despite the alignment conversation, recommend `/skill:discover` for deeper requirements extraction before research.

Low-risk work can complete Stage 1 with a compact artifact and acceptance criteria.

### Step 6: Decision Provenance

Record meaningful decisions with provenance:

```markdown
- decision: <decision>
  source: user_provided | agent_inferred | deferred | evidence_confirmed
  rationale: <why>
  affects: stage_selection | scope | acceptance_criteria | risk | implementation
```

Do not silently turn an inference into a decision. If a decision matters, either confirm it with the user or mark it `agent_inferred` clearly.

### Step 7: Write or Update the Alignment Artifact

Read `templates/alignment.md` relative to this skill folder before writing. Use it as the artifact structure.

Include the Context Checkpoint and Rehydration Manifest sections in the alignment artifact, following the shared template at `skills/myflow/templates/stage-context-checkpoint.md`. The Context Checkpoint tracks in-progress alignment state; the Rehydration Manifest tells the next session what to re-read before research.

Set the Rehydration Manifest's Next Command to `/skill:research <alignment-path>`.

Write the artifact to:

```text
.myflow/artifacts/alignment/<timestamp>_<topic>.md
```

Use the timestamp from the Metadata block. Use a short kebab-case topic slug.

If continuing an existing alignment artifact named by the user, update that artifact in place instead of creating a duplicate.

### Step 8: Stage Observability Checkpoint

Before presenting Stage 1 as complete, fill the artifact's `Replay / Telemetry` section as much as current tooling allows:

- `pi_session_id` / `telemetry_trace_id` / `conversation_log_ref` when available
- `created_from_branch`
- `created_worktree`, if created
- `restart_recommended`
- `next_session_expected_in`

Also ensure the artifact visibly records the workflow signals needed to evaluate whether Stage 1 worked:

- final risk level and risk-trigger values
- acceptance criteria count/quality
- decisions with provenance
- deferred questions
- suggested next step and rationale

Do not implement new telemetry events here. Full workflow event instrumentation is future work; this checkpoint preserves the shape and discipline now.

### Step 9: Chain to Research

Scope always chains to `research`. Set `Suggested Next Step` to `continue_to_research`. If the work is still fuzzy after scoping, recommend `/skill:discover` for deeper requirements before research — but scope itself does not perform deep requirements extraction.

### Step 10: Worktree and Restart Offer

At the end of Stage 1, inspect the current branch and repo root:

```bash
git branch --show-current
git rev-parse --show-toplevel
```

Then derive and present:

- topic slug
- suggested branch name, usually `feature/<topic-slug>`
- suggested worktree path
- alignment artifact path
- next-stage command

If the user is on `main` or another shared branch, offer to set up an isolated worktree before research:

```bash
# Create worktree
git worktree add -b feature/<topic-slug> <worktree-path>
# Ensure artifact directory
mkdir -p <worktree-path>/.myflow/artifacts/alignment/
# Copy alignment artifact
cp .myflow/artifacts/alignment/<timestamp>_<topic>.md <worktree-path>/.myflow/artifacts/alignment/
```

Recommend a fresh session inside the worktree and show the exact next-stage command.

Stage boundaries should normally resume from artifacts, not `create-handoff` / `resume-handoff`. Handoffs remain available for unusual mid-stage interruption.

### Step 11: Present and Chain

Close with:

```markdown
Alignment artifact:
`.myflow/artifacts/alignment/<timestamp>_<topic>.md`

Risk: <low|medium|high>
Risk triggers: ambiguous_intent=<yes/no>, architecture_impact=<yes/no>, external_dependency=<yes/no>
Suggested next step: `continue_to_research`

Suggested branch:
`feature/<topic-slug>`

Suggested worktree:
`<path>`

**Next step (Stage 1 continues):**
`/skill:research .myflow/artifacts/alignment/<timestamp>_<topic>.md`
```

Recommend starting a fresh session for research. If the recommended next step is research (always), say so explicitly and include the expected directory.

---

💬 Follow-up: re-run `/skill:scope <alignment-artifact-path>` to deepen the same artifact. Re-run `/skill:scope` for a fresh workstream.

> 🆕 Tip: start a fresh session with `/new` first — chained skills work best with a clean context window.

## Artifact Requirements

The artifact must include these headings:

- Intent
- Desired Outcome
- Non-Goals
- Risk Level
- Risk Triggers
- Acceptance Criteria
- Decisions
- Open Questions
- Suggested Next Step
- Replay / Telemetry

Optional sections may be added when risk requires them.

## Guardrails

- Do not edit source files during Stage 1.
- Do not perform deep requirements extraction — that's `discover`'s job. Scope frames the work and chains forward.
- Do not create multiple Stage 1 artifacts for one workstream unless the user explicitly asks.
- Do not treat handoffs as routine stage boundaries.
- Do not skip acceptance criteria.
- Do not bury risk-trigger decisions in prose; make them visible.
- Scope always chains to `research`. There is no `implement_directly` shortcut from scope.

## Follow-ups

- To deepen alignment, re-run `/skill:scope <alignment-artifact-path>` and update the same artifact.
- To extract deeper requirements when intent is still fuzzy, run `/skill:discover "[description]"`.
- To research the codebase, run `/skill:research <alignment-path>`.
- To design a solution, run `/skill:design <research-path>`.
- Then run `/skill:plan <design-path>` to produce an implementation plan.
