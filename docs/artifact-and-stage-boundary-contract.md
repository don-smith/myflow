# MyFlow artifact and stage-boundary contract

**Status:** Canonical workflow contract — retained skills are being aligned to it.

This contract defines the small, durable interface between MyFlow stages: **Scope → Plan → Implement → Verify → Close**. It keeps a fresh session able to continue a workstream without conversation history while permitting proportionate process for small work.

Repository policy always wins. Before a skill assumes an artifact location, command, documentation rule, or delivery policy, it resolves the repository map and follows the mapped authoritative source.

## Repository-map resolver

Use the shipped resolver from the Git root before reading or writing repository policy:

```text
node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>
```

It emits only JSON metadata (`found`, `source`, `mapPath`, and a normalized identity); it never reads map contents, prints the original remote URL, or sends telemetry. An explicit map override (`--map <path>`) is the exception path and wins over all normal discovery. Without an override, lookup order is: an existing repository-local `.myflow/repository-map.md`; an existing personal global map for normalized `origin` (`~/.myflow/repositories/<host>/<owner>/<repo>/repository-map.md`); then, only when `origin` is absent, an existing personal global map keyed by the SHA-256 of the absolute common Git directory at `~/.myflow/repositories/local/<sha256-common-git-dir>/repository-map.md`.

A missing result is explicit, not an invitation to invent policy. `onboard` uses `target` to obtain the preferred writable global target. A malformed origin and a non-Git directory return machine-readable diagnostics; do not fall back silently from a malformed origin. Existing repository-local maps remain supported and authoritative; no legacy map or flat artifact is bulk-migrated. Only personal maps and their onboarding records are global. Active workstream artifacts remain local to the current worktree.

## Principles

- A stage artifact is the authoritative record of that stage's outcome. A downstream stage consumes it; it does not replace its upstream decision record.
- The workflow records **outcomes before implementation details**. Scope defines acceptance criteria; Plan turns them into an executable verification map.
- `design` is an architectural decision gate, not necessarily a separate document. Every executable plan records a design disposition.
- A fresh session normally begins at a stage boundary. `create-handoff` is only for an interruption within a stage or implementation phase, and points to the authoritative artifact.
- The repository map governs artifact-root, tracking, and retention policy. The paths below are defaults when the map does not specify an alternative.

## Artifact locations

MyFlow separates repository-level knowledge from workstream evidence. A **workstream** is one bounded piece of work from Scope through Close. Establish its filesystem-safe **workstream ID** before writing its first durable artifact. A branch name may derive from that ID, but the ID exists equally for trunk-based development.

| Purpose | Default location | Durability |
|---|---|---|
| Repository map | Resolver-selected local `.myflow/repository-map.md` or personal global `~/.myflow/repositories/<identity>/repository-map.md` | Local policy wins; global policy is personal knowledge |
| Onboarding run / evaluation | Beside the selected global map: `onboarding/runs/`, `onboarding/evaluations/`; local maps follow mapped policy | Repository-level discovery history and feedback |
| Workstream manifest | `.myflow/workstreams/<workstream-id>/workstream.md` | Workstream index and current stage |
| Scope alignment | `.myflow/workstreams/<workstream-id>/scope/` | Workstream record |
| Specialist research | `.myflow/workstreams/<workstream-id>/research/` | Supporting evidence, when used |
| Standalone design | `.myflow/workstreams/<workstream-id>/design/` | Architectural decisions and slices, when needed |
| Executable plan | `.myflow/workstreams/<workstream-id>/plan/` | Implementation authority |
| Validation report | `.myflow/workstreams/<workstream-id>/verify/` | Verification evidence |
| Closeout summary, when needed | `.myflow/workstreams/<workstream-id>/close/` | Delivery and continuity record |
| Exceptional handoff | `.myflow/workstreams/<workstream-id>/handoffs/` | Temporary bookmark |

Use `<timestamp>_<topic-kebab>.md` for run-specific artifacts unless the repository map specifies another convention. Link related artifacts rather than copying their contents.

`workstream.md` is a compact index, not a second specification. It names the workstream ID, title, branch/worktree when used, current stage/status, authoritative current artifact, and related artifacts. A person or agent can inspect the directory to see the workstream's progress without mixing it with older work.

Onboarding remains outside a workstream because it may happen before an ID exists and its findings serve many later workstreams. If onboarding discovers a task, Scope establishes a new workstream for that task.

### Existing artifacts and retention

Existing flat `.myflow/artifacts/` directories are legacy layout. Do not bulk-move them: links, active sessions, or repository policy may still depend on their paths. New workstreams use the workstream layout. A repository may archive or purge completed workstreams only according to its mapped retention policy; the manifest makes that decision and any later migration auditable.

## Common artifact interface

A durable workstream artifact contains enough information for the next stage or a fresh session to act safely. Its exact headings may vary, but it must identify:

- **Workstream and stage** — a human-readable topic and current stage.
- **Status** — `in-progress`, `ready`, `blocked`, `complete`, or `superseded`, as applicable.
- **Completed work** — what the stage has established or changed.
- **Decisions** — including their source or evidence when material.
- **Open questions and blockers** — including the owner or next action when known.
- **Evidence and verification state** — observed evidence, checks run, manual checks pending, and explicit exclusions.
- **Relevant sources** — the repository map, upstream artifacts, key files, and external references actually relied on.
- **Next action** — the next stage or corrective loop, with an exact next-session command when one exists.
- **Rehydration information** — what a fresh session must read first and the current working set.

