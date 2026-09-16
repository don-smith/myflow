#!/usr/bin/env node

import { resolve, join } from "node:path";

import { resolveRepositoryContext } from "./lib/repository-context.mjs";
import {
  appendLifecycleEvent,
  validateLifecycleJournal,
} from "./lib/lifecycle-store.mjs";

const COMMANDS = Object.freeze({
  "workstream-created": "workstream.created",
  "stage-entered": "stage.entered",
  "activity-entered": "activity.entered",
  "activity-completed": "activity.completed",
  "artifact-accepted": "artifact.accepted",
  "stage-blocked": "stage.blocked",
  "stage-unblocked": "stage.unblocked",
  "stage-completed": "stage.completed",
  "return-opened": "return.opened",
  "return-rerouted": "return.rerouted",
  "return-owner-ready": "return.owner-ready",
  "return-resumed": "return.resumed",
  "return-closed": "return.closed",
  "verification-completed": "verification.completed",
  "workstream-closed": "workstream.closed",
  "feedback-requested": "feedback.requested",
  "feedback-recorded": "feedback.recorded",
});

const OPTION_NAMES = new Map([
  ["--repository-root", "repositoryRoot"],
  ["--workstream-id", "workstreamId"],
  ["--journal", "journalPath"],
  ["--stage", "canonicalStage"],
  ["--activity", "owningActivity"],
  ["--source", "source"],
  ["--idempotency-key", "idempotencyKey"],
  ["--occurred-at", "occurredAt"],
  ["--artifact", "artifactPath"],
  ["--terminal-reason", "terminalReason"],
  ["--block-id", "blockId"],
  ["--reason", "reason"],
  ["--episode-id", "episodeId"],
  ["--detecting-stage", "detectingStage"],
  ["--detecting-activity", "detectingActivity"],
  ["--owning-stage", "initialOwningStage"],
  ["--owning-activity", "initialOwningActivity"],
  ["--route-stage", "owningStage"],
  ["--route-activity", "routeActivity"],
  ["--origin-attempt-id", "originAttemptId"],
  ["--trigger-source", "triggerSource"],
  ["--change-kind", "changeKind"],
  ["--verification-status", "verificationStatus"],
  ["--feedback-status", "feedbackStatus"],
  ["--private-ref", "privateRef"],
  ["--attempt-id", "targetAttemptId"],
  ["--execution-host", "executionHost"],
  ["--emitting-session", "emittingSessionId"],
  ["--grouping-session", "groupingSessionId"],
  ["--trace", "traceId"],
  ["--observation", "observationId"],
  ["--turn", "turnId"],
  ["--capability", "capability"],
]);

const usage = `usage: lifecycle-journal.mjs <validate|mutation> --workstream-id <id> [options]
mutations: ${Object.keys(COMMANDS).join(", ")}`;

function parseArguments(arguments_) {
  const [command, ...rest] = arguments_;
  if (command !== "validate" && !COMMANDS[command]) throw new Error(usage);
  const options = { command, evidenceRefs: [] };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!value) throw new Error(usage);
    if (flag === "--evidence-ref") {
      options.evidenceRefs.push(value);
      continue;
    }
    const name = OPTION_NAMES.get(flag);
    if (!name) throw new Error(`unknown option: ${flag}`);
    options[name] = value;
  }
  if (!options.workstreamId && !options.journalPath) throw new Error(usage);
  return options;
}

function executionReference(options) {
  const fields = {
    host: options.executionHost,
    emittingSessionId: options.emittingSessionId,
    groupingSessionId: options.groupingSessionId,
    traceId: options.traceId,
    observationId: options.observationId,
    turnId: options.turnId,
    capability: options.capability,
  };
  const present = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  return Object.keys(present).length > 0 ? present : undefined;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
    const journalPath = resolve(
      options.journalPath ??
        join(repositoryRoot, ".myflow", "workstreams", options.workstreamId, "lifecycle", "events.jsonl"),
    );

    if (options.command === "validate") {
      const result = await validateLifecycleJournal(journalPath);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (!result.valid) process.exitCode = 1;
      return;
    }

    const repositoryContext = resolveRepositoryContext(repositoryRoot);
    const {
      command,
      executionHost,
      emittingSessionId,
      groupingSessionId,
      traceId,
      observationId,
      turnId,
      capability,
      ...eventOptions
    } = options;
    delete eventOptions.journalPath;
    if (eventOptions.evidenceRefs.length === 0) delete eventOptions.evidenceRefs;
    const executionRef = executionReference(options);
    const result = await appendLifecycleEvent({
      ...eventOptions,
      journalPath,
      repositoryRoot: repositoryContext.root,
      repository: repositoryContext.identity,
      kind: COMMANDS[command],
      ...(executionRef ? { executionRef } : {}),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.message === usage ? 2 : 1;
  }
}

main();
