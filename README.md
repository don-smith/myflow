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

MyFlow ships as a [skills-directory plugin](https://docs.anthropic.com/en/docs/claude-code/plugins) for Claude Code. Clone the repository and start Claude Code in its root:

```bash
git clone https://github.com/don-smith/myflow.git
cd myflow
claude
```

Accept the workspace trust dialog. The plugin at `.claude/skills/myflow/` is auto-discovered. Run `/skills` to confirm MyFlow skills appear.

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
- Telemetry forwarding to Langfuse uses Claude Code hooks (configure `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` in the environment). See `.claude/skills/myflow/hooks/hooks.json`.
- Web search and fetch use Claude Code's built-in tools (no separate MCP server needed).
- The `observing-myflow` and `langfuse` specialist skills provide reduced coverage under Claude Code — session log access differs from Pi.

**Architecture:** `skills/` at the repo root is the Pi source of truth. `.claude/skills/myflow/skills/` is the Claude Code derived copy. When updating skills, update both.

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

`design` is a collaborative Plan step used for material structural decisions; it is not mandatory for lightweight work. `research`, `prototype`, architecture specialists, domain modeling, and TDD are selected only when the work needs them.

`observing-myflow` can record a third-party flow account at checkpoints and during Close. It reads Pi session logs and workstream evidence without repeating review or verification. Private evidence and curated reports stay outside the target checkout under `~/.myflow/repositories/<identity>/observations/<workstream-id>/`.

After several workstreams have v2 team exports, generate a repository rollup over a fixed reporting window:

```bash
node skills/observing-myflow/scripts/rollup-flow-metrics.mjs \
  --target <worktree> \
  --window-start <timestamp> \
  --window-end <timestamp> \
  --output <private-path-outside-worktree>
```

The rollup reports Velocity, Distribution, historical and current Load, separate cycle and canonical Flow Time summaries, Flow Efficiency coverage, and AI economics. For longitudinal comparisons, keep the repository, schema version, completion rule, and window length fixed. Missing classifications, efficiency evidence, current exports, and recorded cost remain visible as coverage gaps.

Stage reviews can be evaluated locally and published as synthetic Langfuse traces with deterministic scores. Publication is explicit, dry-run by default, and uses structured allowlist enforcement:

```bash
# Dry-run (default): validate and print the synthetic projection.
node skills/observing-myflow/scripts/publish-stage-review.mjs \
  --review-path <review.json> --workstream-id <id>

# Check score compatibility with existing names.
node skills/observing-myflow/scripts/publish-stage-review.mjs \
  --score-compatibility

# Publish to configured Langfuse project (requires LANGFUSE_PUBLIC_KEY
# and LANGFUSE_SECRET_KEY).
node skills/observing-myflow/scripts/publish-stage-review.mjs \
  --review-path <review.json> --workstream-id <id> --publish
```

Published score names use the `myflow.developer.*` and `myflow.return.*` prefixes alongside `myflow.stage.*`. No aggregate quality grade or model judge ships. Raw prompts, responses, code, paths, and credentials are excluded from synthetic payloads by a structured allowlist.

A fresh session runs `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>`, then reads its selected map, `workstream.md`, and the authoritative stage artifact. Small work may use the lightweight path; structural work adds Design and a full plan. Verify owns review/manual evidence, and Close records only applicable delivery and follow-up decisions.

The detailed workflow and alignment status are maintained in:

- [Artifact and stage-boundary contract](docs/artifact-and-stage-boundary-contract.md)
- [Workflow status and alignment](docs/myflow-workflow-status-and-alignment.md)

## Package resources

The package declares these optional Pi extensions alongside its skills:

- structured `ask_user_question` interaction;
- privacy-configured telemetry/evaluation support (non-blocking; no telemetry redesign is required for normal work); and
- `web_search` / `web_fetch` tools with configurable providers.

Their configuration lives under `~/.myflow/config/`. Telemetry must remain permitted by the repository and must not transmit sensitive source, credentials, tokens, or personal data without explicit approval.

## Official Langfuse Pi plugin

MyFlow ships replacement lifecycle, evaluation, and publication modules that do not depend on custom telemetry. The official `@langfuse/pi-observability-plugin` can provide native Pi traces alongside those modules.

### Privacy limit

The pinned `@langfuse/pi-observability-plugin@0.1.2` sends prompts, assistant responses, tool arguments and results, compaction summaries, and images to the configured Langfuse project by default. Its built-in masking redacts only Langfuse key-shaped tokens. It does not mask source code, file paths, commands, credentials (beyond its own API keys), personal data, or reasoning text.

Raw official-plugin capture is **not safe by default** for production repositories. Do not enable it without explicit, per-repository review of what will be sent.

### Opt-in gate

Production opt-in remains blocked until stronger client-side capture suppression or masking exists. The current local exception allows a developer to use the plugin for bounded, non-sensitive workstreams with a dedicated Langfuse project, configured retention, and no managed LLM evaluator over raw observations.

### Kill switch

`LANGFUSE_TRACING_ENABLED=false` disables the official plugin at process startup. It wins over all other plugin configuration. The custom telemetry extension (`packages/telemetry`) can be disabled through `pi config`.

### JSONL recovery

Pi JSONL session files remain the authoritative recovery source. The observer collector (`skills/observing-myflow/scripts/collect-evidence.mjs`) reads JSONL by default. JSONL does not depend on Langfuse availability, network connectivity, or plugin flush success.

### Installation (explicit only)

The plugin is not a workspace dependency and is not enabled automatically. To use it for a bounded pilot, install the exact pinned version alongside the recorded dependency tree:

```bash
pi install npm:@langfuse/pi-observability-plugin@0.1.2
```

Record the resolved versions of `@langfuse/otel` and `@langfuse/tracing` (the plugin declares `^5.10.0`; the registry reports `5.11.1` as latest as of 2026-09-13) plus your Pi, Node, and Langfuse deployment version. Restart Pi after installation.

### Rollback

To restore the pre-plugin state:

```bash
pi remove @langfuse/pi-observability-plugin
```

If `packages/telemetry` was ever removed and must be restored, check out the pre-cutover commit (`2e03bf8`) for `packages/telemetry/`, `package.json`, and `bun.lock`. Restart Pi after restoring. Historical Langfuse traces and scores delivered before rollback cannot be unsent; delete the Langfuse project or wait for retention expiry.

## Validation

```bash
npm test
npm pack --dry-run
```

## License

MIT
