import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  hashTree,
  parseCli,
  preflightModel,
  redactArgs,
  runControlledCase,
} from "../evals/architecture-assessment/run-evals.mjs";

const tempDir = () => mkdtemp(path.join(os.tmpdir(), "architecture-eval-test-"));

test("parses campaign commands and required options", () => {
  assert.deepEqual(
    parseCli([
      "baseline",
      "--models",
      "openai-codex/gpt-5.6-sol,anthropic/claude-sonnet-5",
      "--thinking",
      "high",
      "--output",
      "/tmp/out",
    ]),
    {
      command: "baseline",
      models: ["openai-codex/gpt-5.6-sol", "anthropic/claude-sonnet-5"],
      thinking: "high",
      output: "/tmp/out",
    },
  );
  assert.throws(() => parseCli(["baseline", "--thinking", "high"]), /--models/);
  assert.throws(() => parseCli(["unknown"]), /Unknown command/);
});

test("redacts inline credentials and sensitive environment arguments", () => {
  assert.deepEqual(
    redactArgs([
      "pi",
      "--api-key",
      "secret-value",
      "--append-system-prompt",
      "TOKEN=abc123",
      "safe",
    ]),
    ["pi", "--api-key", "[REDACTED]", "--append-system-prompt", "TOKEN=[REDACTED]", "safe"],
  );
});

test("tree hashes are stable and ignore generated assessment and Git data", async () => {
  const root = await tempDir();
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n");
  const before = await hashTree(root);
  await writeFile(path.join(root, "source.ts"), "export const value = 2;\n");
  const changed = await hashTree(root);
  assert.notEqual(before.hash, changed.hash);
  await writeFile(path.join(root, "source.ts"), "export const value = 1;\n");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(path.join(root, "assessment")));
  await writeFile(path.join(root, "assessment", "assessment.md"), "generated\n");
  assert.equal((await hashTree(root)).hash, before.hash);
});

test("model preflight distinguishes missing models and unavailable credentials", async () => {
  const fake = async (args) => {
    if (args[0] === "--list-models") return { code: 0, stdout: "provider model\nopenai-codex gpt-5.6-sol\n", stderr: "" };
    return { code: 2, stdout: '{"status":"invalid","reason":"invalid_state"}\n', stderr: "" };
  };
  assert.deepEqual(await preflightModel("openai-codex/gpt-5.6-sol", fake), {
    available: false,
    reason: "invalid_state",
  });
  assert.deepEqual(await preflightModel("anthropic/missing", fake), {
    available: false,
    reason: "model_not_found",
  });
});

test("controlled runs capture JSONL, final response, generated files, and clean source diff", async () => {
  const root = await tempDir();
  const fixture = path.join(root, "fixture");
  const output = path.join(root, "output");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(fixture));
  await writeFile(path.join(fixture, "source.ts"), "export const value = 1;\n");
  const fakePi = path.join(root, "fake-pi.mjs");
  await writeFile(
    fakePi,
    `#!/usr/bin/env node\nimport { mkdir, writeFile } from "node:fs/promises";\nawait mkdir("assessment", { recursive: true });\nawait writeFile("assessment/assessment.md", "# Assessment\\nsource.ts:1\\n");\nconsole.log(JSON.stringify({ type: "session", version: 3, id: "fake", cwd: process.cwd() }));\nconsole.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }] } }));\n`,
    { mode: 0o755 },
  );

  const result = await runControlledCase({
    caseDefinition: { id: "sample", assertions: [] },
    fixturePath: fixture,
    prompt: "Assess it",
    promptPath: path.join(root, "prompt.md"),
    model: "openai-codex/gpt-5.6-sol",
    thinking: "high",
    outputDir: output,
    piCommand: fakePi,
    timeoutMs: 5_000,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.sourceDiff.clean, true);
  assert.match(await readFile(path.join(output, "events.jsonl"), "utf8"), /message_end/);
  assert.equal(await readFile(path.join(output, "final-response.md"), "utf8"), "done\n");
  assert.match(await readFile(path.join(output, "assessment", "assessment.md"), "utf8"), /source\.ts:1/);
});

test("controlled runs fail source mutation and report timeout", async () => {
  const root = await tempDir();
  const fixture = path.join(root, "fixture");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(fixture));
  await writeFile(path.join(fixture, "source.ts"), "before\n");

  const mutator = path.join(root, "mutator.mjs");
  await writeFile(mutator, '#!/usr/bin/env node\nimport { writeFile } from "node:fs/promises";\nawait writeFile("source.ts", "after\\n");\n', { mode: 0o755 });
  const mutation = await runControlledCase({
    caseDefinition: { id: "mutation", assertions: [] },
    fixturePath: fixture,
    prompt: "Assess it",
    promptPath: path.join(root, "prompt.md"),
    model: "fake/model",
    thinking: "high",
    outputDir: path.join(root, "mutation-output"),
    piCommand: mutator,
    timeoutMs: 5_000,
  });
  assert.equal(mutation.status, "failed");
  assert.equal(mutation.sourceDiff.clean, false);

  const sleeper = path.join(root, "sleeper.mjs");
  await writeFile(sleeper, '#!/usr/bin/env node\nawait new Promise((resolve) => setTimeout(resolve, 10_000));\n', { mode: 0o755 });
  const timeout = await runControlledCase({
    caseDefinition: { id: "timeout", assertions: [] },
    fixturePath: fixture,
    prompt: "Assess it",
    promptPath: path.join(root, "prompt.md"),
    model: "fake/model",
    thinking: "high",
    outputDir: path.join(root, "timeout-output"),
    piCommand: sleeper,
    timeoutMs: 25,
  });
  assert.equal(timeout.status, "failed");
  assert.equal(timeout.reason, "timeout");
});
