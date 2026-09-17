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

const assertCorrectivePhaseContract = (document) => {
  const clauses = document.split(/\n|(?<=[.!?])\s+/);
  assert.ok(
    clauses.some(
      (clause) =>
        /failed Verify/i.test(clause) &&
        /all original phases are complete/i.test(clause) &&
        /one bounded corrective phase/i.test(clause) &&
        /linked findings/i.test(clause) &&
        !/(?:do not|does not|must not|never|may|might|can|could|should|optionally)/i.test(clause),
    ),
    "expected a mandatory failed-Verify corrective-phase clause",
  );
  assert.match(document, /fresh-context implementation subagent[^.]*corrective phase/is);
  assert.match(document, /corrective phase[^.]*commit[^.]*checkpoint[^.]*immediately[^.]*complete Verify/is);
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

test("Implement defers its non-blocking feedback pulse to Verify entry", async () => {
  const [implement, verify] = await Promise.all([
    read("skills/implement/SKILL.md"),
    read("skills/verify/SKILL.md"),
  ]);

  assert.match(implement, /record-stage-feedback\.mjs/);
  assert.match(implement, /status pending/i);
  assert.match(implement, /without live (?:developer )?interaction/i);
  assert.match(verify, /pending Implement feedback/i);
  assert.match(verify, /before substantive[^.\n]*Verify/i);
  assert.match(verify, /feedback-requested/i);
  assert.match(verify, /feedback-recorded/i);
  assert.match(verify, /feedback failure[^.\n]*(?:does not|must not)[^.\n]*(?:stage transition|verification)/i);
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

test("failed Verify creates one bounded corrective phase after original phases complete", async () => {
  const [implement, myflow, boundary] = await Promise.all([
    read("skills/implement/SKILL.md"),
    read("skills/myflow/SKILL.md"),
    read("docs/artifact-and-stage-boundary-contract.md"),
  ]);

  for (const document of [implement, myflow, boundary]) assertCorrectivePhaseContract(document);
});

test("corrective-phase contract rejects token-preserving negation and advisory wording", async () => {
  const implement = await read("skills/implement/SKILL.md");
  assertCorrectivePhaseContract(implement);
  const clause = implement
    .split(/\n|(?<=[.!?])\s+/)
    .find((candidate) => /failed Verify/i.test(candidate) && /one bounded corrective phase/i.test(candidate));
  assert.ok(clause);

  for (const mutantClause of [`Do not ${clause}`, `You may ${clause} when useful`]) {
    const mutant = implement.replace(clause, mutantClause);
    for (const token of ["failed Verify", "all original phases are complete", "one bounded corrective phase", "linked findings"]) {
      assert.match(mutant, new RegExp(token, "i"));
    }
    assert.throws(() => assertCorrectivePhaseContract(mutant));
  }
});

test("Implement enters Verify immediately in the same parent session", async () => {
  const implement = await read("skills/implement/SKILL.md");

  for (const phrase of [
    "same parent session",
    "../verify/SKILL.md",
    "relative to this installed",
    "read",
    "execute",
    "immediately",
    "recovery/rehydration only",
  ]) {
    assert.match(implement, new RegExp(phrase, "i"));
  }
  assertRequiredExecuteNowClause(implement, /\.\.\/verify\/SKILL\.md/i);
  assert.doesNotMatch(implement, /Start Verify with:\s*```text\s*\/skill:verify/i);
  assert.doesNotMatch(implement, /ask (?:the )?developer to (?:invoke|run|start).*verify/i);
});

test("Implement-to-Verify contract rejects negated and advisory-only execution clauses", async () => {
  const implement = await read("skills/implement/SKILL.md");
  const clause =
    "resolve `../verify/SKILL.md` relative to this installed `skills/implement/SKILL.md`, read it, and execute its instructions immediately with the accepted-plan path";

  const mutants = [
    implement.replace(clause, `do not ${clause}`),
    implement.replace(clause, `you may ${clause} when useful`),
  ];

  for (const mutant of mutants) {
    for (const token of ["../verify/SKILL.md", "read", "execute", "immediately"]) {
      assert.match(mutant, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    assert.throws(() => assertRequiredExecuteNowClause(mutant, /\.\.\/verify\/SKILL\.md/i));
  }
});

test("Verify consumes workstream evidence and executes code review now", async () => {
  const [verify, template, review] = await Promise.all([
    read("skills/verify/SKILL.md"),
    read("skills/verify/templates/validation.md"),
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
    assert.match(verify, new RegExp(phrase, "i"));
  }
  assert.match(
    verify,
    /first implementation commit has no parent[^.]*empty-tree\.\.<final implementation commit>/i,
  );
  assert.match(verify, /pass that explicit scope form[^.]*code-review/i);
  assert.doesNotMatch(verify, /_shared|\.myflow\/artifacts|\/skill:revise|mandatory Stage 4 gate/i);
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
  assertRequiredExecuteNowClause(verify, /\.\.\/code-review\/SKILL\.md/i);
});

test("Verify maps review verdicts and frontmatter status deterministically", async () => {
  const [verify, template] = await Promise.all([
    read("skills/verify/SKILL.md"),
    read("skills/verify/templates/validation.md"),
  ]);

  const assertMapping = (document) => {
    assert.match(document, /confirmed P0\/P1[^.\n]*validation verdict[^.\n]*fail/i);
    assert.match(document, /missing mandatory scope or evidence[^.\n]*unavailable lane[^.\n]*inconclusive verifier[^.\n]*validation verdict[^.\n]*blocked/i);
    assert.match(document, /frontmatter status[^.\n]*ready[^.\n]*only[^.\n]*pass[^.\n]*blocked[^.\n]*fail[^.\n]*blocked/i);
  };

  for (const document of [verify, template]) {
    assertMapping(document);
    const mutants = [
      document.replace(/confirmed P0\/P1([^.\n]*validation verdict[^.\n]*)fail/i, "confirmed P0/P1$1blocked"),
      document.replace(
        /missing mandatory scope or evidence([^.\n]*validation verdict[^.\n]*)blocked/i,
        "missing mandatory scope or evidence$1fail",
      ),
      document.replace(/frontmatter status([^.\n]*)ready([^.\n]*)only([^.\n]*)pass/i, "frontmatter status$1blocked$2only$3pass"),
    ];
    for (const mutant of mutants) assert.throws(() => assertMapping(mutant));
  }
});

test("Verify-to-code-review contract rejects negated and advisory-only execution clauses", async () => {
  const verify = await read("skills/verify/SKILL.md");
  const clause =
    "Resolve `../code-review/SKILL.md` relative to this installed `skills/verify/SKILL.md`, read it, and execute it immediately in the current run";

  const mutants = [
    verify.replace(clause, `Do not ${clause.toLowerCase()}`),
    verify.replace(clause, `You may ${clause.toLowerCase()} when useful`),
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

test("Verify records the interleaved-commit clause and rejects its removal", async () => {
  const verify = await read("skills/verify/SKILL.md");

  assert.match(
    verify,
    /unrelated commit[^.]*interleaved[^.]*pass the ordered implementation commit IDs as an explicit comma-separated commit list/is,
  );

  const clause = "When an unrelated commit is interleaved, pass the ordered implementation commit IDs as an explicit comma-separated commit list so only named commits are reviewed.";
  const withoutClause = verify.replace(clause, "");
  assert.throws(() =>
    assert.match(
      withoutClause,
      /unrelated commit[^.]*interleaved[^.]*pass the ordered implementation commit IDs as an explicit comma-separated commit list/is,
    ),
  );
});
