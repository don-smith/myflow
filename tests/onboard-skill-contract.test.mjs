import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("onboard skill defines the repository-map discovery contract", async () => {
  const skill = await read("skills/onboard/SKILL.md");

  for (const requirement of [
    "resolve-repository-map.mjs",
    "target",
    "personal global",
    "existing repository-local",
    "Inspect before asking",
    "unknown",
    "authoritative source",
    "sensitive",
    "architecture review",
  ]) {
    assert.match(skill, new RegExp(requirement, "i"));
  }
});

test("onboard templates separate durable repository facts from run and evaluation records", async () => {
  const [map, report, evaluation] = await Promise.all([
    read("skills/onboard/templates/repository-map.md"),
    read("skills/onboard/templates/onboarding-report.md"),
    read("skills/onboard/templates/onboarding-evaluation.md"),
  ]);

  assert.match(map, /resolved repository-map path/);
  assert.match(report, /resolved repository-map path/);
  assert.match(evaluation, /resolved repository-map path/);
  assert.match(map, /## Operating instructions/);
  assert.match(map, /## Validation/);
  assert.match(map, /## Unknowns and decisions needed/);
  assert.match(report, /## MyFlow capability gaps/);
  assert.match(report, /## Evaluation handoff/);
  assert.match(evaluation, /## Scorecard/);
  assert.match(evaluation, /## Downstream evidence/);
});

test("initial map consumers defer to onboarding-discovered paths", async () => {
  const [domainModeling, architectureReview] = await Promise.all([
    read("skills/domain-modeling/SKILL.md"),
    read("skills/architecture-review/SKILL.md"),
  ]);

  assert.match(domainModeling, /repository-map\.md/);
  assert.match(architectureReview, /repository-map\.md/);
});
