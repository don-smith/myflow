---
name: handoff
description: Write or resume a lightweight handoff document for a session transition. Write mode compacts the current task, decisions, in-flight changes, and next steps into a concise file; resume mode reads one back and continues the work. Use when context is large and you need to pause mid-stage, or when a fresh session starts from such a pause. Artifacts are the primary handoff mechanism — this is a backup for mid-stage pauses.
argument-hint: "[description | --resume <handoff-path>]"
allowed-tools: Read, Write, Bash
shell-timeout: 10
---

# Handoff

A lightweight backup for mid-stage pauses. Stage artifacts are the primary handoff mechanism in MyFlow — use this skill only to hand off between artifact boundaries, inside a stage or an implementation phase.

First run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` and record its selected map path.

## Pick the mode

- **Write** — the argument is a short description, or empty. Produce a new handoff file.
- **Resume** — the argument names an existing handoff file. Read it back and continue the work.

## Write mode

1. **Determine the filepath**: `<workstream-root>/<workstream-id>/handoffs/<timestamp>_<slug>.md`, using the current time and a short kebab-case slug from the description.

2. **Write the handoff**:

```markdown
# Handoff: {one-line description}

## Where we are
- Stage: {Scope|Plan|Implement|Verify|Close}
- Artifact: {path to current artifact}
- Phase: {Phase N if in implement, otherwise omit}

## What's done
- {bullet list of completed work}

## What's next
- {bullet list — what the next session should do first}

## Key files
- `path/to/file.ext` — {why it matters}
- `path/to/file.ext` — {why it matters}

## Decisions
- {Decision}: {verdict}

## Verification snapshot
- Acceptance criteria covered: {criterion → test path/name or verification command}
- Explicitly not tested: {criterion/risk → reason or follow-up}
- Current evidence: {last red/green result, suite, or manual check}
```

3. **Present**:

```
Handoff written to:
`<workstream-root>/<workstream-id>/handoffs/<filename>.md`

**Next step:** `/skill:handoff --resume <workstream-root>/<workstream-id>/handoffs/<filename>.md`
```

Keep it short. The stage artifact already holds the full context — the handoff just points at what to resume.

## Resume mode

1. **Read the handoff** FULLY. Note the stage, artifact path, and what's next.

2. **Read the current artifact** the handoff references (the plan, design, or alignment artifact). This is the source of truth.

3. **Verify state**: check that the files the handoff mentions still exist and that Git state has not diverged. Run `git status` for a quick check.

4. **Present a summary**:

```
Resuming from handoff: {description}
Stage: {stage}, Artifact: {path}

What was done: {summary}
What's next: {next actions}

Proceed?
```

5. **Begin work** on the first next action. The artifact, not the handoff, is authoritative for detailed context — read it as needed.

Keep it fast. The handoff is a bookmark, not a spec.
