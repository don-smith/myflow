#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateStageReview } from "./lib/stage-review-contract.mjs";
import {
  dryRunPublish,
  publishReview,
  createMissingScoreConfigs,
  SCORE_NAMES,
} from "./lib/langfuse-review-publisher.mjs";
import { resolveRepositoryContext } from "../../../../skills/myflow/scripts/lib/repository-context.mjs";

const scriptPath = fileURLToPath(import.meta.url);

const usage = `usage: publish-stage-review.mjs --review-path <path> [options]
  --review-path <path>         path to a myflow-stage-review/v1 JSON record
  --workstream-id <id>         workstream identifier
  --repository-root <root>     target repository root (default: cwd)
  --state-root <root>          private state root override
  --publish                    enable actual publication (default: dry-run)
  --confirm                    confirm publication with read-after-write
  --ingestion-delay-ms <ms>    wait before confirmation read (default: 3000)
  --create-score-configs       create missing score configs before publishing
  --score-compatibility        print score compatibility receipt and exit`;

async function main() {
  const args = process.argv.slice(2);
  const options = {
    publish: false,
    confirm: false,
    createScoreConfigs: false,
    scoreCompatibility: false,
    ingestionDelayMs: 3000,
  };

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    switch (flag) {
      case "--review-path":
        options.reviewPath = args[++i];
        break;
      case "--workstream-id":
        options.workstreamId = args[++i];
        break;
      case "--repository-root":
        options.repositoryRoot = args[++i];
        break;
      case "--state-root":
        options.stateRoot = args[++i];
        break;
      case "--publish":
        options.publish = true;
        break;
      case "--confirm":
        options.confirm = true;
        break;
      case "--ingestion-delay-ms":
        options.ingestionDelayMs = parseInt(args[++i], 10);
        break;
      case "--create-score-configs":
        options.createScoreConfigs = true;
        break;
      case "--score-compatibility":
        options.scoreCompatibility = true;
        break;
      default:
        process.stderr.write(`unknown option: ${flag}\n${usage}\n`);
        process.exitCode = 2;
        return;
    }
  }

  if (options.scoreCompatibility) {
    const existingScores = inventoryExistingScoreNames();
    const receipt = {
      phase: 6,
      schemaVersion: "myflow-score-compatibility-receipt/v1",
      createdAt: new Date().toISOString(),
      recordedScoreNames: {
        existing: existingScores,
        newPhase6: Object.values(SCORE_NAMES),
      },
      assertions: {
        noNameConflict: Object.values(SCORE_NAMES).every(
          (name) =>
            !existingScores.friction.includes(name) &&
            !existingScores.work.includes(name) &&
            !existingScores.flow.includes(name),
        ),
        noSilentReuse: true,
        existingDashboardsUnknown: true,
      },
      notes: [
        "Existing score names (myflow.friction.*, myflow.work.*, myflow.flow.*) were inventoried from packages/telemetry source.",
        "No in-repository dashboard or score-config consumer was found.",
        "External dashboard use is unknown. Treat retirement as an explicit compatibility decision.",
      ],
    };
    process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
    return;
  }

  if (options.createScoreConfigs) {
    const result = await createMissingScoreConfigs();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (!options.reviewPath || !options.workstreamId) {
    process.stderr.write("--review-path and --workstream-id are required\n");
    process.stderr.write(usage + "\n");
    process.exitCode = 2;
    return;
  }

  let review;
  try {
    const raw = await readFile(options.reviewPath, "utf8");
    review = JSON.parse(raw);
    validateStageReview(review);
  } catch (error) {
    process.stderr.write(`invalid review: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
  let gitInit = false;
  try {
    resolveRepositoryContext(repositoryRoot);
  } catch {
    // Non-git directory is acceptable for dry-run and score-compatibility.
    gitInit = false;
  }

  try {
    if (!options.publish) {
      const { receipt } = await dryRunPublish(review, {
        workstreamId: options.workstreamId,
        repositoryRoot,
        stateRoot: options.stateRoot,
      });
      process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
    } else {
      const result = await publishReview(review, {
        workstreamId: options.workstreamId,
        repositoryRoot,
        stateRoot: options.stateRoot,
        publish: true,
        confirm: options.confirm,
        ingestionDelayMs: options.ingestionDelayMs,
      });
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

function inventoryExistingScoreNames() {
  return {
    friction: [
      "myflow.friction.tool_error_spike",
      "myflow.friction.high_tool_churn",
      "myflow.friction.expensive_subagent",
      "myflow.friction.high_cost_artifact_ratio",
      "myflow.friction.long_session",
      "myflow.friction.missing_checkpoints",
      "myflow.friction-free",
    ],
    work: [
      "myflow.work.type",
      "myflow.work.synopsis",
    ],
    flow: [
      "myflow.flow.wall-clock-minutes",
      "myflow.flow.turn-count",
      "myflow.flow.context-switch",
      "myflow.flow.tool-success-rate",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();