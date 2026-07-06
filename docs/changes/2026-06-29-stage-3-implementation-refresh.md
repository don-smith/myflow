# Stage 3 Implementation Refresh

**Date:** 2026-06-29  
**Status:** Designed for implementation  
**Branch:** `feature/stage3-refresh`

## Summary

Stage 3 now has one executor: `implement`. TDD, implementation subagents, parallel dispatch, and verification-before-completion are tactics inside `implement`, not alternate entry points. The obsolete workflow runtime and its command path are removed, along with workflow-only contracts and workflow-derived model override scopes.

## What changed

- `implement` is the sole Stage 3 execution owner.
- Stage 3 input is the Stage 2 plan; Stage 3 output is working-tree changes plus updated plan progress/status.
- Commits remain in Stage 5 `land`, after Stage 4 validation/review.
- Each implemented phase updates the plan with automated checkboxes plus a compact `Implementation Status` note for restartability.
- A scoped `implementation-coder` agent replaces the old standalone subagent executor path for implementation delegation.
- The workflow runtime package, root extension registration, built-in workflow definitions, workflow sibling registration, workflow contract harvesting, and workflow outcome/collector support are removed.
- Model overrides are simplified to defaults, agents, and skills; workflow stage/preset override scopes are removed.
- Active skill frontmatter no longer carries workflow-only `contract:` metadata.
- Public docs and PR triage guidance route review work through explicit MyFlow skills instead of workflow command routing.

## Why

Stage 1 and Stage 2 were already refreshed around artifact-led handoffs and one clear stage entry point where possible. Stage 3 still had competing execution stories: direct `implement`, a separate subagent-driven plan executor, plus a hands-off workflow runner that no longer matched the desired MyFlow operating model. Removing those alternate paths makes Stage 3 easier to resume, verify, and teach.

## Intended Stage 3 flow

```text
/skill:implement .myflow/artifacts/plans/<plan>.md [Phase N]

Inside implement:
- read the plan and in-scope phase
- use TDD for behavior changes
- optionally dispatch scoped implementation-coder agents
- inspect subagent diffs directly
- run phase success criteria
- check off automated criteria only after fresh evidence
- update the phase Implementation Status note for restartability
- hand off to /skill:validate <plan>
```

## Verification

- `test ! -d skills/subagent-driven-development`
- `test ! -d packages/workflow`
- `! rg -n "^contract:" skills -g 'SKILL.md'`
- `! rg -n "(/wf|@myflow/workflow|packages/workflow|registerBuiltInWorkflows|registerSkillContractsSource|workflow/extension|subagent-driven-development)" package.json extensions skills README.md docs --glob '!docs/changes/**' --glob '!*.test.ts'`
- `! rg -n "SCOPE_STAGES|SCOPE_PRESETS|loadWorkflowMap|resolveStageModel|registerModelOverrideLifecycle|isWorkflowBaselineCaptured" extensions/core --glob '!*.md'`
- `! rg -n "\b(presets|stages)\b" extensions/core/models-config.ts extensions/core/models-config-validate.ts extensions/core/model-override.ts extensions/core/myflow-models --glob '!*.test.ts'`
- `! rg -n "@myflow/workflow|packages/workflow" bun.lock`
- `bun test extensions/core/siblings.test.ts extensions/core/package-checks.test.ts extensions/core/models-config.test.ts extensions/core/models-config-validate.test.ts extensions/core/myflow-models-command.test.ts extensions/core/myflow-models/units.test.ts extensions/core/skill-bracket.test.ts extensions/core/model-override.test.ts`

## Follow-ups

- Stage 4 validation/review refresh remains next.
- A future canonical resume skill can build on artifact-led stage boundaries.
- No replacement workflow runner is planned in this change.