Where frontmatter is used, `kind`, `workstream`, `stage`, `status`, creation/update time, repository-map path, and upstream/related artifacts are the preferred common fields. Existing artifact-specific metadata may add to, rather than duplicate, these fields. The `workstream` value is the workstream ID, not necessarily the branch name.

`skills/myflow/templates/stage-context-checkpoint.md` provides the reusable checkpoint and rehydration sections. It is a template, not a requirement to copy irrelevant empty sections into a short artifact.

## Stage contracts

| Stage | Authoritative output | Required handoff content | Normal next action |
|---|---|---|---|
| Onboarding | Repository map; run report; pending evaluation | Confirmed sources, material unknowns, readiness, safe next action | Scope or a recommended specialist |
| Scope | Alignment artifact | Intent, audience/outcome, non-goals, observable acceptance criteria, risk/classification, constraints, and selected depth | Design disposition and Plan, optionally through selected specialists |
| Plan | Executable plan; standalone design only when justified | Design disposition, implementation phases, verification map, commit strategy, manual checks, and rehydration | Fresh session → Implement |
| Implement | Updated plan checkpoint or implementation summary; phase commits | Completed phases and commit hashes, checks/evidence, deviations, remaining manual verification, current working tree state | Verify |
| Verify | Validation report, code-review evidence, and manual-verification brief where needed | Verdict, criterion coverage, automated evidence, defects/deviations, and human checks still required | Close, or a corrective loop |
| Close | Repository-specific delivery/status/documentation updates and a closeout summary when needed | What shipped, closeout decisions, final commit/integration state, resolved tabled items, and follow-up destinations | End workstream or begin a new Scope |

### Scope acceptance criteria versus Plan verification

Scope acceptance criteria state the outcome that matters to users, operators, or maintainers. They must be observable, but normally do not name implementation files, test names, or commands.

Plan owns the verification map. It connects every applicable acceptance criterion to an observable behavior or seam, test level, test location or command, status, and any deliberate exclusion. This preserves intent while making implementation and verification executable.

### Design disposition

Every executable plan includes one of these dispositions:

- **Locked into existing architecture** — name the existing module/pattern to follow and explicitly state that interfaces, dependencies, data model, operational behavior, and patterns are unchanged.
- **Localized design** — record the relevant architectural choices directly in the plan, with evidence and consequences.
- **Structural design required** — link a standalone design artifact and any specialist artifacts. The plan consumes its settled decisions and slices.

An architecture specialist is selected when risk or uncertainty warrants it; a routine check that work follows an existing pattern is not a full architecture audit.

## Right-sized paths

| Path | When allowed | Durable record |
|---|---|---|
| Trivial, in-session | One small, reversible change; known validation; no new or changed interface, dependency, persistence/schema, security, integration, or operational behavior; and no expected interruption | Conversation agreement may serve as scope, design disposition, and plan. It is not resumable. If the work expands or pauses, create a lightweight plan before continuing. |
| Lightweight | Low-risk but worthwhile work, a workstream likely to outlive the current turn, or any change needing a clear implementation/verification authority | Alignment artifact when appropriate and a concise executable plan using the lightweight-plan template. A separate design artifact is optional. |
| Full | Meaningful uncertainty, multiple viable approaches, architectural/seam impact, new patterns or dependencies, multi-phase work, or significant external/operational risk | Alignment artifact → specialist evidence/design artifact as needed → full executable plan. |

The user and Scope decide the depth in situ. A stage may increase depth when evidence exposes risk; it must not silently lower it by discarding already-needed decisions or verification.

## Boundary and recovery rules

1. **Establish the workstream before durable Scope output.** Scope proposes the workstream ID from the topic and asks only when it cannot safely infer one. It records the chosen ID in `workstream.md`. When repository policy permits, Scope offers an isolated branch/worktree before finalizing the alignment artifact; otherwise it records the trunk/current-checkout path.
2. **Complete the producing stage first.** Mark its artifact `ready` only when its required decision/evidence is present. Mark it `blocked` when a material unresolved question prevents safe continuation.
3. **Rehydrate at the boundary.** A fresh session runs `resolve-repository-map.mjs discover`, reads its selected map when `found`, then reads `workstream.md`, the authoritative upstream artifact, linked specialist evidence needed for the next stage, and the current Git state.
4. **Use an implementation checkpoint between phases.** Each green plan phase is committed. The checkpoint records its commit hash, automated evidence, outstanding manual verification, and next phase.
5. **Use handoffs only mid-stage.** A handoff names the current stage and artifact, summarizes the live working set, and never becomes a competing specification.
6. **Route corrections to their owner.** An implementation defect returns to Implement; an unexecutable or incorrect plan returns to Plan; a changed architectural decision returns to Design; a changed outcome or acceptance criterion returns to Scope. Re-run downstream verification after correction.
7. **Do not close on unverified work.** Verify completes automated validation and code review, then presents required manual verification to the human before Close. Repository-specific policy may add gates.

## Lightweight plan template

For the lightweight durable path, use `skills/myflow/templates/lightweight-plan.md`. It intentionally combines only the necessary design decision and execution authority; it is not a reduced full-design artifact.

## Skill-alignment implications

This contract is the target for retained skills. The next alignment work should make each canonical stage orchestrator:

1. run `resolve-repository-map.mjs discover` and read its selected map before assuming local policy;
2. consume the stated upstream artifact and emit its stated output;
3. follow the common checkpoint/rehydration and correction-loop rules; and
4. remove references to retired skills, deleted scripts, and nonexistent mandatory gates.
