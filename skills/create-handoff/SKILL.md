---
name: create-handoff
description: Create a lightweight handoff document for session transitions. Compacts current task, decisions, in-flight changes, and next steps into a concise file. Use when context is large and you need to hand off mid-stage to a fresh session. Artifacts are the primary handoff mechanism — this is a backup for mid-stage pauses.
argument-hint: [description]
allowed-tools: Read, Write
shell-timeout: 10
---

# Create Handoff

A lightweight backup for mid-stage pauses. Artifacts are the primary handoff mechanism in MyFlow — use this only when you need to hand off between artifact boundaries.

## Process

1. **Determine filepath**: `.myflow/artifacts/handoffs/<timestamp>_<slug>.md` using current time and a short kebab-case slug from `$ARGUMENTS`.

2. **Write the handoff**:

```markdown
# Handoff: {one-line description}

## Where we are
- Stage: {Scope|Plan|Implement|Review|Close}
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
`.myflow/artifacts/handoffs/<filename>.md`

**Next step:** `/skill:resume-handoff .myflow/artifacts/handoffs/<filename>.md`
```

Keep it short. The artifact already has the full context — the handoff just points at what to resume.
