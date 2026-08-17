import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("public workflow documentation agrees on resolver, stages, and telemetry", async () => {
  const [readme, contract, status, scenarios, myflow] = await Promise.all([
    read("README.md"),
    read("docs/artifact-and-stage-boundary-contract.md"),
    read("docs/myflow-workflow-status-and-alignment.md"),
    read("tests/fixtures/workflow-scenarios.md"),
    read("skills/myflow/SKILL.md"),
  ]);
  for (const document of [readme, contract, status]) {
    assert.match(document, /Scope → Plan → Implement → Verify → Close/);
    assert.match(document, /resolve-repository-map\.mjs|repository-map resolver/i);
  }
  assert.match(readme, /non-blocking/i);
  for (const scenario of ["Trivial", "Medium", "Structural"]) {
    const section = scenarios.split(`## ${scenario}`)[1].split("\n## ")[0];
    for (const field of ["Resolved map", "Workstream artifact", "Stage handoffs", "Correction", "Manual evidence"]) {
      assert.match(section, new RegExp(`${field}:`, "i"));
    }
  }
  for (const scenario of ["Medium", "Structural"]) {
    const section = scenarios.split(`## ${scenario}`)[1].split("\n## ")[0];
    for (const stage of ["Onboard", "Scope", "Plan", "Implement", "Verify", "Close"]) {
      assert.match(section, new RegExp(`\\| ${stage} \\|`));
    }
  }
  assert.match(myflow, /only applicable/i);
  assert.doesNotMatch(myflow, /After documentation, status, learning, retrospective/i);
  assert.doesNotMatch(myflow, /Resolve all tabled items/i);
});
