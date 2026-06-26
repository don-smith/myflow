# Stage 1 `start` — Adaptive Alignment Entry Point

## Quick Reference
- **Date:** 2026-06-26
- **Key files:** `skills/start/SKILL.md`, `skills/start/templates/alignment.md`, `skills/myflow/SKILL.md`, `README.md`
- **Key concepts:** adaptive alignment, right-sized rigor, risk-based escalation, artifact-led resume, stage-boundary restarts, telemetry checkpoints
- **One-line summary:** Replaced the multi-entry Stage 1 (`brainstorming` → `discover` → `explore`) with a single canonical `start` skill that produces one evolving Adaptive Alignment Artifact under `.myflow/artifacts/alignment/` and scales depth by risk.

## How It Works Now

Stage 1 begins with `/skill:start "rough idea"`. The skill:

1. Frames the work back — type, size, likely risk, discussion tracks.
2. Offers conversational tracks the developer controls: answer now, defer, infer, or skip.
3. Captures intent, desired outcome, non-goals, and concrete acceptance criteria.
4. Classifies risk with three binary triggers: `ambiguous_intent`, `architecture_impact`, `external_dependency`.
5. Deepens the same alignment artifact only when risk triggers fire — low-risk work stays compact.
6. Records decisions with provenance (`user_provided` / `agent_inferred` / `deferred` / `evidence_confirmed`).
7. Writes one evolving artifact to `.myflow/artifacts/alignment/<timestamp>_<topic>.md`.
8. Runs an explicit observability checkpoint — captures replay/telemetry references, risk classification, restart recommendation, and next-stage choice.
9. Recommends the next stage (`continue_to_research` / `continue_to_blueprint` / `continue_to_design` / `implement_directly` / `stop`).
10. Offers worktree setup at the end of Stage 1 when on `main` or shared branches, including artifact copy and fresh-session recommendation.

The alignment artifact template (`skills/start/templates/alignment.md`) contains: Intent, Desired Outcome, Non-Goals, Risk Level, Risk Triggers, Acceptance Criteria, Decisions, Open Questions, Suggested Next Step, Replay/Telemetry, and optional Future-Stage Carry-Forward.

**Supporting skills remain available** for explicit use: `brainstorming` (deep ideation), `discover` (FRD-style requirements), `explore` (solution option comparison). Their descriptions redirect to `start` as the canonical entry.

MyFlow pipeline docs (`skills/myflow/SKILL.md`, `README.md`) now:
- List `start` as the Stage 1 primary skill
- Document stage-boundary restarts — fresh sessions expected at natural boundaries, artifacts carry state
- Frame `create-handoff` / `resume-handoff` as exceptional mid-stage fallback tools
- Include light telemetry checkpoint discipline and future-stage refresh principles

## Key Decisions

### One canonical Stage 1 entry skill named `start`

**What:** `/skill:start` replaces `brainstorming` → `discover` → `explore` as the normal Stage 1 flow.
**Why:** Multiple entry points with different artifact paths created ambiguity. One entry with one artifact kind makes resumption and state discovery predictable.
**Regression risk:** low

### Risk-based escalation, not uniform ceremony

**What:** Low-risk work ends Stage 1 with a compact artifact and acceptance criteria. Higher risk triggers (ambiguous intent, architecture impact, external dependency) deepen the same artifact.
**Why:** The previous flow applied the same rigor regardless of work size. Right-sized rigor preserves discipline without unnecessary friction.
**Rejected alternative:** Per-work-type modes or separate entry points for low/high risk. Rejected because one skill that adapts by trigger is simpler than multiple skills the user must choose between.
**Regression risk:** medium

### Artifact-led resume, not handoff-first

**What:** Stage boundaries use artifacts as state carriers. Handoffs are fallback for unusual mid-stage interruption.
**Why:** Routine handoff creation/recovery at every boundary adds token and cognitive overhead. Artifacts already contain the state needed to resume.
**Regression risk:** low

### Deferred full telemetry implementation

**What:** Replay/telemetry fields appear in the artifact template and Stage 1 observability checkpoint, but new telemetry package events are not implemented.
**Why:** The artifact shape drives workflow visibility now; full event schemas involve upstream Pi integration and should be a separate slice.
**Regression risk:** low

### Old Stage 1 skills preserved, demoted to explicit tools

**What:** `brainstorming`, `discover`, and `explore` remain available but descriptions redirect users to `start`. No deletions.
**Why:** Each has useful source material and may be explicitly invoked from `start` when risk triggers warrant deeper alignment. Deletion would break existing documentation cross-references.
**Regression risk:** low

## Constraints & Gotchas

- Stage 1 must not edit source files — the guardrails in `skills/start/SKILL.md` state this explicitly, but it's a constraint agents may need to re-read.
- The flow/steps count mismatch in the original implementation (had 8 Flow items but 11 Steps) was fixed during validation. Any future skill template work should keep Flow and Step counts in sync.
- The alignment artifact template's optional sections (`Future-Stage Carry-Forward`, `References`) should not block the minimum viable artifact — missing optional sections is intentional, not a gap.

## Background Context

After approximately one week of daily MyFlow use, Dan observed that Stage 1 carried too much process friction: multiple entry skills, rigid interview patterns, separate artifacts, and unclear rules for when deeper discovery was warranted. The refresh preserves planning, scoping, acceptance criteria, artifacts, verification, and reflection — but drives the amount of process by risk rather than uniformly applying FRD/solutions/blueprint-style ceremony to all work.