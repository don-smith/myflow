# MyFlow

MyFlow is an artifact-led, five-stage workflow package for [Pi](https://pi.dev). It provides skills and optional extensions that help a developer and agent scope, plan, implement, verify, and close work without relying on conversation history.

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

### Git package

After publishing a reachable Git repository/tag, install a pinned revision:

```bash
pi install git:github.com/don-smith/myflow@<tag-or-commit>
```

Use `pi list` to inspect installed packages, `pi config` to enable or disable individual package resources, and `pi remove <source>` to unregister a package. Pi packages execute extensions and provide agent instructions, so install only sources you trust.

## First use in a repository

1. Start Pi in the target repository.
2. Run `/skill:onboard` to create or refresh `.myflow/repository-map.md`.
3. Start a workstream with `/skill:scope "<rough idea>"`.
4. Follow the artifact's recommended next action. A new workstream normally lives at `.myflow/workstreams/<workstream-id>/`.

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
| Implement | `implement` | Green phase commits and implementation checkpoint |
| Verify | `validate` | Validation report, review evidence, and manual-verification brief |
| Close | `close` | Applicable documentation, delivery, learning, and closeout updates |

`design` is a collaborative Plan step used for material structural decisions; it is not mandatory for lightweight work. `research`, `prototype`, architecture specialists, domain modeling, and TDD are selected only when the work needs them.

The detailed workflow and alignment status are maintained in:

- [Artifact and stage-boundary contract](docs/artifact-and-stage-boundary-contract.md)
- [Workflow status and alignment](docs/myflow-workflow-status-and-alignment.md)

## Package resources

The package declares these optional Pi extensions alongside its skills:

- structured `ask_user_question` interaction;
- privacy-configured telemetry/evaluation support; and
- `web_search` / `web_fetch` tools with configurable providers.

Their configuration lives under `~/.myflow/config/`. Telemetry must remain permitted by the repository and must not transmit sensitive source, credentials, tokens, or personal data without explicit approval.

## Validation

```bash
npm test
npm pack --dry-run
```

## License

MIT
