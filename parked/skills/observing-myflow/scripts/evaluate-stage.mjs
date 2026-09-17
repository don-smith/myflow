#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepositoryContext } from "../../../../skills/myflow/scripts/lib/repository-context.mjs";
import { canonicalJson, lifecycleAttemptId } from "../../../../skills/myflow/scripts/lib/lifecycle-contract.mjs";
import {
  readLifecycleJournal,
  validateLifecycleJournal,
} from "../../../../skills/myflow/scripts/lib/lifecycle-store.mjs";
import { reduceLifecycle } from "../../../../skills/myflow/scripts/lib/lifecycle-reducer.mjs";
import { appendPrivateRecord } from "../../../../skills/myflow/scripts/lib/private-store.mjs";
import {
  EVALUATOR_VERSION,
  FEEDBACK_COVERAGE,
  RULE_SET_VERSION,
  STAGE_REVIEW_SCHEMA_VERSION,
  deriveOutcome,
  publicProjection,
  reviewId,
  validateStageReview,
} from "./lib/stage-review-contract.mjs";
import { PREDICATE_SETS } from "./lib/stage-predicates.mjs";
import {
  buildReturnAssessment,
  validateReturnAssessmentInput,
} from "./lib/return-assessment.mjs";

const scriptPath = fileURLToPath(import.meta.url);

const OPTION_NAMES = new Map([
  ["--repository-root", "repositoryRoot"],
  ["--state-root", "stateRoot"],
  ["--workstream-id", "workstreamId"],
  ["--stage", "canonicalStage"],
  ["--attempt-id", "attemptId"],
  ["--source", "source"],
  ["--idempotency-key", "idempotencyKey"],
  ["--return-episode-id", "episodeId"],
  ["--trigger-source", "triggerSource"],
  ["--change-kind", "changeKind"],
  ["--nature", "nature"],
  ["--late-discovery", "lateDiscovery"],
  ["--confidence", "confidence"],
  ["--missing-evidence", "missingEvidence"],
  ["--counterevidence", "counterevidence"],
  ["--earliest-detecting-stage", "earliestDetectingStage"],
  ["--earlier-check", "earlierCheck"],
  ["--required-information", "requiredInformation"],
  ["--information-existed", "informationExisted"],
  ["--expected-signal", "expectedSignal"],
  ["--cost-class", "costClass"],
  ["--false-positive-risk", "falsePositiveRisk"],
  ["--quality-guardrail", "qualityGuardrail"],
]);

const usage = `usage: evaluate-stage.mjs --workstream-id <id> --stage <Scope|Plan|Implement|Verify|Close> --attempt-id <id> --source <source> --idempotency-key <key>
  [--repository-root <root>] [--state-root <root>]
  [--return-episode-id <id> --trigger-source <src> --change-kind <kind> --nature <nature> --late-discovery <true|false|unknown> --confidence <high|medium|low>]
  [--earliest-detecting-stage <stage> --earlier-check <check> --required-information <info> --information-existed <evidence> --expected-signal <signal> --cost-class <lower|similar|higher> --false-positive-risk <risk> --quality-guardrail <guard>]
  [--missing-evidence <field>...] [--counterevidence <field>...]`;

function parseArguments(arguments_) {
  const options = { missingEvidence: [], counterevidence: [] };
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!value) throw new Error(usage);
    if (flag === "--missing-evidence") {
      options.missingEvidence.push(value);
      continue;
    }
    if (flag === "--counterevidence") {
      options.counterevidence.push(value);
      continue;
    }
    const name = OPTION_NAMES.get(flag);
    if (!name) throw new Error(`unknown option: ${flag}`);
    options[name] = value;
  }
  if (!options.workstreamId || !options.canonicalStage || !options.attemptId) throw new Error(usage);
  if (!options.source || !options.idempotencyKey) throw new Error(usage);
  return options;
}

