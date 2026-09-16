import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("Implement records resolver-aware phase checkpoints before Verify", async () => {
  const implement = await read("skills/implement/SKILL.md");
  for (const phrase of [
    "resolve-repository-map.mjs",
    "accepted plan",
    "commit hash",
    "automated evidence",
    "outstanding manual verification",
    "next phase",
    "workstreams/<workstream-id>/verify/",
  ]) {
    assert.match(implement, new RegExp(phrase, "i"));
  }
});

test("Implement delegates every phase through a fresh context", async () => {
  const implement = await read("skills/implement/SKILL.md");

  for (const phrase of [
    "exactly one fresh-context implementation subagent",
    "sequentially",
    "completion summary",
    "do not implement a phase directly in the orchestrator",
  ]) {
    assert.match(implement, new RegExp(phrase, "i"));
  }
});

test("MyFlow skills resolve repository maps from their installed package", async () => {
  const implement = await read("skills/implement/SKILL.md");

  assert.doesNotMatch(implement, /node skills\/myflow\/scripts\/resolve-repository-map\.mjs/);
  assert.match(implement, /installed MyFlow package/i);
});

test("Implement enters Verify immediately in the same parent session", async () => {
  const implement = await read("skills/implement/SKILL.md");

  for (const phrase of [
    "same parent session",
    "../validate/SKILL.md",
    "relative to this installed",
    "read",
    "execute",
    "immediately",
    "recovery/rehydration only",
  ]) {
    assert.match(implement, new RegExp(phrase, "i"));
  }
  assert.doesNotMatch(implement, /Start Verify with:\s*```text\s*\/skill:validate/i);
  assert.doesNotMatch(implement, /ask (?:the )?developer to (?:invoke|run|start).*validate/i);
});

test("Validate consumes workstream evidence and executes code review now", async () => {
  const [validate, template, review] = await Promise.all([
    read("skills/validate/SKILL.md"),
    read("skills/validate/templates/validation.md"),
    read("skills/code-review/SKILL.md"),
  ]);

  for (const phrase of [
    "resolve-repository-map.mjs",
    "workstream.md",
    "workstreams/<workstream-id>/verify/",
    "../code-review/SKILL.md",
    "relative to this installed",
    "read",
    "execute",
    "immediately",
    "current run",
    "exact implementation range",
    "accepted plan as the spec",
    "manual-verification brief",
    "implementation defect returns to Implement",
    "plan returns to Plan",
  ]) {
    assert.match(validate, new RegExp(phrase, "i"));
  }
  assert.match(
    validate,
    /first implementation commit has no parent[^.]*empty-tree\.\.<final implementation commit>/i,
  );
  assert.match(validate, /pass that explicit scope form[^.]*code-review/i);
  assert.doesNotMatch(validate, /_shared|\.myflow\/artifacts|\/skill:revise|mandatory Stage 4 gate/i);
  assert.match(template, /Criterion Coverage/);
  assert.match(template, /Review Evidence/);
  assert.match(template, /Review artifact/);
  assert.match(template, /Accepted plan/);
  assert.match(template, /Review range base/);
  assert.match(template, /Review range head/);
  assert.match(template, /Review verdict/);
  assert.match(template, /Manual Verification Brief/);
  assert.match(template, /Owner-Correct Next Action/);
  assert.match(review, /resolve-repository-map\.mjs/);
  assert.match(review, /unavailable/i);
});

test("Close requires linked passing review evidence, not only a validation pass string", async () => {
  const close = await read("skills/close/SKILL.md");

  for (const phrase of [
    "linked review artifact",
    "read the review artifact",
    "accepted plan",
    "implementation range",
    "review verdict",
    "missing",
    "failing",
    "blocked",
  ]) {
    assert.match(close, new RegExp(phrase, "i"));
  }
  assert.match(close, /Do not trust (?:only )?the validation report(?:'s)? top-level verdict/i);
});
