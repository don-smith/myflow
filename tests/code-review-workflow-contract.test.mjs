import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("code review pins complete scope through the active range helper", async () => {
  const [skill, packageJson] = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("package.json"),
  ]);

  assert.match(skill, /\$\{SKILL_DIR\}\/\_helpers\/review-range\.mjs/);
  for (const phrase of [
    "scope status",
    "base",
    "tip",
    "dirty state",
    "invalid",
    "empty",
    "blocked",
  ]) {
    assert.match(skill, new RegExp(phrase, "i"));
  }
  assert.match(skill, /changed[- ]files/i);
  assert.match(packageJson, /skills\/code-review\/_helpers\/review-range\.test\.mjs/);
});

test("code review runs three independent fresh-context lanes", async () => {
  const skill = await read("skills/code-review/SKILL.md");

  for (const phrase of [
    "Correctness and Risk",
    "Standards and Maintainability",
    "Spec Fidelity",
    "fresh-context",
    "in parallel",
    "security",
    "dependency",
    "accepted plan",
  ]) {
    assert.match(skill, new RegExp(phrase, "i"));
  }
  assert.match(skill, /subagent capability[^.]*unavailable[^.]*block/is);
  assert.doesNotMatch(skill, /two-axis|both sub-agents/i);
});

test("every retained finding has auditable evidence and deterministic severity", async () => {
  const [skill, template] = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("skills/code-review/templates/review.md"),
  ]);

  for (const document of [skill, template]) {
    for (const phrase of [
      "stable ID",
      "P0",
      "P1",
      "P2",
      "file:line",
      "quote",
      "failure mechanism",
      "affected behavior or requirement",
      "smallest fix",
    ]) {
      assert.match(document, new RegExp(phrase, "i"));
    }
  }
  assert.match(skill, /P0\/P1[^.]*independent[^.]*verif/is);
  assert.match(skill, /code and callers/i);
});

test("public workflow contract names the substantive review gate", async () => {
  const documents = await Promise.all([
    read("README.md"),
    read("docs/artifact-and-stage-boundary-contract.md"),
    read("docs/myflow-workflow-status-and-alignment.md"),
  ]);

  for (const document of documents) {
    assert.match(document, /Correctness and Risk/i);
    assert.match(document, /Standards and Maintainability/i);
    assert.match(document, /Spec Fidelity/i);
    assert.match(document, /P0\/P1[^.]*block/is);
    assert.match(document, /P2[^.]*does not block/is);
  }
});

test("review gate and durable artifact are explicit", async () => {
  const [skill, template, validationTemplate] = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("skills/code-review/templates/review.md"),
    read("skills/validate/templates/validation.md"),
  ]);

  assert.match(skill, /P0\/P1[^.]*fail/is);
  assert.match(skill, /P2[^.]*does not block/is);
  assert.match(skill, /missing mandatory evidence[^.]*blocked/is);
  assert.match(skill, /workstream[^.]*verify\//is);
  assert.match(skill, /validation report[^.]*link/is);

  for (const phrase of [
    "Accepted plan",
    "Scope status",
    "Range base",
    "Range head",
    "Dirty state",
    "In-scope files",
    "Lane Evidence",
    "Finding Verification",
    "Review verdict",
  ]) {
    assert.match(template, new RegExp(phrase, "i"));
  }
  for (const phrase of [
    "Correctness and Risk",
    "Standards and Maintainability",
    "Spec Fidelity",
    "Confirmed P0/P1",
    "Retained P2",
  ]) {
    assert.match(validationTemplate, new RegExp(phrase, "i"));
  }
});
