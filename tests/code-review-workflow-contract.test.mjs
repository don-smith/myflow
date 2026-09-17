import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

const assertSubstantiveLaneContract = (skill) => {
  assertPositiveContract(
    skill,
    /Launch exactly three required fresh-context reviewers in parallel:/i,
    /(?:do not|does not|must not|never) Launch exactly three required fresh-context reviewers in parallel:/i,
  );
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

const assertPositiveContract = (document, required, forbiddenNegation) => {
  assert.match(document, required);
  assert.doesNotMatch(document, forbiddenNegation);
};

const assertReviewIdentityContract = (document) => {
  assertPositiveContract(
    document,
    /record the run ID and agent identity actually used for each fresh review lane/i,
    /(?:do not|does not|must not|never) record[^.\n]*run ID[^.\n]*agent identity[^.\n]*fresh review lane/i,
  );
  assertPositiveContract(
    document,
    /record the run ID and agent identity actually used for independent P0\/P1 verification/i,
    /(?:do not|does not|must not|never) record[^.\n]*run ID[^.\n]*agent identity[^.\n]*independent P0\/P1 verification/i,
  );
};

const assertSeverityGateContract = (document) => {
  assertPositiveContract(
    document,
    /confirmed P0\/P1[^.\n]*(?:fail|block)/i,
    /confirmed P0\/P1[^.;\n]*(?:do not|does not|must not|never)[^.;\n]*(?:fail|block)/i,
  );
};

const assertIndependentVerificationContract = (document) => {
  assertPositiveContract(
    document,
    /(?:send|require)[^.\n]*P0\/P1[^.\n]*independent verification/i,
    /(?:do not|does not|must not|never) (?:send|require)[^.\n]*P0\/P1[^.\n]*independent verification/i,
  );
};

const assertDeterministicReviewGate = (document) => {
  assertPositiveContract(
    document,
    /confirmed P0\/P1[^.;\n]*(?:produces|→|is)[^.;\n]*fail/i,
    /confirmed P0\/P1[^.;\n]*(?:produces|→|is)[^.;\n]*blocked/i,
  );
  assertPositiveContract(
    document,
    /(?:missing mandatory (?:scope or )?evidence|incomplete scope)[^.;\n]*(?:unavailable|required fresh review unavailable|inconclusive)[^.;\n]*(?:produces|→|is|make)[^.;\n]*blocked/i,
    /(?:missing mandatory (?:scope or )?evidence|incomplete scope)[^.;\n]*(?:unavailable|required fresh review unavailable|inconclusive)[^.;\n]*(?:produces|→|is|make)[^.;\n]*fail/i,
  );
};

const assertExactCommitSetContract = (document) => {
  assertPositiveContract(
    document,
    /commit-list[^.\n]*(?:retain|record|copy|compare|match|require)[^.\n]*exact scope spec[^.\n]*resolved commit set/i,
    /commit-list[^.\n]*(?:do not|does not|must not|never)[^.\n]*(?:retain|record|copy|compare|match|require)[^.\n]*exact scope spec[^.\n]*resolved commit set/i,
  );
  assert.match(document, /range base(?:\/head| and head)[^.\n]*alone[^.\n]*insufficient/i);
};

test("code review pins complete scope through the active range helper", async () => {
  const [skill, packageJson] = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("package.json"),
  ]);

  assert.match(skill, /node _helpers\/review-range\.mjs/);
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
  assert.match(skill, /read[^.]*patch_path[^.]*reviewer/is);
  assert.match(packageJson, /skills\/code-review\/_helpers\/review-range\.test\.mjs/);
});

test("commit-list provenance is exact across Code-review, Verify, and Close contracts", async () => {
  const documents = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("skills/code-review/templates/review.md"),
    read("skills/verify/SKILL.md"),
    read("skills/verify/templates/validation.md"),
    read("skills/close/SKILL.md"),
  ]);

  for (const document of documents) {
    assertExactCommitSetContract(document);
    const mutant = document.replace(
      /commit-list([^.]*)exact scope spec([^.]*)resolved commit set/i,
      "commit-list$1range base and head$2contiguous range",
    );
    assert.throws(() => assertExactCommitSetContract(mutant));
  }

  const reviewTemplate = documents[1];
  assert.match(reviewTemplate, /^resolved_commits:/m);
  assert.match(reviewTemplate, /scope_strategy[^\n]*commit-list/i);
  const validationTemplate = documents[3];
  assert.match(validationTemplate, /Review scope spec/i);
  assert.match(validationTemplate, /Review resolved commit set/i);
});

