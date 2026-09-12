---
name: observing-myflow
description: Use when a MyFlow workstream reaches an observation checkpoint or Close, or when session history suggests drift, looping, rework, waiting, correction, or workflow friction.
argument-hint: "[checkpoint|finalize] [target-worktree] [workstream-id]"
---

# Observing MyFlow

Build a third-party account of observable MyFlow work. This is a pull-based observer, not a daemon or grader. Run at checkpoints and finalize during Close.

## Boundaries

- Do not perform a fresh code review, architecture review, research pass, or verification.
- Do not use hidden thinking blocks as evidence.
- Keep raw evidence, session paths, prompts, tool payloads, and cursors private.
- Store observer state and reports under `~/.myflow/repositories/<identity>/observations/<workstream-id>/`. Do not write any observation artifact into the target worktree.
- Separate facts, interpretations, and improvement hypotheses.
- A timestamp gap is an unknown interval, not active agent time.
- Preserve developer-reported friction without turning sentiment into a performance grade.
- Record a backward transition or stage return as necessary learning, late discovery, process-induced, or unclassified only when evidence supports it.
- One run can support a hypothesis, never a permanent skill change.

## Checkpoint

1. Resolve the target Git root and workstream ID. Ask if ambiguous. Run the repository-map resolver and read its map when found.
2. Read `workstream.md`, its current artifact, and Git status. The collector excludes `PI_SESSION_ID`, `PI_SUBAGENT_PARENT_SESSION`, and retained observer IDs.
3. Run:

```bash
node <skill-dir>/scripts/collect-evidence.mjs checkpoint \
  --target <worktree> --workstream <id> --receipt-only
```

The collector uses the repository-map resolver's global `target` identity. Use `--sessions-root` or `--state-root` only for an explicit override. An overridden state root is repository-specific and receives the workstream directory directly. Read the returned private `snapshotPath`.
4. Update the private `accountPath` with new episodes only. Record evidence boundaries, stage/activity, result, rework, unknown gaps, developer friction, and confidence. Add a direct developer report from the excluded observer conversation to the private account as `developer-report`; do not reclassify that session as delivery evidence.
5. For a stage return, record the detecting stage, owning stage, open or completed loop duration, earliest plausible detection point, and cheapest credible earlier check. Keep useful correction distinct from avoidable late discovery.
6. Compare the episode with the stage objective, non-goals, next action, and prior account. Identify low-yield activity only across a sequence. Tool volume is not quality.
7. Return a short summary and private account path. Do not write observation files into the target worktree.

## Finalize during Close

Run `finalize`. Read the private account and snapshots, accepted plan, Verify report, manifest, and Git state. Follow [report-contract.md](report-contract.md).

Write only the curated account and team-safe metrics to the collector-provided paths under the personal repository observation tree. Return both paths to Close as evidence. Do not copy them into the target worktree.

## Source precedence

Version one uses Pi JSONL, Git, and MyFlow artifacts. When project-based Langfuse supplies the same activity, prefer exact lifecycle spans, use JSONL for recovery, and deduplicate by session and event identity. Keep reports and metric names independent of the backend.

## Common mistakes

| Mistake | Correction |
|---|---|
| Calling silent time agent work | Label it an unknown gap. |
| Repeating Verify | Report recorded evidence or its absence. |
| Publishing raw trace content | Keep it private. |
| Including the observer session | Use retained observer IDs. |
| Writing Close observations into the target repository | Use the collector-provided personal repository paths. |
