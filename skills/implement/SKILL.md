---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the accepted plan phase by phase.

Follow the plan's verification map and test-first slices at the pre-agreed seams. TDD is primarily a Plan/design activity; invoke `/tdd` during implementation only when the plan leaves a behavior or seam unresolved or implementation exposes a design problem.

For every completed plan phase (the corresponding design slice), run its automated success criteria and required project checks. When they are green, invoke `/skill:commit` immediately to create one atomic phase commit containing only that phase's changes. The accepted plan pre-authorizes this commit: do not leave a green phase uncommitted. Keep any outstanding manual-verification criteria visible for Stage 4; they do not require reopening the completed phase.

Run typechecking regularly, single test files regularly, and the full test suite once at the end. After the final phase commit, hand the plan and working tree to `/skill:validate`; `code-review` belongs in Stage 4. Do not make the final closeout commit here—Close commits documentation, status, and other closeout changes after they are complete.
