# MyFlow Status

## Recently Completed

- **Stage 1 `start` — Adaptive Alignment entry point** (2026-06-26, `73cc9f0`)
  - Added `skills/start/SKILL.md` with conversational progressive flow
  - Added `skills/start/templates/alignment.md` — alignment artifact template
  - Rewired Stage 1 docs in `myflow` and `README` to center `start`
  - Demoted old Stage 1 skills with MyFlow-Note redirects
  - Added telemetry checkpoint discipline and stage-boundary restart guidance
  - Risk-based escalation: ambiguous_intent, architecture_impact, external_dependency

## What's Next

- **Canonical `resume` skill** — artifact-led continuation. Single `/skill:resume` command that reads `.myflow/artifacts/`, infers stage, and proposes next action. Replaces ad-hoc handoff-first recovery.
- **Telemetry checkpoint adoption across stages 2-5** — Stage 1 has the checkpoint pattern; extend to remaining stages without implementing full package events.
- **Artifact taxonomy consolidation** — move `.myflow/specs/` output under `.myflow/artifacts/<kind>/` so skills can find and classify state consistently.
- **Opportunistic MyFlow onboarding** — auto-detect when MyFlow is preferred but `.myflow/` is missing, offer to set up.
- **Per-repo MyFlow parameters** — first-class repo-specific config for artifact destinations, validation commands, stage contracts.
- **Repo-local processes plug into MyFlow stages** — discover and honor repo-specific skills, guidance, procedures at each stage.
- **DI pattern documentation** — document dependency-injection conventions in project guidance (predates Stage 1 work).
- **Testing philosophy: prefer DI over mocks** — codify in project guidance (predates Stage 1 work).
- **`start` escalation paths** — `start` should suggest `brainstorming`/`discover`/`explore` as explicit escalation when risk triggers fire.