---
template_version: 3
date: {ISO timestamp with timezone}
repository: {repository identity}
branch: {branch}
head_commit: {current HEAD}
accepted_plan: {path or equivalent spec source}
scope_spec: {input passed to review-range.mjs}
scope_status: {ready | empty | invalid}
scope_strategy: {branch-all | first-parent | explicit-range | working-tree}
range_base: {exact base or n/a}
range_head: {exact head or n/a}
dirty_state: {clean | dirty}
changed_files_count: {N}
review_verdict: {pass | fail | blocked}
findings: {p0: N, p1: N, p2: N}
tags: [code-review, verify]
---

# Code review: {scope}

## Provenance and scope

- Accepted plan: `{path or equivalent spec source}`
- Scope status: `{ready | empty | invalid}`
- Range base: `{hash or n/a}`
- Range head: `{hash or n/a}`
- Dirty state: `{clean | dirty}`; {included or explicit exclusion}
- Adapter command: `node "${SKILL_DIR}/_helpers/review-range.mjs" "{scope spec}"`
- In-scope files ({N}):
  - `{path}`
- Exclusions: {none or reasoned list}

## Lane evidence

| Fresh-context lane | Status | Coverage and evidence |
|---|---|---|
| Correctness and Risk | {complete / blocked} | {callers, tests, failure paths; conditional security/dependency checks and triggers} |
| Standards and Maintainability | {complete / blocked} | {mapped standards or unavailable; maintainability evidence} |
| Spec Fidelity | {complete / blocked} | {accepted-plan criteria and exclusions checked} |

## Retained findings

Repeat this block for each retained finding; write `None` when there are no findings. For an omission, the accepted plan or spec `path:line`, verbatim quote, and nearest expected implementation seam are mandatory. Changed-code evidence is required only when related code exists.

### {stable ID}: {P0 | P1 | P2}: {headline}

- **Evidence kind:** {implementation defect | omission}
- **Accepted plan/spec file:line:** `{path:line, required for omission}`
- **Spec quote:** `{verbatim accepted-plan/spec text, required for omission}`
- **Nearest expected implementation seam:** `{path:line or path, required for omission}`
- **Changed file:line:** `{path:line, required when related code exists}`
- **Changed-code quote:** `{verbatim changed code, required when related code exists}`
- **Failure mechanism:** {how the defect or omission occurs}
- **Affected behavior or requirement:** {observable impact or accepted-plan citation}
- **Smallest fix:** {minimal corrective action}
- **Source lane:** {Correctness and Risk | Standards and Maintainability | Spec Fidelity}

## Finding verification

| Stable ID (P0/P1) | Result | Independent evidence from code and callers |
|---|---|---|
| `{ID}` | {confirmed / falsified / inconclusive} | {evidence} |

Falsified claims are dropped from retained findings. Inconclusive P0/P1 claims block the review.

## Review verdict

**Review verdict:** `{pass | fail | blocked}`

- Confirmed P0: {N}
- Confirmed P1: {N}
- Retained P2: {N}; does not block
- Missing mandatory evidence: {none or list}
- Gate basis: {confirmed P0/P1 fail; missing mandatory evidence blocks; otherwise pass}
- Validation report link: `{path to report, or pending path for Validate to fill}`
