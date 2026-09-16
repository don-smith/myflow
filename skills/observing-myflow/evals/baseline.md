# Baseline evaluation

Run before `observing-myflow` existed against the live `core-runtime-foundation` workstream on 2026-09-12.

## Scenarios

Three fresh read-only agents attempted an incremental checkpoint, a Close reconstruction, and a privacy-safe improvement report. Full outputs remain in the originating Pi subagent artifacts under workflow `d847f270-3898-4024-827b-6977ac07ad5f`.

## What worked without a skill

- Agents found the correct delivery session and excluded the active observer after reading its purpose.
- They distinguished interaction gaps from proven active work.
- They correlated session claims with MyFlow artifacts and Git state.
- They separated visible developer corrections from autonomous agent drift.

## Baseline failures and variance

- Each agent invented a different account structure and attribution procedure.
- Incremental behavior was only proposed. No agent could demonstrate a durable second checkpoint or deduplication.
- Privacy depended on prose judgment rather than a bounded curated-output contract.
- One agent expanded the observation into a new dependency and architecture review, then recommended blocking Plan. This repeated responsibilities owned by Design and Verify instead of observing their execution.
- The reports had no stable private state schema, team-safe metric schema, analysis version, or source adapter for the intended Langfuse direction.
- Timing terminology varied across reports, making later aggregation unsafe.

## Skill requirements established by RED

1. Use a deterministic incremental collector for session selection, cursors, redaction, and metrics.
2. Keep raw evidence and cursor state private; publish only a curated Close account and team-safe metrics.
3. Use one stable report contract and evidence vocabulary.
4. Treat gaps as unknown unless lifecycle telemetry classifies them.
5. Observe MyFlow rather than rerunning its specialist, review, or verification work.
6. Separate facts, interpretations, and testable improvement hypotheses.
7. Keep the analysis source-neutral so project-based Langfuse can later provide exact spans without changing reports.
8. Evaluate stage outcomes mechanically from lifecycle facts and artifacts without model judgment.
9. Keep free text and evidence references private; produce an allowlisted public projection separately.
