---
name: implement
description: Use when executing an accepted MyFlow implementation plan phase by phase in a fresh or resumed implementation session.
argument-hint: "<accepted-plan-path>"
disable-model-invocation: true
---

# Implement

Execute only an accepted plan. Work autonomously through every phase unless evidence exposes a defect that belongs to Scope, Design, or Plan.

## Rehydrate

1. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`; read the selected map when found.
2. Read the accepted plan, `workstream.md`, linked design/specialist evidence, and `git status --short`.
3. Confirm the plan is `ready`, identify the first incomplete phase, and record the resolver-selected map path in the implementation checkpoint.

## Per-phase loop

1. Follow the phase's test-first seam and make only its changes. Invoke `tdd` only for an uncovered behavior or design gap.
2. Run every phase automated criterion and required repository check. Keep manual verification visible, but do not block a green phase commit on it.
3. If green, create one atomic phase commit via `commit`; stage only phase files.
4. Update the accepted plan's checkpoint or a shared workstream checkpoint with: phase outcome, commit hash, automated evidence, deviations, outstanding manual verification, current Git state, resolved map path, and next phase/Verify action.
5. If implementation is defective, fix it in Implement. If the plan is unexecutable/incorrect, return to Plan; if architecture or outcome changed, return to Design or Scope. Do not conceal a correction as a completed phase.

## Handoff to Verify

After the final green phase commit, update `workstream.md` to make the accepted plan and implementation checkpoint the authoritative Verify input. Start Verify with:

```text
/skill:validate <accepted-plan-path>
```

Verify writes its report under `<workstream-root>/workstreams/<workstream-id>/verify/` when the mapped workstream root is not already the repository root (normally `.myflow/workstreams/<workstream-id>/verify/`). It owns validation, review evidence, and the conditional manual-verification brief. Do not create the final closeout commit in Implement.

## Guardrails

- Do not start from a flat legacy artifact path or an absent helper script.
- Do not invoke `code-review` as an implementation gate; Verify owns it.
- Do not stop after a green phase: continue to the next incomplete phase or Verify.
- Do not expand scope without returning the decision to its owning stage.
