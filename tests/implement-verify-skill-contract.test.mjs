import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

const assertRequiredExecuteNowClause = (document, target) => {
  const clauses = document.split(/\n|(?<=[.!?])\s+/).filter((clause) => target.test(clause));
  assert.ok(
    clauses.some(
      (clause) =>
        /\bread\b/i.test(clause) &&
        /\bexecute\b/i.test(clause) &&
        /\b(?:immediately|current run)\b/i.test(clause) &&
        !/\b(?:do not|don't|must not|may|might|can|could|should|optionally|when useful|when convenient)\b/i.test(
          clause,
        ),
    ),
    `expected a mandatory execute-now clause for ${target}`,
  );
};

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
  assertRequiredExecuteNowClause(implement, /\.\.\/validate\/SKILL\.md/i);
  assert.doesNotMatch(implement, /Start Verify with:\s*```text\s*\/skill:validate/i);
  assert.doesNotMatch(implement, /ask (?:the )?developer to (?:invoke|run|start).*validate/i);
});

test("Implement-to-Validate contract rejects negated and advisory-only execution clauses", async () => {
  const implement = await read("skills/implement/SKILL.md");
  const clause =
    "resolve `../validate/SKILL.md` relative to this installed `skills/implement/SKILL.md`, read it, and execute its instructions immediately with the accepted-plan path";

  const mutants = [
    implement.replace(clause, `do not ${clause}`),
    implement.replace(clause, `you may ${clause} when useful`),
  ];

  for (const mutant of mutants) {
    for (const token of ["../validate/SKILL.md", "read", "execute", "immediately"]) {
      assert.match(mutant, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    assert.throws(() => assertRequiredExecuteNowClause(mutant, /\.\.\/validate\/SKILL\.md/i));
  }
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
  assert.match(
    template,
    /Review range base:[^\n]*first implementation commit parent[^\n]*empty-tree hash[^\n]*root-inclusive scope/i,
  );
  assert.match(template, /Review range head/);
  assert.match(template, /Review verdict/);
  assert.match(template, /Manual Verification Brief/);
  assert.match(template, /Owner-Correct Next Action/);
  assert.match(review, /resolve-repository-map\.mjs/);
  assert.match(review, /unavailable/i);
  assertRequiredExecuteNowClause(validate, /\.\.\/code-review\/SKILL\.md/i);
});

test("Validate-to-code-review contract rejects negated and advisory-only execution clauses", async () => {
  const validate = await read("skills/validate/SKILL.md");
  const clause =
    "Resolve `../code-review/SKILL.md` relative to this installed `skills/validate/SKILL.md`, read it, and execute it immediately in the current run";

  const mutants = [
    validate.replace(clause, `Do not ${clause.toLowerCase()}`),
    validate.replace(clause, `You may ${clause.toLowerCase()} when useful`),
  ];

  for (const mutant of mutants) {
    for (const token of ["../code-review/SKILL.md", "read", "execute", "immediately", "current run"]) {
      assert.match(mutant, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    assert.throws(() => assertRequiredExecuteNowClause(mutant, /\.\.\/code-review\/SKILL\.md/i));
  }
});

const assertCloseReviewRefusalContract = (close) => {
  assert.match(close, /missing[^.\n]*failing[^.\n]*mismatched[^.\n]*review evidence[^.\n]*prevents Close/i);
  assert.doesNotMatch(
    close,
    /(?:missing|failing|mismatched)[^.\n]*review evidence[^.\n]*(?:do not|does not|must not|never)[^.\n]*prevent Close/i,
  );
};

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
    "mismatched",
  ]) {
    assert.match(close, new RegExp(phrase, "i"));
  }
  assert.match(close, /Do not trust (?:only )?the validation report(?:'s)? top-level verdict/i);
  assertCloseReviewRefusalContract(close);
});

test("Close review gate rejects explicit missing, failing, and mismatched negations", async () => {
  const close = await read("skills/close/SKILL.md");
  assertCloseReviewRefusalContract(close);

  for (const kind of ["missing", "failing", "mismatched"]) {
    const mutant = close.replace(
      /Missing[^.\n]*failing[^.\n]*mismatched[^.\n]*review evidence[^.\n]*prevents Close/i,
      `${kind} review evidence does not prevent Close`,
    );
    assert.match(mutant, new RegExp(`${kind}[^.\\n]*review evidence[^.\\n]*prevent Close`, "i"));
    assert.throws(() => assertCloseReviewRefusalContract(mutant));
  }
});
