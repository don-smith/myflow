# MyFlow Status

## Recently Completed

- **Stage 3 implementation refresh** (2026-06-29)
  - Made `implement` the sole Stage 3 executor and moved TDD/subagents/parallel dispatch into in-phase tactics
  - Replaced the standalone subagent executor with a scoped `implementation-coder` agent
  - Removed the obsolete workflow runtime, workflow sibling, built-in workflow registrations, workflow contracts, and workflow model override scopes
  - Contract frontmatter is no longer emitted on active skills because the workflow contract consumer was deleted

- **Stage 2 design/planning restructure** (2026-06-29)
  - Removed the separate `blueprint` skill and standardized Stage 2 on `research/explore → design → plan → implement`
  - Moved standalone/free-text entry into `design`
  - Kept `plan` as the single post-design implementation-readiness and reviewer gate
  - Updated built-in workflows so implementation paths route through `design → plan → implement`
  - Captured durable rationale in `docs/changes/2026-06-29-stage-2-design-planning-restructure.md`

- **Stage 1 completion — escalation wiring & cohesion audit** (2026-06-26, `24a70b9`)
  - Wired explicit escalation paths in `start` — risk triggers now map to `brainstorming`, `discover`, `explore`, or `research` with rationale
  - Added `escalate_to_*` values to `Suggested Next Step` enum
  - Cohesion audit across 6 skills: 1 blocker (brainstorming artifact path), 6 divergences, 8 concerns
  - Fixed brainstorming artifact path: `.myflow/specs/` → `.myflow/artifacts/brainstorming/`
  - Standardized MyFlow-Note template across `brainstorming`, `discover`, `explore`
  - Added YAML frontmatter to `start/SKILL.md`
  - Added metadata sourcing to `brainstorming/SKILL.md`
  - Dropped git-commit requirement from brainstorming (artifacts stay worktree-local)
  - Verified telemetry checkpoint wired end-to-end (template → start → myflow → artifact)

- **Stage 1 `start` — Adaptive Alignment entry point** (2026-06-26, `73cc9f0`)
  - Added `skills/start/SKILL.md` with conversational progressive flow
  - Added `skills/start/templates/alignment.md` — alignment artifact template
  - Rewired Stage 1 docs in `myflow` and `README` to center `start`
  - Demoted old Stage 1 skills with MyFlow-Note redirects
  - Added telemetry checkpoint discipline and stage-boundary restart guidance
  - Risk-based escalation: ambiguous_intent, architecture_impact, external_dependency

## What's Next

- **Stage 4 validation/review refresh** — clarify validation, manual verification, code review, revise loops, and when each gate should run.
- **Stage 5 closeout refresh** — keep landing, documentation, changelog, retros, and learning capture useful without becoming a heavy ritual.
- **Canonical `resume` skill** — artifact-led continuation. Single `/skill:resume` command that reads `.myflow/artifacts/`, infers stage, and proposes next action. Replaces ad-hoc handoff-first recovery.
- **Telemetry checkpoint adoption across stages 3-5** — Stage 1 has the checkpoint pattern; Stage 2 has durable rationale; extend checkpoint discipline without implementing full package events.
- **Artifact taxonomy consolidation** — brainstorming moved to `.myflow/artifacts/brainstorming/`; remaining `.myflow/specs/` references and cross-skill artifact path standardization still needed.
- **Opportunistic MyFlow onboarding** — auto-detect when MyFlow is preferred but `.myflow/` is missing, offer to set up.
- **Per-repo MyFlow parameters** — first-class repo-specific config for artifact destinations, validation commands, stage contracts.
- **Repo-local processes plug into MyFlow stages** — discover and honor repo-specific skills, guidance, procedures at each stage.
- **DI pattern documentation** — document dependency-injection conventions in project guidance (predates Stage 1 work).
- **Testing philosophy: prefer DI over mocks** — codify in project guidance (predates Stage 1 work).
