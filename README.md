# MyFlow

MyFlow is an artifact-led, five-stage workflow package for [Pi](https://pi.dev) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It provides skills and optional extensions that help a developer and agent scope, plan, implement, verify, and close work without relying on conversation history.

## Install

### Local development checkout

From the MyFlow repository root, load the package for one Pi session:

```bash
pi -e .
```

To register this checkout as a global Pi package:

```bash
pi install "$(pwd)"
```

Restart Pi after installation. Pi discovers the package's skills and declared extensions from `package.json`.

### Claude Code

The skills live in `skills/` at the repository root. Clone the repository and start Claude Code in its root:

```bash
git clone https://github.com/don-smith/myflow.git
cd myflow
claude
```

Accept the workspace trust dialog, then run `/skills` to confirm MyFlow skills appear. A published [plugin manifest](https://docs.anthropic.com/en/docs/claude-code/plugins) is not part of this repository yet; until it lands, point Claude Code at this checkout.

Start a workstream:

```text
/scope "<rough idea>"
```

Follow the artifact's recommended next action. Active workstream artifacts remain local at `.myflow/workstreams/<workstream-id>/`.

**Skill invocation:** Claude Code invokes skills as `/name` (not `/skill:name`). For example:

```text
/scope       → Stage 1: scope the work
/plan        → Stage 2: produce an executable plan
/implement   → Stage 3: execute the plan
/validate    → Stage 4: verify the implementation
/close       → Stage 5: close out the workstream
```

**Limitations compared to Pi:**

- Subagent orchestration uses Claude Code's native agent tool (`@agent-name`) and `context: fork` frontmatter instead of Pi's `subagent({...})` API.
- Web search and fetch use Claude Code's built-in tools (no separate MCP server needed).

**Architecture:** `skills/` at the repository root is the single skill tree. There is no per-agent copy to keep in step.

### Git package

After publishing a reachable Git repository/tag, install a pinned revision:

```bash
pi install git:github.com/don-smith/myflow@<tag-or-commit>
```

Use `pi list` to inspect installed packages, `pi config` to enable or disable individual package resources, and `pi remove <source>` to unregister a package. Pi packages execute extensions and provide agent instructions, so install only sources you trust.

## First use in a repository

1. Start Pi in the target repository.
2. Run `/skill:onboard`. It uses the repository-map resolver to preserve a local map or create/refresh your personal global map from Git `origin` (with a safe no-origin fallback).
3. Start a workstream with `/skill:scope "<rough idea>"`.
4. Follow the artifact's recommended next action. Active workstream artifacts remain local, normally at `.myflow/workstreams/<workstream-id>/`

Scope can offer an isolated branch/worktree when repository policy permits, or work in the current checkout for trunk-based repositories.

## Workflow

```text
Onboard repository (when needed)
  → Scope → Plan → Implement → Verify → Close
```

| Stage | Canonical skill | Output |
|---|---|---|
| Onboarding | `onboard` | Repository map, discovery report, and evaluation record |
| Scope | `scope` | Alignment artifact, risk/depth decision, selected specialists |
| Plan | `plan` | Lightweight or full executable plan with a verification map |
| Implement | `implement` | Green phase commits, implementation checkpoint, and automatic Verify transition |
| Verify | `validate` | Validation report, linked review evidence, and manual-verification brief |
| Close | `close` | Evidence-gated documentation, delivery, learning, and closeout updates |

After the final green phase, the same parent session loads the installed Validate skill and executes it immediately. `/skill:validate` is recovery/rehydration guidance only, not a command the developer must remember to run. Validate loads and executes the sibling code-review skill with the exact implementation scope and accepted plan. Its fresh review lanes cover Correctness and Risk, Standards and Maintainability, and Spec Fidelity. Confirmed P0/P1 findings block; P2 does not block. Close inspects linked passing review evidence and matching provenance instead of trusting only a top-level validation pass.

`design` is a collaborative Plan step used for material structural decisions; it is not mandatory for lightweight work. `research`, `prototype`, `domain-modeling`, and `tdd` are selected only when the work needs them.

A fresh session runs `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`, then reads its selected map, `workstream.md`, and the authoritative stage artifact. Small work may use the lightweight path; structural work adds Design and a full plan. Verify owns review/manual evidence, and Close records only applicable delivery and follow-up decisions.

The detailed workflow and alignment status are maintained in:

- [Artifact and stage-boundary contract](docs/artifact-and-stage-boundary-contract.md)
- [Workflow status and alignment](docs/myflow-workflow-status-and-alignment.md)

## Package resources

The package declares one optional Pi extension alongside its skills: structured `ask_user_question` interaction. It is non-blocking — every skill that uses it falls back to plain text when the extension is absent.

Configuration lives under `~/.myflow/config/`.

Material this core no longer ships is preserved under `parked/`: the specialist skills, the subagent definitions, the telemetry extension, and the observation, evaluation, and publication tests. Nothing under `parked/` is packaged or tested.

## Validation

```bash
npm test
npm pack --dry-run
```

## License

MIT
