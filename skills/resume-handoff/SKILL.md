---
name: resume-handoff
description: Resume work from a handoff document. Reads the handoff, verifies current state, and continues from where the previous session left off. Use at the start of a new session when resuming from a handoff file. Artifacts are the primary handoff mechanism — this is a backup for mid-stage pauses.
argument-hint: [handoff-path]
shell-timeout: 10
---

# Resume Handoff

Resume work from a lightweight handoff document. Run `node skills/myflow/scripts/resolve-repository-map.mjs discover --cwd <git-root>` first and read its selected map when found. Artifacts are the primary handoff mechanism in MyFlow — use this only for mid-stage pauses.

## Process

1. **Read the handoff** FULLY. Note the stage, artifact path, and what's next.

2. **Read the current artifact** the handoff references (the plan, design, or alignment artifact). This is the source of truth.

3. **Verify state**: check that files mentioned in the handoff still exist and git state hasn't diverged. Run `git status` for a quick check.

4. **Present a summary**:

```
Resuming from handoff: {description}
Stage: {stage}, Artifact: {path}

What was done: {summary}
What's next: {next actions}

Proceed?
```

5. **Begin work** on the first next action. The artifact (not the handoff) is authoritative for detailed context — read it as needed.

Keep it fast. The handoff is a bookmark, not a spec.
