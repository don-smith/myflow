#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultTimeoutMs = 20 * 60 * 1000;
const knownCommands = new Set([
  "baseline",
  "candidate",
  "verify-baseline",
  "compare",
  "resonance-trial",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function parseCli(argv) {
  const [command, ...rest] = argv;
  if (!knownCommands.has(command)) throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  const parsed = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith("--")) throw new Error(`Unexpected argument: ${flag}`);
    const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    parsed[key] = value;
    index += 1;
  }

  if (["baseline", "candidate"].includes(command)) {
    if (!parsed.models) throw new Error(`${command} requires --models`);
    if (!parsed.thinking) throw new Error(`${command} requires --thinking`);
    if (!parsed.output) throw new Error(`${command} requires --output`);
    parsed.models = parsed.models.split(",").map((model) => model.trim()).filter(Boolean);
    if (parsed.cases) parsed.cases = parsed.cases.split(",").map((caseId) => caseId.trim()).filter(Boolean);
  }
  if (command === "candidate" && !parsed.skill) throw new Error("candidate requires --skill");
  if (command === "verify-baseline" && !parsed.output) throw new Error("verify-baseline requires --output");
  if (command === "compare" && (!parsed.baseline || !parsed.candidate)) {
    throw new Error("compare requires --baseline and --candidate");
  }
  return parsed;
}

export function redactArgs(args) {
  const secretFlags = new Set(["--api-key", "--token", "--password", "--secret"]);
  let redactNext = false;
  return args.map((argument) => {
    if (redactNext) {
      redactNext = false;
      return "[REDACTED]";
    }
    if (secretFlags.has(argument)) {
      redactNext = true;
      return argument;
    }
    return argument.replace(
      /\b([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD))=([^\s]+)/gi,
      "$1=[REDACTED]",
    );
  });
}

async function walkFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "assessment", "node_modules"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(root, absolute)));
    else if (entry.isFile()) files.push(path.relative(root, absolute));
  }
  return files.sort();
}

export async function hashTree(root) {
  const files = {};
  for (const relative of await walkFiles(root)) {
    files[relative] = sha256(await readFile(path.join(root, relative)));
  }
  return { hash: sha256(JSON.stringify(files)), files };
}

function diffTrees(before, after) {
  const beforePaths = new Set(Object.keys(before.files));
  const afterPaths = new Set(Object.keys(after.files));
  const added = [...afterPaths].filter((file) => !beforePaths.has(file)).sort();
  const deleted = [...beforePaths].filter((file) => !afterPaths.has(file)).sort();
  const changed = [...beforePaths]
    .filter((file) => afterPaths.has(file) && before.files[file] !== after.files[file])
    .sort();
  return { clean: added.length + deleted.length + changed.length === 0, added, deleted, changed };
}

function executeProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, options.timeoutMs)
      : undefined;
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({ code: null, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

async function defaultPiExecute(args) {
  return executeProcess("pi", args, { timeoutMs: 30_000 });
}

function modelParts(model) {
  const separator = model.indexOf("/");
  if (separator < 1) return { provider: "", id: model };
  return { provider: model.slice(0, separator), id: model.slice(separator + 1) };
}

export async function preflightModel(model, execute = defaultPiExecute) {
  const { provider, id } = modelParts(model);
  const listed = await execute(["--list-models", id]);
  const found = listed.code === 0 && listed.stdout
    .split("\n")
    .some((line) => {
      const columns = line.trim().split(/\s+/);
      return columns[0] === provider && columns[1] === id;
    });
  if (!found) return { available: false, reason: "model_not_found" };

  const auth = await execute(["auth", "check", "--model", model, "--json"]);
  let status;
  try {
    status = JSON.parse(auth.stdout.trim());
  } catch {
    return { available: false, reason: "auth_check_failed" };
  }
  if (auth.code !== 0 || status.status !== "ready") {
    return { available: false, reason: status.reason ?? status.status ?? "credentials_unavailable" };
  }
  return { available: true, authType: status.authType ?? "configured" };
}

async function copyAssessment(sourceRoot, outputDir) {
  const source = path.join(sourceRoot, "assessment");
  try {
    if ((await stat(source)).isDirectory()) await cp(source, path.join(outputDir, "assessment"), { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function finalResponse(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== "message_end" || event.message?.role !== "assistant") continue;
    return (event.message.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
  }
  return "";
}

async function collectAssessmentText(root) {
  const assessment = path.join(root, "assessment");
  try {
    const files = await walkFiles(assessment);
    const chunks = [];
    for (const file of files) {
      if (/\.(?:md|json|html|txt)$/i.test(file)) chunks.push(await readFile(path.join(assessment, file), "utf8"));
    }
    return chunks.join("\n");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function scoreAssertions(assertions, text) {
  return assertions.map((assertion) => {
    const normalized = text.toLowerCase();
    let passed = false;
    if (assertion.kind === "contains-all") {
      passed = assertion.values.every((value) => normalized.includes(value.toLowerCase()));
    } else if (assertion.kind === "contains-any") {
      passed = assertion.values.some((value) => normalized.includes(value.toLowerCase()));
    } else if (assertion.kind === "not-regex") {
      passed = !new RegExp(assertion.value, "i").test(text);
    } else {
      throw new Error(`Unsupported assertion kind: ${assertion.kind}`);
    }
    return { ...assertion, passed };
  });
}

async function runFixtureSetup(root) {
  const setup = path.join(root, ".eval", "setup-history.mjs");
  try {
    await stat(setup);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const result = await executeProcess(process.execPath, [setup], { cwd: root, timeoutMs: 30_000 });
  if (result.code !== 0) throw new Error(`Fixture setup failed: ${result.stderr}`);
}

export async function runControlledCase(options) {
  const startedAt = new Date();
  const workingParent = await mkdtemp(path.join(os.tmpdir(), "architecture-assessment-eval-"));
  const workingRoot = path.join(workingParent, "repository");
  await cp(options.fixturePath, workingRoot, { recursive: true });
  await runFixtureSetup(workingRoot);
  const fixtureBefore = await hashTree(workingRoot);
  const promptHash = sha256(options.prompt);
  const outputDir = options.outputDir;
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const args = [
    "--mode", "json",
    "--no-session",
    "--no-skills",
    "--no-context-files",
    "--no-extensions",
    "--no-prompt-templates",
    "--no-themes",
    "--no-approve",
    "--tools", "read,bash,write,edit",
    "--model", options.model,
    "--thinking", options.thinking,
  ];
  if (options.skillPath) args.push("--skill", path.resolve(options.skillPath));
  args.push(options.prompt);

  const piCommand = options.piCommand ?? "pi";
  const result = await executeProcess(piCommand, args, {
    cwd: workingRoot,
    timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
    env: {
      ...process.env,
      PI_SKIP_VERSION_CHECK: "1",
      PI_TELEMETRY: "0",
    },
  });
  const fixtureAfter = await hashTree(workingRoot);
  const sourceDiff = diffTrees(fixtureBefore, fixtureAfter);
  const events = result.stdout
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  const response = finalResponse(events);
  const assessmentText = await collectAssessmentText(workingRoot);
  const assertions = scoreAssertions(options.caseDefinition.assertions ?? [], `${response}\n${assessmentText}`);
  const durationMs = Date.now() - startedAt.getTime();

  await writeFile(path.join(outputDir, "events.jsonl"), result.stdout);
  await writeFile(path.join(outputDir, "stderr.log"), result.stderr);
  await writeFile(path.join(outputDir, "final-response.md"), `${response}${response.endsWith("\n") ? "" : "\n"}`);
  await copyAssessment(workingRoot, outputDir);

  let piVersion = "unknown";
  if (piCommand === "pi") {
    const version = await executeProcess("pi", ["--version"], { timeoutMs: 10_000 });
    if (version.code === 0) piVersion = version.stdout.trim();
  }
  const reason = result.timedOut
    ? "timeout"
    : !sourceDiff.clean
      ? "source_mutation"
      : result.code !== 0
        ? "pi_exit"
        : undefined;
  const record = {
    case: options.caseDefinition.id,
    status: reason ? "failed" : "completed",
    ...(reason ? { reason } : {}),
    model: options.model,
    thinking: options.thinking,
    piVersion,
    startedAt: startedAt.toISOString(),
    durationMs,
    promptPath: options.promptPath,
    promptHash,
    fixtureHash: fixtureBefore.hash,
    command: redactArgs([piCommand, ...args]),
    exitStatus: result.code,
    signal: result.signal ?? null,
    sourceDiff,
    assertions,
    passed: !reason && assertions.every((assertion) => assertion.passed),
  };
  await writeFile(path.join(outputDir, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
  await rm(workingParent, { recursive: true, force: true });
  return record;
}

async function loadConfiguration() {
  return JSON.parse(await readFile(path.join(scriptDir, "evals.json"), "utf8"));
}

function outputFor(root, model, caseId) {
  const { provider, id } = modelParts(model);
  return path.join(path.resolve(root), provider || "unknown", id.replaceAll("/", "__"), caseId);
}

async function runCampaign(options) {
  const config = await loadConfiguration();
  const cases = options.cases
    ? config.cases.filter((caseDefinition) => options.cases.includes(caseDefinition.id))
    : config.cases;
  if (options.cases && cases.length !== options.cases.length) {
    const found = new Set(cases.map((caseDefinition) => caseDefinition.id));
    throw new Error(`Unknown cases: ${options.cases.filter((caseId) => !found.has(caseId)).join(", ")}`);
  }
  const campaignStartedAt = new Date().toISOString();
  const runs = [];
  for (const model of options.models) {
    const preflight = await preflightModel(model);
    if (!preflight.available) {
      for (const caseDefinition of cases) {
        const gap = {
          case: caseDefinition.id,
          status: "unavailable",
          model,
          thinking: options.thinking,
          reason: preflight.reason,
        };
        const directory = outputFor(options.output, model, caseDefinition.id);
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, "run.json"), `${JSON.stringify(gap, null, 2)}\n`);
        runs.push(gap);
      }
      continue;
    }

    for (const caseDefinition of cases) {
      const fixturePath = path.join(scriptDir, caseDefinition.fixture);
      const promptPath = path.join(scriptDir, caseDefinition.prompt);
      const prompt = await readFile(promptPath, "utf8");
      const run = await runControlledCase({
        caseDefinition,
        fixturePath,
        prompt,
        promptPath: path.relative(process.cwd(), promptPath),
        model,
        thinking: options.thinking,
        outputDir: outputFor(options.output, model, caseDefinition.id),
        skillPath: options.skill,
      });
      runs.push(run);
    }
  }

  const summary = {
    campaign: options.command,
    startedAt: campaignStartedAt,
    completedAt: new Date().toISOString(),
    models: options.models,
    thinking: options.thinking,
    cases: cases.map((caseDefinition) => caseDefinition.id),
    expectedRuns: options.models.length * cases.length,
    completedRuns: runs.filter((run) => run.status === "completed").length,
    unavailableRuns: runs.filter((run) => run.status === "unavailable").length,
    failedRuns: runs.filter((run) => run.status === "failed").length,
    assertionMisses: runs.flatMap((run) =>
      (run.assertions ?? []).filter((assertion) => !assertion.passed).map((assertion) => ({
        model: run.model,
        case: run.case,
        assertion: assertion.id,
        description: assertion.description,
      })),
    ),
    runs,
  };
  await mkdir(path.resolve(options.output), { recursive: true });
  await writeFile(path.join(path.resolve(options.output), "campaign-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function verifyBaseline(output) {
  const summary = JSON.parse(await readFile(path.join(path.resolve(output), "campaign-summary.json"), "utf8"));
  const accounted = summary.completedRuns + summary.unavailableRuns + summary.failedRuns;
  const problems = [];
  if (accounted !== summary.expectedRuns) problems.push(`expected ${summary.expectedRuns} accounted runs, found ${accounted}`);
  if (summary.failedRuns) problems.push(`${summary.failedRuns} runs failed execution or source-integrity checks`);
  if (!summary.assertionMisses.length) problems.push("baseline campaign recorded no skill-relevant miss");
  const mutated = summary.runs.filter((run) => run.sourceDiff && !run.sourceDiff.clean);
  if (mutated.length) problems.push(`${mutated.length} runs changed fixture source`);
  if (problems.length) throw new Error(problems.join("; "));
  console.log(`Baseline verified: ${summary.completedRuns} completed, ${summary.unavailableRuns} unavailable, ${summary.assertionMisses.length} skill-relevant misses.`);
}

async function compareCampaigns(baselinePath, candidatePath) {
  const baseline = JSON.parse(await readFile(path.join(path.resolve(baselinePath), "campaign-summary.json"), "utf8"));
  const candidate = JSON.parse(await readFile(path.join(path.resolve(candidatePath), "campaign-summary.json"), "utf8"));
  const baselineRuns = new Map(baseline.runs.map((run) => [`${run.model}:${run.case}`, run]));
  const problems = [];
  for (const run of candidate.runs) {
    if (run.status === "unavailable") continue;
    const red = baselineRuns.get(`${run.model}:${run.case}`);
    if (!red) problems.push(`missing baseline for ${run.model}/${run.case}`);
    else if (red.promptHash !== run.promptHash || red.fixtureHash !== run.fixtureHash) {
      problems.push(`hash mismatch for ${run.model}/${run.case}`);
    }
    if (run.status !== "completed") problems.push(`candidate run failed for ${run.model}/${run.case}`);
    if (run.sourceDiff && !run.sourceDiff.clean) problems.push(`candidate changed source for ${run.model}/${run.case}`);
    if (run.assertions?.some((assertion) => !assertion.passed)) problems.push(`candidate assertions failed for ${run.model}/${run.case}`);
  }
  if (problems.length) throw new Error(problems.join("; "));
  console.log(`Candidate comparison passed for ${candidate.completedRuns} completed runs; ${candidate.unavailableRuns} unavailable runs retained as gaps.`);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (["baseline", "candidate"].includes(options.command)) {
    const summary = await runCampaign(options);
    console.log(JSON.stringify({
      campaign: summary.campaign,
      expectedRuns: summary.expectedRuns,
      completedRuns: summary.completedRuns,
      unavailableRuns: summary.unavailableRuns,
      failedRuns: summary.failedRuns,
      assertionMisses: summary.assertionMisses.length,
    }, null, 2));
    if (summary.failedRuns) process.exitCode = 1;
  } else if (options.command === "verify-baseline") {
    await verifyBaseline(options.output);
  } else if (options.command === "compare") {
    await compareCampaigns(options.baseline, options.candidate);
  } else {
    throw new Error("resonance-trial is added with the tracked trial definition in Phase 5");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
