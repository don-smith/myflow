import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

const assertSubstantiveLaneContract = (skill) => {
  assert.match(skill, /Launch exactly three required fresh-context reviewers in parallel:/i);
  assert.match(skill, /Each lane must return its own evidence from the supplied scope/i);
  assert.match(skill, /Do not accept a pass verdict, checklist, or unsupported assurance as lane evidence/i);
  assert.match(
    skill,
    /Spec Fidelity[^\n]*every acceptance criterion, every phase outcome, and every exclusion/i,
  );
  assert.doesNotMatch(
    skill,
    /(?:may|can|should|optionally) (?:skip|omit|replace|spot-check)[^.]*?(?:lane|review|acceptance criterion|phase outcome|exclusion)/i,
  );
};

const assertOmissionEvidenceContract = (document) => {
  assert.match(document, /omission[^.]*accepted (?:plan|spec)[^.]*(?:file|path):line[^.]*verbatim quote/is);
  assert.match(document, /omission[^.]*nearest expected implementation seam/is);
  assert.match(document, /changed-code evidence[^.]*only when[^.]*code exists/is);
};

const assertReviewIdentityContract = (document) => {
  assert.match(document, /run ID and agent identity actually used for each fresh review lane/i);
  assert.match(document, /run ID and agent identity actually used for independent P0\/P1 verification/i);
};

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

test("code review requires substantive evidence from all three fresh-context lanes", async () => {
  const skill = await read("skills/code-review/SKILL.md");

  assertSubstantiveLaneContract(skill);
  assert.match(skill, /Correctness and Risk[^\n]*callers[^\n]*failure paths/i);
  assert.match(skill, /Standards and Maintainability[^\n]*mapped rules[^\n]*maintainability/i);
  assert.match(skill, /security checks when/i);
  assert.match(skill, /dependency checks when/i);
  assert.match(skill, /subagent capability[^.]*unavailable[^.]*block/is);
  assert.doesNotMatch(skill, /two-axis|both sub-agents/i);
});

test("review skill and durable template require actual lane and verifier identities", async () => {
  const documents = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("skills/code-review/templates/review.md"),
  ]);

  for (const document of documents) {
    assertReviewIdentityContract(document);
    assert.match(document, /locally available agents[^.]*no model matrix/is);

    const withoutLaneIdentity = document.replace(
      /[^.]*run ID and agent identity actually used for each fresh review lane\./i,
      " Lane identity may be omitted.",
    );
    const withoutVerifierIdentity = document.replace(
      /[^.]*run ID and agent identity actually used for independent P0\/P1 verification\./i,
      " Verifier identity may be omitted.",
    );

    assert.throws(() => assertReviewIdentityContract(withoutLaneIdentity));
    assert.throws(() => assertReviewIdentityContract(withoutVerifierIdentity));
  }
});

test("review contract rejects negated, advisory, rubber-stamped, and incomplete instructions", async () => {
  const skill = await read("skills/code-review/SKILL.md");
  assertSubstantiveLaneContract(skill);

  const mutants = [
    skill.replace(
      "Launch exactly three required fresh-context reviewers in parallel:",
      "You may skip a review lane and launch fresh-context reviewers when useful:",
    ),
    skill.replace(
      "Each lane must return its own evidence from the supplied scope.",
      "Each lane should return evidence from the supplied scope when practical.",
    ),
    skill.replace(
      "Do not accept a pass verdict, checklist, or unsupported assurance as lane evidence.",
      "Accept a pass verdict or completed checklist as sufficient lane evidence.",
    ),
    skill.replace(
      "every acceptance criterion, every phase outcome, and every exclusion",
      "a representative acceptance criterion and the main outcome",
    ),
  ];

  for (const mutant of mutants) {
    assert.throws(() => assertSubstantiveLaneContract(mutant));
  }
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
      "failure mechanism",
      "affected behavior or requirement",
      "smallest fix",
    ]) {
      assert.match(document, new RegExp(phrase, "i"));
    }
    assertOmissionEvidenceContract(document);
  }
  assert.match(skill, /P0\/P1[^.]*independent[^.]*verif/is);
  assert.match(skill, /code and callers/i);
});

test("finding contract rejects a schema that makes changed-code evidence mandatory for omissions", async () => {
  const skill = await read("skills/code-review/SKILL.md");
  assertOmissionEvidenceContract(skill);

  const mutant = skill
    .replace(/For an omission,[\s\S]*?code exists\./, "Every finding must cite changed file:line and changed code.")
    .replace(/changed-code evidence[^.]*only when[^.]*code exists\./i, "Changed-code evidence is always required.");

  assert.throws(() => assertOmissionEvidenceContract(mutant));
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

test("review skill and template use sentence-case headings without em dashes", async () => {
  const [skill, template] = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("skills/code-review/templates/review.md"),
  ]);

  assert.match(skill, /^# Code review$/m);
  assert.doesNotMatch(skill, /^# Code Review$/m);
  for (const heading of [
    "# Code review: {scope}",
    "## Provenance and scope",
    "## Lane evidence",
    "## Retained findings",
    "## Finding verification",
    "## Review verdict",
  ]) {
    assert.match(template, new RegExp(`^${heading.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, "m"));
  }
  assert.doesNotMatch(skill, /—/);
  assert.doesNotMatch(template, /—/);
  assert.doesNotMatch(template, /^## (?:Provenance and Scope|Lane Evidence|Retained Findings|Finding Verification|Review Verdict)$/m);
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
