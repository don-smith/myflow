#!/usr/bin/env bash
set -euo pipefail

# sync-upstream.sh
#
# Update myflow's vendored Superpowers skills and track upstream changes.
# RPIV is installed as a normal npm dependency, so this script only monitors
# its repo for changes that might affect dependency versions or workflow.
#
# Usage:
#   ./scripts/sync-upstream.sh
#
# Outputs:
#   vendor/superpowers-source/  git mirror of obra/superpowers
#   vendor/superpowers/skills/  selected Superpowers skills vendored into myflow
#   vendor/superpowers/LICENSE  Superpowers MIT license
#   <personal repo memory>/upstream-sync-YYYY-MM-DD.md  decision report
#   <personal repo memory>/.upstream-last-sync.json     last-synced commit hashes

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SOURCE_DIR="$REPO_ROOT/vendor/superpowers-source"
VENDOR_DIR="$REPO_ROOT/vendor/superpowers"
VENDOR_SKILLS_DIR="$VENDOR_DIR/skills"
node "$REPO_ROOT/skills/_shared/repo-store.mjs" ensure >/dev/null
MEMORY_DIR="$(node "$REPO_ROOT/skills/_shared/repo-store.mjs" state memory)"
TODAY="$(date +%Y-%m-%d)"
REPORT_FILE="$MEMORY_DIR/upstream-sync-$TODAY.md"
LAST_SYNC_FILE="$MEMORY_DIR/.upstream-last-sync.json"

# Skills from Superpowers that myflow vendors directly.
# Conflicting skills (finishing-a-development-branch, using-git-worktrees,
# verification-before-completion) are intentionally excluded because myflow
# provides its own integrated versions.
SUPERPOWERS_SKILLS=(
  brainstorming
  dispatching-parallel-agents
  receiving-code-review
  systematic-debugging
  test-driven-development
  using-superpowers
  writing-skills
)

mkdir -p "$SOURCE_DIR" "$VENDOR_SKILLS_DIR" "$MEMORY_DIR"

# Ensure last-sync tracking file exists
if [[ ! -f "$LAST_SYNC_FILE" ]]; then
  echo '{}' > "$LAST_SYNC_FILE"
fi

# Read last-synced hashes
SUPERPOWERS_LAST="$(jq -r '.superpowers // ""' "$LAST_SYNC_FILE")"
RPIV_LAST="$(jq -r '.rpiv // ""' "$LAST_SYNC_FILE")"

sync_repo() {
  local name="$1"
  local url="$2"
  local dir="$3"

  if [[ -d "$dir/.git" ]]; then
    echo "Updating $name..." >&2
    git -C "$dir" fetch origin --quiet
    git -C "$dir" pull origin --quiet
  else
    echo "Cloning $name..." >&2
    git clone --quiet "$url" "$dir"
  fi

  git -C "$dir" rev-parse HEAD
}

SUPERPOWERS_CURRENT="$(sync_repo "Superpowers" "https://github.com/obra/superpowers" "$SOURCE_DIR")"

# Copy selected Superpowers skills into the package
for skill in "${SUPERPOWERS_SKILLS[@]}"; do
  if [[ -d "$SOURCE_DIR/skills/$skill" ]]; then
    rm -rf "$VENDOR_SKILLS_DIR/$skill"
    cp -R "$SOURCE_DIR/skills/$skill" "$VENDOR_SKILLS_DIR/$skill"
  else
    echo "Warning: Superpowers skill '$skill' not found" >&2
  fi
done

# Copy attribution
cp "$SOURCE_DIR/LICENSE" "$VENDOR_DIR/LICENSE"

# For RPIV, just track the upstream repo for release notes / workflow changes.
# The actual RPIV skills ship through the npm dependency chain.
RPIV_CURRENT="$(sync_repo "RPIV" "https://github.com/juicesharp/rpiv-mono" "$REPO_ROOT/vendor/rpiv-mono")"

