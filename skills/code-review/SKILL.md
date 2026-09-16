---
name: code-review
description: Use when reviewing a branch, commit range, pull request, or work-in-progress change against its specification and repository standards.
---

# Code review

Produce a bounded, independent review with an auditable gate.

## Pin the scope

Run the installed `../myflow/scripts/resolve-repository-map.mjs` resolver and read mapped instructions. Require a scope spec and accepted plan or equivalent specification; Validate supplies its exact implementation scope (`base..head`, or `empty-tree..head` when implementation starts at the root commit) and accepted plan.

Execute the active adapter and retain its full output:

```bash
node "${SKILL_DIR}/_helpers/review-range.mjs" "<scope-spec>"
```

Record scope status, strategy, base, tip, range, dirty state, changed-files count, and every changed file. Read the generated `patch_path` and give every reviewer that same patch evidence with the complete manifest, range, plan, and mapped sources. The `all` patch preserves committed, cached, unstaged, and untracked layers separately so opposing index and worktree changes remain visible. `scope_status: invalid` or `empty`, a truncated manifest, unreadable patch evidence, unresolved revision, or mismatch with Validate's base/head makes review **blocked**. Dirty state outside an explicit range is an exclusion. A missing plan/equivalent spec blocks Spec Fidelity. Documented standards may be unavailable; still apply maintainability judgment.

## Run three independent lanes

Launch exactly three required fresh-context reviewers in parallel:

- **Correctness and Risk:** trace behavior through callers, tests, boundaries, regressions, and failure paths. Add security checks when trust, auth, permissions, secrets, input, or sensitive data change. Add dependency checks when manifests, locks, imports, versions, or external APIs change.
- **Standards and Maintainability:** apply mapped rules, then inspect clarity, duplication, coupling, needless generality, tests, and maintainability. Repository rules override generic heuristics.
- **Spec Fidelity:** compare every acceptance criterion, every phase outcome, and every exclusion, plus each requested behavior in the accepted plan, with the implementation; identify omissions, wrong behavior, and scope creep.

Each lane must return its own evidence from the supplied scope. Record the run ID and agent identity actually used for each fresh review lane. Use locally available agents; no model matrix is required. Do not accept a pass verdict, checklist, or unsupported assurance as lane evidence. If fresh subagent capability is unavailable, a lane fails to return, or any lane misses part of the manifest, block rather than silently pass.

## Normalize and verify

Retain only actionable findings. Assign a stable ID (`CR-001`, `SM-001`, or `SF-001`) and severity:

- **P0:** exploitable security/safety failure, irreversible data loss/corruption, or broad outage.
- **P1:** incorrect behavior, regression, unmet requirement, or material operational/maintenance failure.
- **P2:** bounded improvement without demonstrated incorrect behavior; P2 does not block.

Every retained finding needs its stable ID, P0/P1/P2, failure mechanism, affected behavior or requirement, smallest fix, and source lane. For an implementation defect, cite changed `file:line` plus a verbatim quote. For an omission, cite the accepted plan or spec `path:line` with a verbatim quote and the nearest expected implementation seam. Changed-code evidence is required only when related code exists.

Send provisional P0/P1 claims to a separate fresh-context verifier for independent verification. Record the run ID and agent identity actually used for independent P0/P1 verification. It inspects the cited code and callers, establishes the mechanism, and returns `confirmed`, `falsified`, or `inconclusive` with evidence. Drop falsified claims, retain confirmed claims, and block on inconclusive P0/P1 or unavailable verification. Do not change severity merely to alter the gate.

## Gate and persist

- confirmed P0/P1 → **fail**;
- missing mandatory evidence, incomplete scope, required fresh review unavailable, or inconclusive verification → **blocked**;
- otherwise → **pass**; retained P2 findings do not block.

Write `templates/review.md` under the workstream `verify/` directory. Include plan provenance, scope, lane evidence, retained findings, P0/P1 verification, exclusions, and review verdict. The validation report must link this durable artifact and copy its range and verdict; a prose summary is not a substitute.
