---
name: research
description: Investigate a specific codebase or external question selected by a MyFlow workstream, record evidence in the workstream, and return to Scope, Design, or Plan with a recommendation.
argument-hint: "[alignment/design artifact path] [research question]"
shell-timeout: 10
---

# Research

Research is an optional specialist, not a mandatory workflow stage. Use it when Scope, Design, or Plan has a specific unanswered question whose answer changes risk, a decision, or the implementation/verification approach.

## Input and setup

1. Read `.myflow/repository-map.md` when present, then read `workstream.md` and the supplied upstream artifact fully.
2. Extract the workstream ID, research question, and decision it informs. Ask for a focused question if the input does not state one.
3. Resolve the workstream root from the map (default `.myflow/workstreams`).
4. Follow the repository's mapped instruction, secret-handling, and telemetry policy. Do not send sensitive source, credentials, or repository identifiers to external tools without approval.

## Investigation

- Prefer primary sources: applicable repository code/configuration, official documentation, specifications, first-party APIs, and authoritative operational material.
- Investigate only what answers the stated question. Do not turn a targeted question into a broad codebase audit.
- Use targeted subagents or research tools when they improve evidence quality; verify important claims against the primary source.
- Distinguish confirmed facts, inferences, and unresolved gaps.

## Output and return

1. Read `templates/research.md` relative to this skill.
2. Write the evidence-led artifact to:

   ```text
   <workstream-root>/<workstream-id>/research/<timestamp>_<topic>.md
   ```

3. Update `workstream.md` with the research artifact and the recommended return:
   - **Return to Scope** when findings change intent, acceptance criteria, non-goals, risk, or workflow depth.
   - **Continue to Design** when the question supports a structural decision.
   - **Continue to Plan** when the evidence confirms the lightweight or settled design path.
4. Present the artifact path, confidence/gaps, and exact next command. Do not silently advance past a changed Scope decision.

## Guardrails

- Do not choose a product direction that belongs to the developer; present evidence and trade-offs.
- Do not claim complete architectural understanding from targeted research.
- Do not create a competing plan or design artifact.
- Do not assume a generic notes directory; use the workstream path or the repository-map override.
