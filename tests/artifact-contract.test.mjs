import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("artifact contract defines common stage handoffs and right-sized planning", async () => {
  const contract = await read("docs/artifact-and-stage-boundary-contract.md");

  for (const requirement of [
    "Common artifact interface",
    "Scope acceptance criteria versus Plan verification",
    "Design disposition",
    "Trivial, in-session",
    "Lightweight",
    "Structural design required",
    "Route corrections to their owner",
    "workstream ID",
    ".myflow/workstreams/<workstream-id>/",
    ".myflow/repository-map.md",
  ]) {
    assert.match(contract, new RegExp(requirement, "i"));
  }
});

test("shared templates support resumable stage state and lightweight plans", async () => {
  const [checkpoint, plan, workstream] = await Promise.all([
    read("skills/myflow/templates/stage-context-checkpoint.md"),
    read("skills/myflow/templates/lightweight-plan.md"),
    read("skills/myflow/templates/workstream.md"),
  ]);

  assert.match(checkpoint, /## Context Checkpoint/);
  assert.match(checkpoint, /## Rehydration Manifest/);
  assert.match(checkpoint, /repository-map\.md/);
  assert.match(plan, /## Design Disposition/);
  assert.match(plan, /## Verification Map/);
  assert.match(plan, /Commit Strategy/);
  assert.match(workstream, /## Stage Progress/);
  assert.match(workstream, /Current State/);
});

test("scope establishes a workstream and selects rather than forces specialists", async () => {
  const [scope, alignment] = await Promise.all([
    read("skills/scope/SKILL.md"),
    read("skills/scope/templates/alignment.md"),
  ]);

  assert.match(scope, /workstream ID/);
  assert.match(scope, /Do not force a branch or worktree/);
  assert.match(scope, /Select specialists by evidence/);
  assert.doesNotMatch(scope, /Scope always chains to `research`/);
  assert.match(alignment, /Selected Workflow Depth/);
  assert.match(alignment, /Selected Specialists/);
});

test("research, design, and plan implement the optional-specialist and planning handoff", async () => {
  const [research, design, plan, researchTemplate, designTemplate, fullPlanTemplate] =
    await Promise.all([
      read("skills/research/SKILL.md"),
      read("skills/design/SKILL.md"),
      read("skills/plan/SKILL.md"),
      read("skills/research/templates/research.md"),
      read("skills/design/templates/design.md"),
      read("skills/plan/templates/full-plan.md"),
    ]);

  assert.match(research, /optional specialist/i);
  assert.match(research, /workstreams/);
  assert.match(design, /not mandatory for a lightweight plan/i);
  assert.match(design, /Do not write product source code/);
  assert.match(plan, /Accepts an alignment artifact/);
  assert.match(plan, /design disposition/i);
  assert.match(plan, /Do not require a standalone Design/);
  assert.match(researchTemplate, /Recommended Return/);
  assert.match(designTemplate, /Module, Interface, and Seam Decisions/);
  assert.match(fullPlanTemplate, /## Verification Map/);
});
