#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readAndValidateModel } from "./check-model.mjs";

const requiredMarkdown = [
  "assessment.md",
  "evidence/inventory.md",
  "evidence/flows.md",
  "evidence/evolution.md",
];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function allModelIds(model) {
  const ids = new Set();
  for (const collection of ["sources", "inventory", "elements", "relationships", "interfaces", "flows", "data", "terms", "scenarios", "divergences", "claims", "diagrams"]) {
    for (const item of model[collection] ?? []) ids.add(item.id);
  }
  return ids;
}

function referencedIds(markdown) {
  return [...markdown.matchAll(/\[model:([a-z0-9-]+)\]/g)].map((match) => match[1]);
}

async function main() {
  const args = process.argv.slice(2);
  const assessmentArgument = args.find((argument, index) => !argument.startsWith("--") && args[index - 1] !== "--html-skill-dir");
  if (!assessmentArgument) throw new Error("Usage: check-assessment.mjs <assessment-dir> --html-skill-dir <path>");
  const htmlFlag = args.indexOf("--html-skill-dir");
  const htmlSkillDir = htmlFlag >= 0 ? path.resolve(args[htmlFlag + 1]) : undefined;
  const directory = path.resolve(assessmentArgument);
  const errors = [];

  const modelPath = path.join(directory, "architecture-model.json");
  if (!(await exists(modelPath))) {
    errors.push(`${modelPath}: missing architecture-model.json`);
  }
  for (const relative of requiredMarkdown) {
    if (!(await exists(path.join(directory, relative)))) errors.push(`${relative}: missing required Markdown evidence`);
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }

  const { model, errors: modelErrors } = await readAndValidateModel(modelPath);
  errors.push(...modelErrors);
  if (model) {
    const ids = allModelIds(model);
    for (const relative of requiredMarkdown) {
      const markdown = await readFile(path.join(directory, relative), "utf8");
      const references = referencedIds(markdown);
      if (!references.length) errors.push(`${relative}: expected at least one [model:<id>] reference`);
      references.forEach((id) => {
        if (!ids.has(id)) errors.push(`${relative}: invalid model reference ${id}; expected an ID from architecture-model.json`);
      });
    }

    const packet = path.join(directory, "packet.html");
    const packetExists = await exists(packet);
    if (model.status === "ready") {
      if ((model.blockers ?? []).length) errors.push("$.blockers: ready bundles cannot retain blockers");
      if (!packetExists) errors.push("packet.html: a ready bundle requires a self-contained packet");
      if (!htmlSkillDir) errors.push("--html-skill-dir: a ready bundle requires an explicitly resolved html-design skill directory");
    } else if (!packetExists && !(model.blockers ?? []).some((blocker) => blocker.kind === "html-unavailable" && blocker.message?.trim())) {
      errors.push("$.blockers: an in-progress bundle without packet.html requires an actionable html-unavailable blocker");
    }

    if (packetExists && htmlSkillDir) {
      const checker = path.join(htmlSkillDir, "scripts", "check-artifact.mjs");
      if (!(await exists(checker))) errors.push(`${checker}: missing html-design artifact checker`);
      else {
        const result = spawnSync(process.execPath, [checker, packet, "--profile", "review-packet"], { encoding: "utf8" });
        if (result.status !== 0) errors.push(`packet.html: html-design review-packet check failed\n${result.stderr || result.stdout}`.trim());
      }
    }
  }

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`valid ${model.status} assessment bundle: ${directory}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
