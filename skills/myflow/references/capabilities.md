# Host capabilities

MyFlow runs in several agents, and they do not offer the same facilities. A skill therefore names the capability it needs, never a particular tool, command, or agent. This file defines the four capabilities skills depend on and the fallback each one takes when the host does not provide it.

A fallback changes how the work is done, never what the work is. Do not drop a step, narrow a scope, or weaken a gate because the preferred shape is unavailable. Where a skill states its own stricter rule, that rule wins.

## Structured questions

Structured interaction is preferred: ask through the host's structured question facility when it has one, so the developer gets the question, its choices, and any recommended answer as a single interaction.

A plain-text question with the same wording and the same choices is the host-neutral fallback. Ask it and wait for the answer.

The wording and the choice set belong to the asking skill. Neither changes with the host.

## Fresh context

Some work must be judged by a reader who has not already formed an opinion: an implementation phase, a review lane, an independent verification.

Use a subagent when the host provides one. Otherwise use a fresh session whose input is the artifact and the brief the subagent would have received: the accepted plan, the phase or lane scope, the evidence, and the paths that carry it. Write the brief down before starting it, so the fresh session needs no conversation history.

A missing subagent facility is a change of mechanism. It is never a reason to do the work in the current context, to skip it, or to record it as unavailable.

## Parallel work

Run independent units of work in parallel when the host supports it. Otherwise run them one after another, in the order the skill lists them.

Sequential execution keeps every unit, its full scope, and its own evidence. Merge or drop a unit only when the skill says it may be dropped.

## Read-only exploration

Grounding a question in the codebase, locating a seam, or checking a fact is exploration, not change. Use a read-only subagent or the host's search facilities when available, so the exploration keeps its findings out of the working session's context.

Otherwise search directly in the current session and write nothing. Exploration reports what it found, including finding nothing; it does not edit files.
