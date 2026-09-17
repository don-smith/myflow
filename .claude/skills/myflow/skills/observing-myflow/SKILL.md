---
name: observing-myflow
description: Use when a MyFlow workstream reaches an observation checkpoint or Close, or when session history suggests drift, looping, rework, waiting, correction, or workflow friction.
disable-model-invocation: true
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
- Keep developer experience separate from process friction. Developer self-report and Close satisfaction require direct evidence; absent reports remain `null`.
- Treat provider/model, token, tool, and cost totals as system diagnostics, never individual productivity measures.
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
4. Update the private `accountPath` with new episodes only. Record evidence boundaries, stage/activity, result, rework, unknown gaps, process friction, and confidence. Add a direct developer report from the excluded observer conversation to the private account as `developer-report`; treat it as self-report and do not reclassify that session as delivery evidence.
5. For a stage return, record the detecting stage, owning stage, open or completed loop duration, earliest plausible detection point, and cheapest credible earlier check. Keep useful correction distinct from avoidable late discovery.
6. Compare the episode with the stage objective, non-goals, next action, and prior account. Identify low-yield activity only across a sequence. Tool volume is not quality.
7. Return a short summary and private account path. Do not write observation files into the target worktree.

## Finalize during Close

1. Run the collector in `finalize` mode. Read the private account and snapshot, accepted plan, Verify report, manifest, and Git state. Follow [report-contract.md](report-contract.md).
2. Write a private `myflow-observation-analysis/v1` document to the receipt's `suggestedAnalysisPath`. Supply explicit workstream boundaries, boundary semantics, non-overlapping stage intervals, Flow Item type, process-friction counts, and source-qualified developer experience. A stage may have several intervals after a return. Never infer missing sentiment, active time, wait time, or Flow Item type from session prose.
3. Derive the team-safe export instead of hand-calculating it:

```bash
node <skill-dir>/scripts/derive-team-flow.mjs \
  --evidence <snapshotPath> \
  --analysis <suggestedAnalysisPath> \
  --output <suggestedTeamMetricsPath>
```

The command filters assistant usage to the half-open workstream boundary, assigns each included call to at most one stage, and reports unassigned calls. It retains uncached input, cache read and write, output, reasoning, total tokens, provider/model groups, recorded cost, and cost coverage. Reasoning tokens are a subset dimension; never add them to output or total tokens.
4. Write the curated account to `suggestedReportPath`. Return the curated report and team-safe export paths to Close as evidence. Keep the private analysis and raw evidence private. Do not copy any observation file into the target worktree.

## Repository rollup

Compare workstreams over a fixed reporting window with the team-safe exports, never the private evidence:

```bash
node <skill-dir>/scripts/rollup-flow-metrics.mjs \
  --target <worktree> \
  --window-start <timestamp> \
  --window-end <timestamp> \
  --output <private-path-outside-worktree>
```

Use `--observation-root` instead of `--target` only for a controlled fixture or explicit observation-root override. The command selects the lexically latest compatible v2 export in each workstream's `curated/` directory. It reports malformed and incompatible exports, applies a half-open completion window, reconstructs historical and current Load, and keeps Scope-to-Close cycle time separate from canonical Flow Time. Review coverage before interpreting Distribution, Flow Time, Flow Efficiency, current Load, cost, or provider/model totals.

## Source precedence

Version one uses Pi JSONL, Git, and MyFlow artifacts. When project-based Langfuse supplies the same activity, prefer exact lifecycle spans, use JSONL for recovery, and deduplicate by session and event identity. Keep reports and metric names independent of the backend.

## Common mistakes

| Mistake | Correction |
|---|---|
| Calling silent time agent work | Label it an unknown gap. |
| Repeating Verify | Report recorded evidence or its absence. |
| Publishing raw trace content | Keep it private. |
| Inferring sentiment from process signals | Leave experience `null`; report process friction separately. |
| Using whole-session token totals | Derive economics through explicit workstream and stage intervals. |
| Treating reasoning as extra output | Preserve it as a subset dimension without adding it again. |
| Comparing workstreams with different windows | Generate rollups with the same explicit reporting window. |
| Including the observer session | Use retained observer IDs. |
| Writing Close observations into the target repository | Use the collector-provided personal repository paths. |
