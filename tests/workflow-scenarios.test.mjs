import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("public workflow documentation agrees on resolver, stages, and telemetry", async () => {
  const [readme, contract, status, scenarios] = await Promise.all([
    read("README.md"),
    read("docs/artifact-and-stage-boundary-contract.md"),
    read("docs/myflow-workflow-status-and-alignment.md"),
    read("tests/fixtures/workflow-scenarios.md"),
  ]);
  for (const document of [readme, contract, status]) {
    assert.match(document, /Scope → Plan → Implement → Verify → Close/);
    assert.match(document, /resolve-repository-map\.mjs|repository-map resolver/i);
  }
  assert.match(readme, /non-blocking/i);
  for (const scenario of ["Trivial", "Medium", "Structural"]) {
    assert.match(scenarios, new RegExp(`## ${scenario}`));
  }
  assert.match(scenarios, /resolved map/i);
  assert.match(scenarios, /correction/i);
  assert.match(scenarios, /manual/i);
});
