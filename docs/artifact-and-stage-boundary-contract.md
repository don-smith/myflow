# MyFlow artifact and stage-boundary contract

**Status:** Canonical workflow contract — retained skills are being aligned to it.

This contract defines the small, durable interface between MyFlow stages: **Scope → Plan → Implement → Verify → Close**. It keeps a fresh session able to continue a workstream without conversation history while permitting proportionate process for small work.

Repository policy always wins. Before a skill assumes an artifact location, command, documentation rule, or delivery policy, it resolves the repository map and follows the mapped authoritative source.

## Repository-map resolver

Use the shipped resolver from the Git root before reading or writing repository policy:

```text
node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>
```

It emits only JSON metadata (`found`, `source`, `mapPath`, a normalized identity, and for `discover` the artifact store fields `workstreamRoot`, `storeMode`, and `storeFallback`); it never reads map contents, prints the original remote URL, or sends telemetry. An explicit map override (`--map <path>`) is the exception path and wins over all normal discovery. Without an override, lookup order is: an existing repository-local `.myflow/repository-map.md`; an existing personal global map for normalized `origin` (`<MYFLOW_HOME>/repositories/<host>/<owner>/<repo>/repository-map.md`, where `MYFLOW_HOME` defaults to `~/.myflow`); then, only when `origin` is absent, an existing personal global map keyed by the SHA-256 of the absolute common Git directory at `<MYFLOW_HOME>/repositories/local/<sha256-common-git-dir>/repository-map.md`. Personal observation state uses the resolver's preferred global `target` identity even when a repository-local map takes policy precedence.

