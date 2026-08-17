import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mapConsumers = [
  "skills/architecture-review/SKILL.md",
  "skills/domain-modeling/SKILL.md",
  "skills/research/SKILL.md",
  "skills/create-handoff/SKILL.md",
  "skills/resume-handoff/SKILL.md",
  "skills/capturing-learnings/SKILL.md",
  "skills/writing-retros/SKILL.md",
  "skills/epiphany-tabling/SKILL.md",
];

test("retained map consumers use the resolver and avoid retired helper dependencies", async () => {
  for (const path of mapConsumers) {
    const skill = await readFile(path, "utf8");
    assert.match(skill, /resolve-repository-map\.mjs/);
    assert.doesNotMatch(skill, /_shared\/repo-store\.mjs/);
  }
});
