---
# Stage Context Checkpoint & Rehydration Manifest
#
# Shared template for every MyFlow stage artifact.
#
# Context Checkpoint — written progressively during artifact creation.
# Tracks in-progress state so the conversation can survive mid-stage
# context exhaustion without a handoff.
#
# Rehydration Manifest — written at artifact finalization.
# Tells the next session what artifacts/files/decisions to re-read,
# so the downstream skill can resume without re-researching the problem.
# Skills that produce no read artifact (side-effect stages) skip the Manifest.
# ---

## Context Checkpoint

status: in-progress

### Completed
- {Step/phase completed, e.g. "Slice 1: types + interfaces — approved"}
- {Key decisions locked}

### Working Set
- Files read: {path/to/file.ext — why it matters}
- Key references: {artifact paths, doc links}

### Next Action
- {What to do next in this conversation, e.g. "Generate Slice 2 code → run verifier → present"}

---

## Rehydration Manifest

### Artifacts to Read
- `.myflow/artifacts/{kind}/{timestamp}_{topic}.md` — {full | targeted sections}

### Source Files to Read
- `path/to/file.ext` — {why this file matters for the next stage}

### Key Decisions
- {Decision 1}: {verdict} — {evidence}
- {Decision 2}: {verdict} — {evidence}

### Next Command
`/skill:{next-skill} .myflow/artifacts/{kind}/{timestamp}_{topic}.md`