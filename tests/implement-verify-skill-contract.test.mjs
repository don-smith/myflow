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

test("Validate consumes workstream evidence and writes one complete Verify report", async () => {
  const [validate, template, review] = await Promise.all([
    read("skills/validate/SKILL.md"),
    read("skills/validate/templates/validation.md"),
    read("skills/code-review/SKILL.md"),
  ]);

  for (const phrase of [
    "resolve-repository-map.mjs",
    "workstream.md",
    "workstreams/<workstream-id>/verify/",
    "code-review",
    "manual-verification brief",
    "implementation defect returns to Implement",
    "plan returns to Plan",
  ]) {
    assert.match(validate, new RegExp(phrase, "i"));
  }
  assert.doesNotMatch(validate, /_shared|\.myflow\/artifacts|\/skill:revise|mandatory Stage 4 gate/i);
  assert.match(template, /Criterion Coverage/);
  assert.match(template, /Review Evidence/);
  assert.match(template, /Manual Verification Brief/);
  assert.match(template, /Owner-Correct Next Action/);
  assert.match(review, /resolve-repository-map\.mjs/);
  assert.match(review, /unavailable/i);
});