A missing result is explicit, not an invitation to invent policy. `onboard` uses `target` to obtain the preferred writable global target. A malformed origin and a non-Git directory return machine-readable diagnostics; do not fall back silently from a malformed origin. Existing repository-local maps remain supported and authoritative; no legacy map or flat artifact is bulk-migrated. Personal maps, onboarding records, and private observations are global. Workstream artifacts live in the resolved workstream root described under [Artifact store](#artifact-store).

## Principles

- A stage artifact is the authoritative record of that stage's outcome. A downstream stage consumes it; it does not replace its upstream decision record.
- The workflow records **outcomes before implementation details**. Scope defines acceptance criteria; Plan turns them into an executable verification map.
- `design` is an architectural decision gate, not necessarily a separate document. Every executable plan records a design disposition.
- A fresh session normally begins at a stage boundary. `handoff` is only for an interruption within a stage or implementation phase, and points to the authoritative artifact.
- The repository map governs artifact-root, tracking, and retention policy. The paths below are defaults when the map does not specify an alternative.

## Artifact locations

MyFlow separates repository-level knowledge from workstream evidence. A **workstream** is one bounded piece of work from Scope through Close. Establish its filesystem-safe **workstream ID** before writing its first durable artifact. A branch name may derive from that ID, but the ID exists equally for trunk-based development.

| Purpose | Default location | Durability |
|---|---|---|
| Repository map | Resolver-selected local `.myflow/repository-map.md` or personal global `~/.myflow/repositories/<identity>/repository-map.md` | Local policy wins; global policy is personal knowledge |
| Onboarding run / evaluation | Beside the selected global map: `onboarding/runs/`, `onboarding/evaluations/`; local maps follow mapped policy | Repository-level discovery history and feedback |
| Observation state and reports | Preferred personal global repository target: `<MYFLOW_HOME>/repositories/<identity>/observations/<workstream-id>/` | Private third-party evidence and curated flow reports; never written to the target worktree |
| Workstream manifest | `<workstream-root>/<workstream-id>/workstream.md` | Workstream index and current-state projection |
| Authoritative lifecycle journal | `<workstream-root>/<workstream-id>/lifecycle/events.jsonl` | Append-only workflow transitions, attempts, and correction episodes |
| Stage feedback | `<workstream-root>/<workstream-id>/feedback/events.jsonl` | Private stage ratings and notes; synced with the workstream, never written to the journal |
| Scope alignment | `<workstream-root>/<workstream-id>/scope/` | Workstream record |
| Specialist research | `<workstream-root>/<workstream-id>/research/` | Supporting evidence, when used |
| Standalone design | `<workstream-root>/<workstream-id>/design/` | Architectural decisions and slices, when needed |
| Executable plan | `<workstream-root>/<workstream-id>/plan/` | Implementation authority |
| Validation report | `<workstream-root>/<workstream-id>/verify/` | Verification evidence |
| Closeout summary, when needed | `<workstream-root>/<workstream-id>/close/` | Delivery and continuity record |
| Exceptional handoff | `<workstream-root>/<workstream-id>/handoffs/` | Temporary bookmark |

`<workstream-root>` is the resolver's `workstreamRoot`. Paths inside a workstream's artifacts are relative to its workstream directory, so they stay valid in either store mode.

### Artifact store

Artifact location and backup are each developer's choice, stored in `<MYFLOW_HOME>/config/myflow.json` under `artifacts.location` (`home` or `checkout`) and `artifacts.remote` (a Git URL the developer owns, or `none`). MyFlow never names a particular artifact repository.

| Store mode | `workstreamRoot` | Notes |
|---|---|---|
| `home` | `<MYFLOW_HOME>/repositories/<identity>/workstreams` | The MyFlow home is a Git repository, with or without a remote. A main checkout and its worktrees share one identity, so they share one root, and removing a worktree loses nothing. |
| `checkout` | `<git-root>/.myflow/workstreams` | Each workstream is `.myflow/workstreams/<workstream-id>/` in the current worktree. MyFlow writes `.myflow/workstreams/.gitignore` containing `*`, so artifacts never enter the product repository and a committed `.myflow/repository-map.md` stays visible. |

Without configuration, the location follows the running install: scripts invoked from inside the current Git repository select `checkout`, and scripts installed anywhere else select `home` with no remote. The invoked path is judged before symlinks are resolved. When the configured home is not writable, for example in a sandboxed agent, the resolver falls back to `checkout` and reports `storeFallback: true`; run `myflow artifacts import` later from an environment that can write the store.

Only allowlisted paths are ever committed to the home store: per repository `repository-map.md`, `onboarding/`, `workstreams/`, and `legacy-artifacts/`. `config/` and raw `observations/` stay on the machine. The store's `.gitignore` and the sync command both enforce this.

| Command | Behaviour |
|---|---|
| `myflow artifacts init [--location home\|checkout] [--remote <url>\|--no-remote]` | Writes the configuration. For `home`, creates or adopts the store, archiving a foreign `.git` to `<MYFLOW_HOME>-safety-net-git-<date>.tgz`, restores remote content, and commits (and pushes) the allowlisted content. Warns when a GitHub remote is public. |
| `myflow artifacts sync --workstream <id>` \| `--all` \| `--path <store-path>` | Builds a commit in a private temporary index on the remote head from one workstream (or each local workstream, or explicit allowlisted paths), including deletions, then pushes with retry. Never touches the store's working directory or other workstreams. Without a remote it commits locally; in `checkout` mode it does nothing. Warns when the remote changed the same workstream since this machine's last sync (last push wins). |
| `myflow artifacts import [--workstream <id>]` | Moves checkout workstreams into the home store and removes each checkout copy only after its commit, and push when a remote exists, succeed. |
| `myflow artifacts pull` | Restores remote files missing locally. Never overwrites or deletes a local file. |
| `myflow artifacts status` | Reports the store mode, unsynced workstreams, and checkout workstreams that still need `import`. |

Run these as `myflow artifacts <command>` after installing the package, or `node skills/myflow/scripts/cli.mjs artifacts <command>` from a MyFlow checkout. Every command accepts `--cwd <directory>` and prints one JSON object. Keep any artifact remote private.

Use `<timestamp>_<topic-kebab>.md` for run-specific artifacts unless the repository map specifies another convention. Link related artifacts rather than copying their contents.

`workstream.md` is a compact index, not a second specification. It names the workstream ID, title, branch/worktree when used, current stage/status, authoritative current artifact, and related artifacts. A person or agent can inspect the directory to see the workstream's progress without mixing it with older work.

A manifest may also record optional `flow_item_type` as `feature`, `defect`, `debt`, `risk`, or `unknown`. Scope uses only an explicit classification and preserves `unknown` when none is available. Flow Item type classifies value-stream work for repository Distribution. It is separate from implementation risk, which records delivery uncertainty and controls workflow depth.

Onboarding remains outside a workstream because it may happen before an ID exists and its findings serve many later workstreams. If onboarding discovers a task, Scope establishes a new workstream for that task.

### Lifecycle journal

The authoritative lifecycle journal uses `myflow-lifecycle/v1`. `workstream.md` is its current-state projection, while stage artifacts remain authoritative for decisions and detailed evidence. Lifecycle writes do not depend on Pi or Langfuse.

Every workstream mutation goes through `skills/myflow/scripts/lifecycle-journal.mjs`. Skills pass semantic arguments to a mutation subcommand. They must not assemble or edit event JSON. The writer resolves canonical repository identity, validates the transition and any artifact reference relative to the repository root or, by default, the workstream directory, calculates artifact digests and stable IDs, links the prior event, acquires an append lock, and returns a receipt. An idempotent retry returns the original receipt. A retry that changes historical content fails. The writer removes an incomplete crash tail before a new append, but rejects malformed complete records and broken event chains.

The journal records five canonical stages: `Scope`, `Plan`, `Implement`, `Verify`, and `Close`. Supporting activity names are `scope`, `research`, `prototype`, `design`, `planning`, `phase`, `verification`, `review`, `closeout`, and `other`. A canonical stage attempt starts at `stage.entered`, has a stable stage-local ordinal, and ends with `advanced`, `superseded`, `abandoned`, or `workstream-closed`. Supporting activities, blocks, session changes, and same-stage revisions do not create another canonical stage attempt. Overlapping open attempts are illegal.

A correction episode starts with `return.opened`. The event records the detecting stage and activity, canonical owner, origin attempt, trigger source, change kind, and evidence references. The owner follows the correction contract. A later `return.rerouted` preserves the same episode. The episode cannot close until the owner is ready, downstream work has resumed from the owning stage, and passing re-verification has been recorded. Accepted artifacts and completed attempts stay immutable when later evidence causes a return.

The reducer reports three separate counters:

- `returnEpisodeCount` counts causal correction episodes.
- `stageReturnCount` counts backward edges between canonical stages, including reroutes.
- `activityReturnCount` counts same-stage backward edges, such as planning returning to design.

An event's `source` is the free-form name of the skill that recorded it, so it is not validated against the current skill set. Journals written before the Verify skill was renamed record `source: "validate"`, and they stay valid and readable. Do not rewrite them.

The journal path defaults to `<workstream-root>/<workstream-id>/lifecycle/events.jsonl`; `--journal <path>` overrides it. Use `node skills/myflow/scripts/lifecycle-journal.mjs validate --workstream-id <id> --repository-root <git-root>` to validate a journal and inspect its reduced state. Validation detects schema errors, illegal transitions, broken links, and incomplete crash tails without mutating the journal.

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
| Implement | Updated plan checkpoint or implementation summary; phase commits | Completed phases and commit hashes, checks/evidence, deviations, remaining manual verification, current working tree state; the same parent session immediately loads Verify (`/skill:verify` is recovery/rehydration only) | Verify |
| Verify | Validation report, linked review artifact, and manual-verification brief where needed | Verdict, criterion coverage, automated evidence, exact implementation scope, accepted-plan provenance, defects/deviations, and human checks still required | Close, or a corrective loop |
| Close | Repository-specific delivery/status/documentation updates and a closeout summary when needed | Linked passing review evidence, what shipped, closeout decisions, final commit/integration state, resolved tabled items, and follow-up destinations | End workstream or begin a new Scope |

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
2. **Record the lifecycle mutation.** Append each actual state change through `lifecycle-journal.mjs`, keep the receipt, and update `workstream.md` as the current-state projection. Never rewrite earlier events or accepted artifacts.
3. **Complete the producing stage first.** Mark its artifact `ready` only when its required decision/evidence is present. Mark it `blocked` when a material unresolved question prevents safe continuation.
4. **Rehydrate at the boundary.** A fresh session runs `resolve-repository-map.mjs discover`, reads its selected map when `found`, then reads `workstream.md`, the authoritative upstream artifact, linked specialist evidence needed for the next stage, and the current Git state.
5. **Use an implementation checkpoint between phases.** Each green plan phase is committed. The checkpoint records its commit hash, automated evidence, outstanding manual verification, and next phase.
6. **Use handoffs only mid-stage.** A handoff names the current stage and artifact, summarizes the live working set, and never becomes a competing specification.
7. **Route corrections to their owner.** An implementation defect returns to Implement; an unexecutable or incorrect plan returns to Plan; a changed architectural decision returns to Design; a changed outcome or acceptance criterion returns to Scope. When failed Verify returns an implementation defect after all original phases are complete, create one bounded corrective phase from the linked findings. A fresh-context implementation subagent owns the corrective phase. The parent delegates it fresh; after the corrective phase is green, commit it, update the plan and workstream checkpoints, and immediately rerun complete Verify. Keep one correction episode across any owner reroute. Record owner readiness and downstream resumption, then re-run downstream verification before closure.
8. **Enter Verify without a user gate.** After the final green phase, the same parent session reads the installed `verify` skill and executes it immediately. `/skill:verify` is recovery/rehydration guidance only.
9. **Do not close on unverified work.** Verify completes automated validation and fresh Correctness and Risk, Standards and Maintainability, and Spec Fidelity review lanes, then writes a separate artifact with plan/scope provenance. Confirmed P0/P1 findings block; P2 does not block. Close inspects linked passing review evidence rather than trusting the validation report's top-level verdict. Repository-specific policy may add gates.

## Lightweight plan template

For the lightweight durable path, use `skills/myflow/templates/lightweight-plan.md`. It intentionally combines only the necessary design decision and execution authority; it is not a reduced full-design artifact.

## Skill-alignment implications

This contract is the target for retained skills. The next alignment work should make each canonical stage orchestrator:

1. run `resolve-repository-map.mjs discover` and read its selected map before assuming local policy;
2. consume the stated upstream artifact and emit its stated output;
3. follow the common checkpoint/rehydration and correction-loop rules; and
4. remove references to retired skills, deleted scripts, and nonexistent mandatory gates.
