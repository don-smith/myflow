---
name: start
description: Begin a MyFlow workstream with right-sized Stage 1 alignment. Accepts rough ideas, voice transcripts, tickets, or notes; produces an Adaptive Alignment Artifact under .myflow/artifacts/alignment/ and recommends the next stage.
argument-hint: "[rough idea | transcript | ticket path | notes path]"
shell-timeout: 10
contract:
  produces:
    kind: produces
    meta:
      artifactKind: alignment
    data:
      type: object
      properties:
        status:
          enum: [in-progress, ready]
        risk_level:
          enum: [low, medium, high]
        suggested_next_step:
          enum: [continue_to_research, continue_to_blueprint, continue_to_design, implement_directly, stop]
---

# Start

Begin a MyFlow workstream with Stage 1 **Discover & Align**. This skill turns rough narrative input into a compact, evolving **Adaptive Alignment Artifact** and recommends the right next stage.

**Announce at start:** "I'm using the `start` skill to begin a MyFlow workstream with right-sized alignment."

## Purpose

Stage 1 answers:

> Do we understand the work well enough to choose the next stage and the right amount of rigor?

`start` is conversational and progressive. It is not a rigid FRD interview, not a solution-design phase, and not an implementation phase.

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

1. Input → 2. Frame back → 3. Conversation tracks → 4. Minimum alignment → 5. Risk escalation → 6. Decision provenance → 7. Write artifact → 8. Observability checkpoint → 9. Recommend next step → 10. Worktree & restart → 11. Present & chain

## Steps

### Step 1: Input Handling

1. **No argument provided** — ask:
   ```
   What work should we start? A rough idea, transcript, ticket, or note path is enough.
   ```
   Then wait.

2. **Argument provided** — detect whether it contains paths:
   - Read any mentioned file paths fully.
   - Treat the rest as narrative context.

3. **Do not dispatch broad agents by default.** Stage 1 may inspect named files and lightweight repo guidance, but deeper codebase research belongs to Stage 2 unless a risk trigger requires more alignment questions.

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
- solution options, only when multiple viable paths are obvious

Ask one focused question at a time unless 2-4 independent details can be batched safely.

### Step 4: Minimum Alignment

Before Stage 1 can finish, capture at least:

- Intent — what problem is being solved, and for whom
- Desired Outcome — what changes when this succeeds
- Non-Goals — what is explicitly out of scope
- Acceptance Criteria — concrete observable checks or outcomes
- Risk Level — low, medium, or high
- Risk Triggers — yes/no for each trigger below
- Suggested Next Step — one of the allowed next-step values

Acceptance criteria must be concrete enough for later validation. Avoid vague statements like "works well" or "improves UX" without observable checks.

### Step 5: Risk-Based Escalation

Classify risk using exactly these triggers:

1. **ambiguous_intent** — goal, user, success condition, or non-goals remain unclear.
2. **architecture_impact** — changes boundaries, public APIs, persistent data, major abstractions, or cross-component flow.
3. **external_dependency** — touches integrations, paid services, auth, deployment, data-loss risk, or third-party APIs.

Human-facing UX does not automatically force deeper Stage 1 unless it also creates ambiguity or risk.

Escalate depth only when one or more triggers are `yes`:

- Ask additional alignment questions.
- Add optional artifact sections such as Constraints, Assumptions, Options Considered, Dependency Risks, Manual Verification Implications, or Recommended Stage 2 Path.
- Keep expanding the same alignment artifact rather than creating separate Stage 1 artifacts.

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

### Step 9: Recommend the Next Step

Set `Suggested Next Step` based on risk and readiness:

| Value | Use when |
|---|---|
| `continue_to_research` | Codebase reality must be understood before design. |
| `continue_to_blueprint` | Work is small/medium and ready for fused design + plan. |
| `continue_to_design` | Work is complex enough to need separate design before planning. |
| `implement_directly` | Very small, low-risk work has enough acceptance criteria and does not need Stage 2. |
| `stop` | The user only wanted alignment or the work is not ready. |

If recommending direct implementation, explain why Stage 2 can be skipped safely.

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

If the user is on `main` or another shared branch, offer to set up an isolated worktree before Stage 2. Use the `using-git-worktrees` skill behavior for actual creation.

When creating a worktree from Stage 1:

1. Create the worktree using `using-git-worktrees` safety rules.
2. Ensure `.myflow/artifacts/alignment/` exists in the target worktree.
3. Copy or rewrite the alignment artifact to the same relative path in the target worktree.
4. Recommend a fresh session inside the worktree and show the exact next-stage command.

Stage boundaries should normally resume from artifacts, not `create-handoff` / `resume-handoff`. Handoffs remain available for unusual mid-stage interruption.

### Step 11: Present and Chain

Close with:

```markdown
Alignment artifact:
`.myflow/artifacts/alignment/<timestamp>_<topic>.md`

Risk: <low|medium|high>
Risk triggers: ambiguous_intent=<yes/no>, architecture_impact=<yes/no>, external_dependency=<yes/no>
Suggested next step: `<value>`

Suggested branch:
`feature/<topic-slug>`

Suggested worktree:
`<path>`

**Next step:**
`/skill:<recommended-skill> .myflow/artifacts/alignment/<timestamp>_<topic>.md`
```

If a fresh session is recommended, say so explicitly and include the expected directory.

---

💬 Follow-up: re-run `/skill:start <alignment-artifact-path>` to deepen the same artifact. Re-run `/skill:start` for a fresh workstream.

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
- Do not force `brainstorming` → `discover` → `explore` ceremony for low-risk work.
- Do not create multiple Stage 1 artifacts for one workstream unless the user explicitly asks.
- Do not treat handoffs as routine stage boundaries.
- Do not skip acceptance criteria.
- Do not bury risk-trigger decisions in prose; make them visible.

## Follow-ups

- To deepen alignment, re-run `/skill:start <alignment-artifact-path>` and update the same artifact.
- To research, run `/skill:research <alignment-artifact-path>`.
- To create a fused design/plan, run `/skill:blueprint <alignment-artifact-path>`.
- To design separately, run `/skill:design <alignment-artifact-path>`.
