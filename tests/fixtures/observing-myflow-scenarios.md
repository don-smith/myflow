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

## Telemetry migration

Given a later deployment where project-based Langfuse telemetry supplies exact lifecycle spans:

- preserve metric names and report structure;
- prefer exact telemetry intervals over JSONL timing inference;
- retain Pi JSONL as historical recovery evidence;
- do not double-count events represented by both sources;
- keep the analysis layer independent of the telemetry backend.
