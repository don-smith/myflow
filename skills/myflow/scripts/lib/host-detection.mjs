/**
 * Host and session detection for stage-boundary events.
 *
 * MyFlow runs under several agents and none of them publish a shared way to name
 * themselves. Each agent that is known to export a session identifier gets one row
 * here; an agent that is not listed, or that is listed but exports nothing, simply
 * contributes no `executionRef`. A guess is worse than an omission, because the
 * lifecycle journal keeps whatever it is given forever.
 *
 * The variable names live in this module and nowhere else. Skill documentation
 * describes the behaviour ("the command records the host and session when the
 * environment names them") without naming a variable, so skill text stays
 * agent-neutral.
 */

/**
 * Known agents, in the order they are probed. `sessionVariable` must hold the
 * identifier of the session that emitted the event.
 *
 * - `pi`: from the stage-boundary design.
 * - `claude-code`: observed directly on 2026-09-18; the value matched the session
 *   identifier this repository's journal had been recording by hand.
 *
 * Codex, Cursor, Kilo Code, and OpenCode are deliberately absent. Their session
 * variables, if they have any, are confirmed during the Phase 7 install smoke
 * tests and added then.
 */
export const KNOWN_HOSTS = Object.freeze([
  Object.freeze({ host: "pi", sessionVariable: "PI_SESSION_ID" }),
  Object.freeze({ host: "claude-code", sessionVariable: "CLAUDE_CODE_SESSION_ID" }),
]);

function value(environment, name) {
  const found = environment?.[name];
  return typeof found === "string" && found.trim().length > 0 ? found.trim() : undefined;
}

/**
 * Build the `executionRef` for a lifecycle event from the environment.
 *
 * @param {Record<string, string | undefined>} [environment] process environment to read
 * @returns {{host: string, emittingSessionId: string} | undefined} `undefined` when no known
 *   variable is set, so the event carries no execution reference at all
 */
export function detectExecutionRef(environment = process.env) {
  for (const { host, sessionVariable } of KNOWN_HOSTS) {
    const emittingSessionId = value(environment, sessionVariable);
    if (emittingSessionId) return { host, emittingSessionId };
  }
  return undefined;
}
