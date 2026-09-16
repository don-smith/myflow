# Observing MyFlow evaluation scenarios

## Incremental checkpoint

Given several Pi sessions with the same worktree cwd, including the observer's own session, an unrelated workstream, and one delivery session with an incomplete final JSONL record:

- select sessions by parsed header cwd and workstream evidence;
- exclude the current and previously recorded observer sessions;
- process only complete new records after the retained cursor;
- retain private cursor and evidence state in the canonical personal repository observation tree outside the target repository;
- describe timestamp gaps as unknown intervals rather than active agent time;
- update the episodic account without duplicating earlier episodes.

## Finalize at Close

Given checkpoint evidence across Scope, Plan, Implement, Verify, and Close:

- correlate the account with MyFlow artifacts and final Git state;
- separate facts, interpretations, and improvement hypotheses;
- write a curated report and team-safe metric export under `~/.myflow/repositories/<identity>/observations/<workstream-id>/curated/`;
- keep raw prompts, tool payloads, absolute session paths, and cursor data private;
- report missing exact lifecycle timing as a limitation;
- do not repeat code review, architecture review, or verification;
- do not create or update an observations directory in the target worktree.

## Backward flow

Given a Plan review that returns a ready design to Design and a developer who reports that the return felt deflating:

- record the backward transition and its eventual elapsed loop duration;
- preserve the developer-reported friction without turning sentiment into a performance grade;
- distinguish necessary learning, late discovery, and a process-induced return;
- identify the earliest stage and cheapest credible check that could have exposed the issue;
- treat the corrective gate as useful while still accounting for its flow cost;
- propose a risk-triggered mitigation rather than adding mandatory ceremony to every workstream.

## Evidence-qualified AI economics

Given assistant entries from more than one provider and model, with uncached input, cache read and write, output, reasoning, total-token, and recorded-cost fields:

- preserve every usage dimension without adding reasoning tokens to output or total tokens;
- group calls and usage by provider and model;
- report recorded and missing cost coverage rather than estimating absent cost;
- retain the evidence-v1 `tokenUsage` aggregate for compatible readers.

## Boundary filtering and repeated stages

Given precursor usage, explicit workstream boundaries, repeated non-overlapping Scope intervals, a Plan interval, usage between intervals, and subsequent-work usage:

- include only calls inside the half-open workstream boundary;
- assign each included call to no more than one stage interval;
- sum repeated intervals under the same stage without merging away the return;
- report between-stage calls and recorded cost as unassigned;
- reject overlapping, reversed, or out-of-bound stage intervals.

## Conservative experience and efficiency

Given no developer self-report and no active or wait classification:

- keep self-report and Close satisfaction `null`;
- report process-friction counts separately from developer experience;
- keep Flow Efficiency `null` with `not-measured` coverage;
- do not use token, tool, or elapsed-time volume as a proxy for experience, efficiency, or individual productivity.

## Repository rollup

Given several workstream observation directories with old and current v2 exports, a newer v1 export, one malformed export, an unknown Flow Item type, completed and open load intervals, nullable efficiency, and mixed cost coverage:

- select the latest compatible v2 export for each workstream rather than the latest file of any version;
- report malformed, unsupported, and invalid v2 counts without exposing private paths;
- count Velocity and Distribution only when completion falls inside the half-open reporting window;
- keep unknown Flow Items in their own bucket and state classification coverage;
- reconstruct historical Load and mark whether current Load includes open exports or finalized intervals only;
- summarize Scope-to-Close cycle time separately from canonical Flow Time;
- average qualified Flow Efficiency values and report missing coverage;
- sum each AI usage dimension, provider/model group, recorded cost, and missing-cost coverage for completed items in the window.

## Telemetry migration

Given a later deployment where project-based Langfuse telemetry supplies exact lifecycle spans:

- preserve metric names and report structure;
- prefer exact telemetry intervals over JSONL timing inference;
- retain Pi JSONL as historical recovery evidence;
- do not double-count events represented by both sources;
- keep the analysis layer independent of the telemetry backend.

## Attempt economics from lifecycle journal

Given a workstream with a lifecycle journal containing Scope, Plan, Implement, and Verify stage events plus one correction episode (Verify→Implement→Verify):

- derive stage intervals from lifecycle events, not artifact timestamps;
- report two Verify attempts (ordinal 1 detected the issue, ordinal 2 passed);
- report one correction episode with one canonical backward edge;
- report only the correction interval's qualified economics;
- mark the source as lifecycle, not inferred;
- derive stageReturnCount=1, returnEpisodeCount=1 from lifecycle episodes;
- reconcile attempt totals with assigned workstream totals;
- preserve ambiguous, unassigned, source-missing, and boundary-excluded coverage.

## Pre-journal compatibility

Given a workstream with no lifecycle journal:

- the collector and derivation fall back to artifact-timestamp inference;
- source is marked as `inferred`;
- stage intervals from analysis are used as-is;
- existing JSONL-based signals remain compatible;
- no attempt economics detail is available (empty attempts/episodes arrays).

## V2 and rollup compatibility

Given team-flow/v2 exports from both lifecycle-source and inferred-source workstreams:

- `myflow-team-flow/v2` exports retain Velocity, Distribution, Load, cycle and canonical Flow Time, nullable efficiency, privacy, and economics behavior;
- `myflow-flow-rollup/v1` exports select the latest compatible v2 per workstream;
- new additive fields (`returnEpisodeCount`, `lifecycleSource`) do not break rollup selection or validation;
- per-attempt developer rankings never enter team exports.

## Verify-to-Implement-to-Verify correction economics

Given a workstream with a Verify attempt that detects an implementation defect, returns to Implement, re-implements, and re-verifies:

- lifecycle journal records two Verify attempts (Verify ordinal 1 detected, Verify ordinal 2 passed);
- one correction episode with one canonical backward edge (Verify→Implement);
- only the correction interval's observations qualify as correction economics;
- the first Verify attempt's observations belong to that attempt, not the correction;
- the second Verify attempt's observations belong to that attempt;
- Implement observations inside the correction window are attributed to both the Implement attempt and the correction episode;
- `stageReturnCount=1`, `returnEpisodeCount=1`.]
