import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const skillDir = path.join(root, "skills/architecture-assessment");
const skillPath = path.join(skillDir, "SKILL.md");

async function skillText() {
  return readFile(skillPath, "utf8");
}

test("declares valid discovery metadata and invocation shape", async () => {
  const text = await skillText();
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatter, "missing YAML frontmatter");
  assert.match(frontmatter[1], /^name: architecture-assessment$/m);
  assert.match(frontmatter[1], /^description: Use when .+$/m);
  assert.match(frontmatter[1], /^argument-hint: <alignment-or-research-artifact> \[target\]$/m);
  assert.match(text, /architecture-assessment <alignment-or-research-artifact> \[target\]/);
});

test("resolves repository policy and refuses unindexed or unclear assessments", async () => {
  const text = await skillText();
  assert.match(text, /resolve-repository-map\.mjs discover --cwd/);
  assert.match(text, /selected repository map/);
  assert.match(text, /return to Scope/i);
  assert.match(text, /missing workstream|no workstream/i);
  assert.match(text, /unclear scope|absent drivers/i);
});

test("requires exhaustive read-only recovery with progressive evidence", async () => {
  const text = await skillText();
  assert.match(text, /enumerate the full approved scope/i);
  assert.match(text, /read every included production file/i);
  assert.match(text, /file-and-line evidence/i);
  assert.match(text, /write.*progressively|persist.*progressively/i);
  assert.match(text, /never edit.*product source/i);
  assert.match(text, /inventory\.md/);
  assert.match(text, /architecture-model\.json/);
  assert.match(text, /confirmed current.*code or configuration evidence/is);
  assert.match(text, /current.*intended.*separate/is);
});

test("keeps factual validation before judgment and triage at the end", async () => {
  const text = await skillText();
  const scope = text.indexOf("Checkpoint 1");
  const facts = text.indexOf("Checkpoint 2");
  const judgment = text.indexOf("Apply assessment lenses");
  const triage = text.indexOf("Checkpoint 3");
  assert.ok(scope >= 0 && facts > scope && judgment > facts && triage > judgment);
  assert.match(text, /accept, reject, or defer/i);
  assert.match(text, /Do not assess before factual correction/i);
});

test("composes architecture skills without nesting their workflows", async () => {
  const text = await skillText();
  assert.match(text, /REQUIRED BACKGROUND.*architecture-review/i);
  assert.match(text, /Do not invoke `architecture-review`/);
  assert.match(text, /REQUIRED BACKGROUND.*codebase-design/i);
  for (const term of ["module", "interface", "seam", "adapter", "depth", "leverage", "locality"]) {
    assert.match(text, new RegExp(`\\b${term}\\b`, "i"));
  }
  assert.match(text, /CONDITIONAL BACKGROUND.*domain-modeling/i);
  assert.match(text, /same-name|synonym|homonym|context translation/i);
  assert.match(text, /REQUIRED SUB-SKILL.*html-design/i);
  assert.match(text, /check-artifact\.mjs.*--profile review-packet/is);
  assert.match(text, /cannot become `ready`|must not become `ready`/i);
  assert.match(text, /controlled evaluation.*do not search.*html-design/is);
  assert.match(text, /controlled evaluation.*omit `packet\.html`/is);
  assert.match(text, /controlled evaluation.*do not run.*build|package commands/is);
});

test("defines the workstream-local bundle and checker commands", async () => {
  const text = await skillText();
  for (const relative of [
    "assessment/assessment.md",
    "assessment/architecture-model.json",
    "assessment/evidence/inventory.md",
    "assessment/evidence/flows.md",
    "assessment/evidence/evolution.md",
    "assessment/packet.html",
  ]) assert.match(text, new RegExp(relative.replaceAll("/", "\\/")));
  assert.match(text, /check-model\.mjs/);
  assert.match(text, /check-assessment\.mjs/);
  assert.match(text, /html-unavailable/);
  assert.match(text, /bulk formatting/);
  assert.match(text, /history.*confidence/is);
  assert.match(text, /Cargo\.lock/);
  assert.match(text, /isolated copy/);
  assert.match(text, /source.*before and after/is);
});

test("keeps every reference one hop away and the main skill under budget", async () => {
  const text = await skillText();
  const lines = text.trimEnd().split("\n");
  assert.ok(lines.length < 500, `SKILL.md has ${lines.length} lines`);

  const linked = new Set([...text.matchAll(/\]\(references\/([^)]+\.md)\)/g)].map((match) => match[1]));
  const files = (await readdir(path.join(skillDir, "references"))).filter((file) => file.endsWith(".md"));
  assert.deepEqual([...linked].sort(), files.sort());
  for (const file of files) {
    const reference = await readFile(path.join(skillDir, "references", file), "utf8");
    if (reference.trimEnd().split("\n").length > 100) assert.match(reference, /^# .+\n\n## Contents/m);
    assert.doesNotMatch(reference, /\]\(\.\.\/references\//, `${file} creates nested reference navigation`);
  }
});
