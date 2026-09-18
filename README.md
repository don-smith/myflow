# MyFlow

MyFlow is an artifact-led development workflow packaged as a set of agent skills. It carries work through five stages, **Scope → Plan → Implement → Verify → Close**, and writes a durable artifact at each one, so a fresh session can pick the work up without conversation history.

One skill tree serves every agent. There is no per-agent copy to keep in step.

## Install

Pick the section for your agent, then read [First use in a repository](#first-use-in-a-repository).

Every command below is taken from that host's own documentation. Only the Claude Code manifests are machine-checked so far (`claude plugin validate .`); the rest are being confirmed host by host, and this file records what each one actually does once it is.

### Claude Code

```text
/plugin marketplace add don-smith/myflow
/plugin install myflow@myflow
```

MyFlow keeps your workstream artifacts outside the repository by default, under `~/.myflow`. Claude Code will not read or write there unless you say so, so add it once in `~/.claude/settings.json`:

```json
{
  "permissions": {
    "additionalDirectories": ["~/.myflow"]
  }
}
```

Skills then appear as `/myflow:scope`, `/myflow:plan`, and so on.

### Codex

```bash
codex plugin marketplace add don-smith/myflow
```

Then install MyFlow from `/plugins` in the Codex CLI, or from the Plugins tab in the ChatGPT desktop app. The repository ships both the portable Agent Plugins manifest (`plugin.json`) and the marketplace catalog Codex reads (`.agents/plugins/marketplace.json`). Skills are invoked as `$scope`, `$plan`, and so on.

Codex's `workspace-write` sandbox blocks writes outside the workspace and blocks the network. MyFlow notices, falls back to storing artifacts in the checkout, and says so. That still works, but nothing reaches your artifact remote. To let it use the store directly, allow your MyFlow home and the network in `~/.codex/config.toml`:

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
writable_roots = ["/absolute/path/to/your/home/.myflow"]
network_access = true
```

Without that, nothing is lost: run `myflow artifacts import` later from a session that can write the store.

### Cursor

Cursor does not import skills on their own. Import `don-smith/myflow` in **Customize** with **From GitHub Repository**, then install the plugin. Skills are invoked as `/scope`, `/plan`, and so on.

Cursor reads its own `.cursor-plugin/marketplace.json`, which this repository does not ship yet. Until it does, copy the skills you want into `.cursor/skills/` in your project.

### Pi

```bash
pi install git:github.com/don-smith/myflow
```

Restart Pi afterwards. Pi reads the skills and the optional extension from `package.json`.

The package declares one optional Pi extension: a structured question tool the model uses instead of guessing. It is non-blocking: every skill that uses it falls back to a plain-text question when the extension is absent. Use `pi config` to enable or disable it, `pi list` to inspect installed packages, and `pi remove <source>` to unregister. Pi packages execute extensions, so install only sources you trust.

To load a local checkout for one session instead, run `pi -e .` from the repository root.

### Kilo Code and OpenCode

Neither ships its own skill installer. Both read a plain `skills/` tree, so the community `skills` CLI works:

```bash
npx skills add don-smith/myflow
```

That CLI is third party. To avoid it, copy the skill directories by hand instead: into `.kilo/skills/` or `~/.kilo/skills/` for Kilo Code, or into `~/.config/opencode/skills/` or the project's `.opencode/skills/` for OpenCode. Both also read `.agents/skills/`, so one copy there serves them together.

Kilo Code invokes a skill by name; OpenCode uses `/scope`.

## First use in a repository

1. Start your agent in the target repository.
2. Run the `onboard` skill. It resolves or creates the repository map, then asks where your workstream artifacts should live.
3. Start work with the `scope` skill and a rough idea.
4. Follow each artifact's recommended next action.

Scope can offer an isolated branch or worktree where repository policy permits, or stay in the current checkout for trunk-based repositories.

## Where artifacts live

Workstream artifacts are evidence about your work, not product source, so MyFlow keeps them out of the product repository by default. Where they go is your configuration, held in `~/.myflow/config/myflow.json`. There are three shapes:

| Configuration | Artifacts live in | Use it when |
|---|---|---|
| Home, no remote | `~/.myflow/repositories/<host>/<owner>/<repo>/workstreams/` | You work on one machine and want artifacts to survive worktree removal. |
| Home, with a private remote | the same directory, pushed to a Git repository you own | You work on more than one machine, or you want a backup. |
| Checkout | `<repo>/.myflow/workstreams/`, ignored by Git | Your agent is sandboxed away from your home directory, or you want artifacts beside the code. |

`onboard` asks two questions and then runs the right command for you. To set it up by hand:

```bash
myflow artifacts init --location home --remote git@github.com:<you>/myflow-artifacts.git
myflow artifacts init --location home --no-remote
myflow artifacts init --location checkout
```

The remote is a Git repository you create and own. **Keep it private.** Artifacts quote code and record decisions. MyFlow warns when it can tell a remote is public, and it names no particular repository anywhere.

Only workstreams, repository maps, and onboarding records are ever pushed. Your configuration, credentials, and private stage feedback stay on the machine, enforced by both the store's `.gitignore` and the sync command.

| Command | What it does |
|---|---|
| `myflow artifacts status` | Reports the store mode, what has not synced, and what still needs importing. |
| `myflow artifacts sync --workstream <id>` | Pushes one workstream. Stages do this for you at every boundary. |
| `myflow artifacts import` | Moves checkout artifacts into the home store, deleting the local copy only after a verified push. |
| `myflow artifacts pull` | Restores remote files missing locally. Never overwrites a local file. |

Run them as `myflow artifacts <command>` after installing, or `node skills/myflow/scripts/cli.mjs artifacts <command>` from a checkout. Every command prints one JSON object.

## Workflow

```text
Onboard repository (when needed)
  → Scope → Plan → Implement → Verify → Close
```

| Stage | Skill | Output |
|---|---|---|
| Onboarding | `onboard` | Repository map, discovery report, and evaluation record |
| Scope | `scope` | Alignment artifact, risk and depth decision, selected specialists |
| Plan | `plan` | Lightweight or full executable plan with a verification map |
| Implement | `implement` | Green phase commits and an implementation checkpoint |
| Verify | `verify` | Validation report, linked review evidence, and a manual-verification brief |
| Close | `close` | Evidence-gated documentation, delivery, learning, and closeout |

After the final green phase, the same parent session loads the installed `verify` skill and executes it immediately. Invoking `verify` by hand is recovery/rehydration guidance only, not a command the developer has to remember. Verify loads and executes the sibling `code-review` skill with the exact implementation scope and accepted plan. Its fresh review lanes cover Correctness and Risk, Standards and Maintainability, and Spec Fidelity. Confirmed P0/P1 findings block; P2 does not block. Close inspects linked passing review evidence and matching provenance instead of trusting only a top-level validation pass.

`design` is a collaborative Plan step for material structural decisions; it is not mandatory for lightweight work. `research`, `prototype`, `domain-modeling`, `discover`, and `tdd` are selected only when the work needs them.

A fresh session runs `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`, reads the map it selects, then reads `workstream.md` and the authoritative stage artifact. Small work uses the lightweight path; structural work adds Design and a full plan.

Every stage edge (entered, accepted, how it went, completed) is recorded by one command, `stage-boundary.mjs`, which also syncs. Both the one-question stage pulse and the sync are non-blocking: a declined answer or an unreachable remote is reported and never stops the work.

The normative details live in:

- [Artifact and stage-boundary contract](docs/artifact-and-stage-boundary-contract.md)
- [Workflow status and alignment](docs/myflow-workflow-status-and-alignment.md)

### Invoking a skill

MyFlow writes a next action as "the `plan` skill with `<path>`", because each agent spells the invocation differently:

| Agent | Invocation |
|---|---|
| Claude Code | `/myflow:<skill>` |
| Codex | `$<skill>` |
| Cursor, OpenCode | `/<skill>` |
| Pi | `/skill:<skill>` |
| Kilo Code | name the skill |

### Skills only you start

`implement` and `close` change the repository and end the workstream, so they are yours to start, not the model's. There is no portable way to say so, because the Agent Skills specification has no such field, so the package ships each host's own mechanism:

| Host | Mechanism | What it gives you |
|---|---|---|
| Claude Code | `disable-model-invocation: true` in the skill's frontmatter | The description never enters the model's context, so the skill cannot be discovered or implicitly invoked. |
| Cursor | the same frontmatter key | The skill is included only when you type `/implement` or `/close`. |
| Pi | the same frontmatter key | The skill is hidden from the system prompt; you invoke it by name. |
| Codex | `agents/openai.yaml` with `policy.allow_implicit_invocation: false` | Codex will not invoke the skill from a prompt; `$implement` still works. |
| Kilo Code | none | Their documented frontmatter has no invocation-control field. The skill's description is the only signal. |
| OpenCode | none that ships with the package | Unknown frontmatter fields are ignored. Set it yourself in `opencode.json`: `{"permission": {"skill": {"implement": "ask", "close": "ask"}}}`. |

The last two rows are a real limitation, not an oversight. If you run Kilo Code or OpenCode, expect to say no occasionally.

## What ships

Twenty skills, the artifact-store and stage-boundary scripts they call, the two contract documents, and one optional Pi extension. Four manifests describe the same `skills/` tree to four ecosystems:

| Manifest | Read by |
|---|---|
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | Claude Code |
| `plugin.json` (Agent Plugins 1.0.0) | Codex, and other clients of the portable format |
| `.agents/plugins/marketplace.json` | Codex, as the catalog `codex plugin marketplace add` reads |
| `package.json` (`pi`, `bin`, `files`) | Pi, and `npm`/`npx` |

Material this core no longer ships is preserved under `parked/`: the specialist skills, the subagent definitions, the telemetry extension, the historical documents, and the observation, evaluation, and publication tests. Nothing under `parked/` is packaged, tested, or referenced by a core skill.

## Development

```bash
bun run test           # root suite and package suites
npm pack --dry-run     # what the package ships
claude plugin validate .
```

## License

MIT