# Build report
cat > "$REPORT_FILE" <<EOF
# Upstream Sync: $TODAY

type: upstream-sync
superpowers-last: ${SUPERPOWERS_LAST:-none}
superpowers-current: $SUPERPOWERS_CURRENT
rpiv-last: ${RPIV_LAST:-none}
rpiv-current: $RPIV_CURRENT

## Superpowers ($SUPERPOWERS_LAST → $SUPERPOWERS_CURRENT)

Vendored skills: $(IFS=,; echo "${SUPERPOWERS_SKILLS[*]}")

### Commits since last sync

\`\`\`bash
$(if [[ -n "$SUPERPOWERS_LAST" ]]; then
  git -C "$SOURCE_DIR" log --oneline "$SUPERPOWERS_LAST..$SUPERPOWERS_CURRENT" -- || true
else
  git -C "$SOURCE_DIR" log --oneline -20 -- || true
fi)
\`\`\`

### Files changed

\`\`\`bash
$(if [[ -n "$SUPERPOWERS_LAST" ]]; then
  git -C "$SOURCE_DIR" diff --stat "$SUPERPOWERS_LAST..$SUPERPOWERS_CURRENT" -- || true
else
  echo "First sync — review the repository structure and recent commits."
fi)
\`\`\`

### Decisions

- **Notable:** _list interesting Superpowers changes (already copied if in vendored list)_
- **Add new skill to vendor list:** _new upstream skills worth including_
- **Defer / Note:** _changes that do not fit or are not yet needed_
- **Notes:** _observations, breaking changes, anything worth remembering_

## RPIV ($RPIV_LAST → $RPIV_CURRENT)

RPIV ships as an npm dependency. Review changes for version bumps or workflow impact.

### Commits since last sync

\`\`\`bash
$(if [[ -n "$RPIV_LAST" ]]; then
  git -C "$REPO_ROOT/vendor/rpiv-mono" log --oneline "$RPIV_LAST..$RPIV_CURRENT" -- || true
else
  git -C "$REPO_ROOT/vendor/rpiv-mono" log --oneline -20 -- || true
fi)
\`\`\`

### Files changed

\`\`\`bash
$(if [[ -n "$RPIV_LAST" ]]; then
  git -C "$REPO_ROOT/vendor/rpiv-mono" diff --stat "$RPIV_LAST..$RPIV_CURRENT" -- || true
else
  echo "First sync — review the repository structure and recent commits."
fi)
\`\`\`

### Decisions

- **Bump dependency version:** _new RPIV version to pin in package.json_
- **Workflow impact:** _changes that affect how myflow uses RPIV skills_
- **Defer / Skip:** _changes that do not affect myflow_

## Next steps

1. Review the commits and diffs above.
2. Edit the **Decisions** sections in this file.
3. If Superpowers skills changed, the vendored copies are already updated in \`vendor/superpowers/skills/\`.
4. If RPIV changed, update \`package.json\` dependency versions as needed.
5. Run tests / install the package locally.
6. Bump version, commit, push, and publish.
EOF

# Update last-sync tracking
jq -n \
  --arg superpowers "$SUPERPOWERS_CURRENT" \
  --arg rpiv "$RPIV_CURRENT" \
  '{superpowers: $superpowers, rpiv: $rpiv}' > "$LAST_SYNC_FILE"

echo ""
echo "Upstream sync complete."
echo "Report: $REPORT_FILE"
echo "Last-sync tracking: $LAST_SYNC_FILE"
echo ""
echo "Current hashes:"
echo "  Superpowers: $SUPERPOWERS_CURRENT"
echo "  RPIV:        $RPIV_CURRENT"
echo ""
echo "Note: vendor/superpowers-source/ and vendor/rpiv-mono/ are gitignored."
echo "      Vendored Superpowers skills are in vendor/superpowers/skills/ and should be committed."