async function readFeedbackRecords(repositoryRoot, workstreamId, attemptId, options) {
  try {
    const { privateObservationRoot } = await import("../../../../skills/myflow/scripts/lib/private-store.mjs");
    const root = privateObservationRoot(repositoryRoot, {
      stateRoot: options.stateRoot,
      home: options.home,
    });
    const feedbackPath = join(root, workstreamId, "stage-feedback", "events.jsonl");
    const text = await readFile(feedbackPath, "utf8");
    const records = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    return records.findLast((r) => r.attemptId === attemptId) ?? null;
  } catch {
    return null;
  }
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    const repositoryRoot = resolve(options.repositoryRoot ?? process.cwd());
    const repositoryContext = resolveRepositoryContext(repositoryRoot);
    const repository = repositoryContext.identity;
    const journalPath = join(
      repositoryRoot,
      ".myflow",
      "workstreams",
      options.workstreamId,
      "lifecycle",
      "events.jsonl",
    );

    let journal;
    try {
      journal = await readLifecycleJournal(journalPath, { allowCrashTail: false });
    } catch {
      process.stderr.write("lifecycle journal not found or invalid\n");
      process.exitCode = 1;
      return;
    }

    const lifecycleState = reduceLifecycle(journal.events);
    const attempt = lifecycleState.attempts.find(
      (a) => a.attemptId === options.attemptId,
    );
    if (!attempt) {
      process.stderr.write(`attempt ${options.attemptId} not found in lifecycle journal\n`);
      process.exitCode = 1;
      return;
    }
    if (attempt.canonicalStage !== options.canonicalStage) {
      process.stderr.write(
        `attempt ${options.attemptId} belongs to ${attempt.canonicalStage}, not ${options.canonicalStage}\n`,
      );
      process.exitCode = 1;
      return;
    }

    const feedback = await readFeedbackRecords(
      repositoryRoot,
      options.workstreamId,
      options.attemptId,
      options,
    );

    const predicateFn = PREDICATE_SETS[options.canonicalStage];
    if (!predicateFn) {
      process.stderr.write(`unsupported canonical stage: ${options.canonicalStage}\n`);
      process.exitCode = 1;
      return;
    }

    const stageArtifacts = lifecycleState.acceptedArtifacts.filter(
      (a) => a.attemptId === options.attemptId,
    );

    const predicateResults = await predicateFn({
      lifecycleState,
      artifacts: stageArtifacts,
      feedback,
      repositoryRoot,
    });

    const outcome = deriveOutcome(options.canonicalStage, predicateResults, lifecycleState);

    let returnAssessment = null;
    if (options.episodeId) {
      const { episode } = validateReturnAssessmentInput(options, lifecycleState);
      returnAssessment = buildReturnAssessment(options, episode);
    }

    const feedbackStatus = feedback
      ? feedback.status
      : (lifecycleState.feedback.some(
          (f) => f.attemptId === options.attemptId && f.status === "pending",
        )
          ? "pending"
          : "missing");

    const artifactDigests = stageArtifacts.map((a) => ({
      path: a.artifactRef.path,
      digest: a.artifactRef.digest,
    }));

    const lifecycleDigest = createHash("sha256")
      .update(journal.events.map((e) => canonicalJson(e)).join("\n"))
      .digest("hex");

    const existingReviews = [];
    try {
      const { privateObservationRoot } = await import("../../../../skills/myflow/scripts/lib/private-store.mjs");
      const root = privateObservationRoot(repositoryRoot, {
        stateRoot: options.stateRoot,
        home: options.home,
      });
      const reviewsPath = join(root, options.workstreamId, "stage-reviews", "events.jsonl");
      const text = await readFile(reviewsPath, "utf8");
      const records = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
      for (const r of records) {
        if (r.attemptId === options.attemptId) existingReviews.push(r);
      }
    } catch {
      // No existing reviews.
    }

    const revision = existingReviews.length + 1;

    const feedbackCoverage = feedbackStatus === "missing" &&
      lifecycleState.feedback.some(
        (f) => f.attemptId === options.attemptId && f.status === "requested",
      )
      ? "pending"
      : feedbackStatus;

    const review = {
      schemaVersion: STAGE_REVIEW_SCHEMA_VERSION,
      reviewId: reviewId({
        repository,
        workstreamId: options.workstreamId,
        attemptId: options.attemptId,
        revision,
        idempotencyKey: options.idempotencyKey,
      }),
      createdAt: new Date().toISOString(),
      repository,
      workstreamId: options.workstreamId,
      attemptId: options.attemptId,
      attemptOrdinal: attempt.ordinal,
      canonicalStage: options.canonicalStage,
      revision,
      inputs: {
        lifecycleEventCount: journal.events.length,
        lifecycleLastEventId: lifecycleState.lastEventId,
        lifecycleDigest,
        artifactDigests,
        feedbackStatus,
        feedbackRef: feedback?.privateRef ?? null,
      },
      evaluator: {
        evaluatorVersion: EVALUATOR_VERSION,
        ruleSetVersion: RULE_SET_VERSION,
      },
      predicates: predicateResults,
      outcome,
      feedbackCoverage,
      developerExperience: feedbackCoverage === "recorded" && feedback ? feedback.rating : null,
      returnAssessment,
      limitations: [
        "Stage predicates are mechanical section checks only.",
        "Prose quality and argument strength are not assessed.",
        outcome === "unknown"
          ? "Unknown outcome indicates missing or unparseable evidence."
          : null,
      ].filter(Boolean),
    };

    validateStageReview(review);

    // appendPrivateRecord requires recordId matching reviewId.
    review.recordId = review.reviewId;

    const stored = await appendPrivateRecord({
      repositoryRoot,
      stateRoot: options.stateRoot,
      home: options.home,
      workstreamId: options.workstreamId,
      category: "stage-reviews",
      record: review,
    });

    const projected = publicProjection(review);

    process.stdout.write(
      JSON.stringify({
        schemaVersion: STAGE_REVIEW_SCHEMA_VERSION,
        reviewId: review.reviewId,
        attemptId: review.attemptId,
        canonicalStage: review.canonicalStage,
        outcome: review.outcome,
        revision: review.revision,
        privateRef: stored.privateRef,
        duplicate: stored.duplicate,
        publicProjection: projected,
      }) + "\n",
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.message === usage ? 2 : 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();