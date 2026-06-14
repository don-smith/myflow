---
name: sync-upstream
description: Run the upstream sync script to clone/pull Superpowers and RPIV, diff against last-synced hashes, and produce a decision report
---

# Sync Upstream

Keep an eye on upstream changes to **Superpowers** and **RPIV** — not to incorporate, but to stay informed. This skill runs a script that:

1. Clones or pulls `obra/superpowers` into `vendor/superpowers-source/`.
2. Copies selected Superpowers skills into `vendor/superpowers/skills/` (for diffing against what's in the repo).
3. Clones or pulls `juicesharp/rpiv-mono` to review RPIV changes.
4. Compares the current HEAD of each repo against the last-synced hash.
5. Emits a dated report in `docs/memory/upstream-sync-YYYY-MM-DD.md`.
6. Updates `docs/memory/.upstream-last-sync.json` so the next run only shows new changes.

## Announce at start

> "I'm using the `sync-upstream` skill to check for changes in Superpowers and RPIV.

## When to use

- Monthly, per `docs/runbooks/monitor-upstream-evolution.md`.
- After a project closeout where upstream behavior felt different.
- Before a new release of myflow.

## Process

### Step 1: Run the sync script

```bash
./scripts/sync-upstream.sh
```

The script requires:
- `git`
- `jq`
- network access to GitHub

If `jq` is missing, install it (`brew install jq` on macOS, `apt-get install jq` on Debian/Ubuntu).

### Step 2: Read the report

Open the generated report:

```bash
ls docs/memory/upstream-sync-*.md | tail -1
```

The report contains:
- Last-synced and current commit hashes for both repos.
- Commit log since last sync.
- Diff stat since last sync.
- Empty **Decisions** sections for Superpowers and RPIV.

### Step 3: Review what changed

Read the report. Note anything interesting — new skills, breaking changes, workflow shifts — but the default stance is **observe, don't integrate.** myflow is intentionally decoupled from upstream velocity.

If something is compelling enough to incorporate, make a deliberate decision and document it. But that should be the exception, not the routine.

Edit the report in place with your observations.

### Step 4: Update memory and commit

1. Update `docs/memory/monitor_upstream_evolution.md` with the review date and any notable observations.
2. Commit the new sync report and updated memory.
3. Push.

No version bumps, no publishing — just awareness.

## Anti-patterns

- **Syncing without reviewing.** The script surfaces changes; skim the report at minimum.
- **Incorporating by default.** The default is observe. Integrate only with a deliberate, documented decision.
- **Letting upstream velocity drive myflow.** myflow has its own rhythm. Upstream changes are interesting data, not action items.

## See also

- `docs/runbooks/monitor-upstream-evolution.md` — the monthly runbook
- `docs/memory/monitor_upstream_evolution.md` — long-term decision context
- `scripts/sync-upstream.sh` — the underlying script