test("code review requires substantive evidence from all three fresh-context lanes", async () => {
  const skill = await read("skills/code-review/SKILL.md");

  assertSubstantiveLaneContract(skill);
  assert.match(skill, /Correctness and Risk[^\n]*callers[^\n]*failure paths/i);
  assert.match(skill, /Standards and Maintainability[^\n]*mapped rules[^\n]*maintainability/i);
  assert.match(skill, /security checks when/i);
  assert.match(skill, /dependency checks when/i);
  assert.match(skill, /when subagents are unavailable[^.]*fresh session/is);
  assert.match(skill, /missing subagent facility never blocks the review/i);
  assert.match(skill, /lane fails to return[^.]*block rather than silently pass/is);
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
      /record the run ID and agent identity actually used for each fresh review lane/i,
      "do not record the run ID and agent identity actually used for each fresh review lane",
    );
    const withoutVerifierIdentity = document.replace(
      /record the run ID and agent identity actually used for independent P0\/P1 verification/i,
      "do not record the run ID and agent identity actually used for independent P0/P1 verification",
    );

    for (const mutant of [withoutLaneIdentity, withoutVerifierIdentity]) {
      assert.match(mutant, /run ID/i);
      assert.match(mutant, /agent identity/i);
      assert.throws(() => assertReviewIdentityContract(mutant));
    }
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
      "Launch exactly three required fresh-context reviewers in parallel:",
      "Do not Launch exactly three required fresh-context reviewers in parallel:",
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
  assertIndependentVerificationContract(skill);
  assert.match(skill, /code and callers/i);
});

test("severity gating and independent verification reject explicit negation", async () => {
  const skill = await read("skills/code-review/SKILL.md");
  assertSeverityGateContract(skill);
  assertIndependentVerificationContract(skill);

  const mutants = [
    skill.replace("confirmed P0/P1 → **fail**", "confirmed P0/P1 do not fail"),
    skill.replace(
      /Send provisional P0\/P1 claims to a separate fresh-context verifier for independent verification\./,
      "Do not require provisional P0/P1 claims to receive independent verification.",
    ),
  ];

  assert.match(mutants[0], /P0\/P1[^.\n]*fail/i);
  assert.match(mutants[1], /P0\/P1[^.\n]*independent verification/i);
  assert.throws(() => assertSeverityGateContract(mutants[0]));
  assert.throws(() => assertIndependentVerificationContract(mutants[1]));
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
    assertSeverityGateContract(document);
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

test("review fail and blocked outcomes cannot be swapped or weakened", async () => {
  const documents = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("skills/code-review/templates/review.md"),
  ]);

  for (const document of documents) {
    assertDeterministicReviewGate(document);
    const swappedFail = document.replace(/confirmed P0\/P1([^.;\n]*)(?:fail)/i, "confirmed P0/P1$1blocked");
    const swappedBlocked = document.replace(
      /((?:missing mandatory (?:scope or )?evidence|incomplete scope)[^.;\n]*(?:unavailable|required fresh review unavailable|inconclusive)[^.;\n]*)(?:blocked)/i,
      "$1fail",
    );
    for (const mutant of [swappedFail, swappedBlocked]) {
      assert.match(mutant, /confirmed P0\/P1/i);
      assert.match(mutant, /blocked/i);
      assert.throws(() => assertDeterministicReviewGate(mutant));
    }
  }
});

test("review gate and durable artifact are explicit", async () => {
  const [skill, template, validationTemplate] = await Promise.all([
    read("skills/code-review/SKILL.md"),
    read("skills/code-review/templates/review.md"),
    read("skills/verify/templates/validation.md"),
  ]);

  assertSeverityGateContract(skill);
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
