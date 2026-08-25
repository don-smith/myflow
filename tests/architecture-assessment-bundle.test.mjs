import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const skill = path.join(root, "skills/architecture-assessment");
const checker = path.join(skill, "scripts/check-assessment.mjs");
const tempDir = () => mkdtemp(path.join(os.tmpdir(), "architecture-bundle-test-"));

function run(directory, htmlSkillDir) {
  const args = [checker, directory];
  if (htmlSkillDir) args.push("--html-skill-dir", htmlSkillDir);
  return spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
}

async function makeBundle() {
  const directory = await tempDir();
  await mkdir(path.join(directory, "evidence"));
  await cp(path.join(skill, "templates/architecture-model.json"), path.join(directory, "architecture-model.json"));
  await cp(path.join(skill, "templates/assessment.md"), path.join(directory, "assessment.md"));
  await cp(path.join(skill, "templates/inventory.md"), path.join(directory, "evidence/inventory.md"));
  await cp(path.join(skill, "templates/flows.md"), path.join(directory, "evidence/flows.md"));
  await cp(path.join(skill, "templates/evolution.md"), path.join(directory, "evidence/evolution.md"));
  return directory;
}

test("accepts an in-progress bundle with an explicit HTML blocker", async () => {
  const directory = await makeBundle();
  const result = run(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /valid in-progress assessment bundle/);
});

test("rejects bad report and diagram model references", async () => {
  const reportBundle = await makeBundle();
  await writeFile(path.join(reportBundle, "assessment.md"), "# Assessment\n\nUnknown [model:el-missing].\n");
  const report = run(reportBundle);
  assert.equal(report.status, 1);
  assert.match(report.stderr, /assessment\.md/);
  assert.match(report.stderr, /el-missing/);

  const diagramBundle = await makeBundle();
  const modelPath = path.join(diagramBundle, "architecture-model.json");
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  model.diagrams[0].modelRefs.push("rel-missing");
  await writeFile(modelPath, `${JSON.stringify(model, null, 2)}\n`);
  const diagram = run(diagramBundle);
  assert.equal(diagram.status, 1);
  assert.match(diagram.stderr, /\$\.diagrams\[0\]\.modelRefs\[2\]/);
  assert.match(diagram.stderr, /rel-missing/);
});

test("rejects a falsely ready bundle without a checked packet", async () => {
  const directory = await makeBundle();
  const modelPath = path.join(directory, "architecture-model.json");
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  model.status = "ready";
  model.blockers = [];
  await writeFile(modelPath, `${JSON.stringify(model, null, 2)}\n`);
  const result = run(directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /packet\.html/);
  assert.match(result.stderr, /ready/);
});

test("delegates ready packet validation to the explicitly resolved html-design skill", async () => {
  const directory = await makeBundle();
  const modelPath = path.join(directory, "architecture-model.json");
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  model.status = "ready";
  model.blockers = [];
  await writeFile(modelPath, `${JSON.stringify(model, null, 2)}\n`);
  await writeFile(path.join(directory, "packet.html"), "<!doctype html><title>Checked packet</title>\n");

  const htmlSkill = path.join(await tempDir(), "html-design");
  await mkdir(path.join(htmlSkill, "scripts"), { recursive: true });
  await writeFile(
    path.join(htmlSkill, "scripts/check-artifact.mjs"),
    '#!/usr/bin/env node\nif (!process.argv[2].endsWith("packet.html") || process.argv[3] !== "--profile" || process.argv[4] !== "review-packet") process.exit(2);\n',
  );
  const result = run(directory, htmlSkill);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /valid ready assessment bundle/);
});
