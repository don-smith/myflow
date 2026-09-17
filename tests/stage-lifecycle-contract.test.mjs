import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");
const skillPaths = {
  Scope: "skills/scope/SKILL.md",
  Design: "skills/design/SKILL.md",
  Plan: "skills/plan/SKILL.md",
  Implement: "skills/implement/SKILL.md",
  Verify: "skills/verify/SKILL.md",
  Close: "skills/close/SKILL.md",
  MyFlow: "skills/myflow/SKILL.md",
};

test("canonical skills send real state changes through the lifecycle CLI", async () => {
  const skills = Object.fromEntries(
    await Promise.all(Object.entries(skillPaths).map(async ([name, path]) => [name, await read(path)])),
  );

  for (const [name, document] of Object.entries(skills)) {
    assert.match(document, /lifecycle-journal\.mjs/, `${name} must name the lifecycle CLI`);
    assert.match(document, /idempotency-key/i, `${name} must require idempotent lifecycle writes`);
    assert.doesNotMatch(document, /(?:append|write|edit)[^\n]*events\.jsonl/i, `${name} must not direct-write JSONL`);
  }

  for (const [name, events] of Object.entries({
    Scope: ["workstream-created", "stage-entered", "artifact-accepted", "stage-completed"],
    Design: ["stage-entered", "activity-entered", "activity-completed", "artifact-accepted"],
    Plan: ["activity-entered", "artifact-accepted", "stage-completed"],
    Implement: ["stage-entered", "activity-entered", "activity-completed", "stage-completed"],
    Verify: ["stage-entered", "verification-completed", "stage-completed"],
    Close: ["stage-entered", "stage-completed", "workstream-closed"],
  })) {
    for (const event of events) assert.match(skills[name], new RegExp(event, "i"), `${name} must record ${event}`);
  }
});

test("stage contracts preserve correction ownership and immutable history", async () => {
  const documents = await Promise.all(Object.values(skillPaths).map(read));
  const joined = documents.join("\n");

  for (const event of ["return-opened", "return-rerouted", "return-owner-ready", "return-resumed", "return-closed"]) {
    assert.match(joined, new RegExp(event, "i"));
  }
  assert.match(joined, /outcome-or-acceptance[^\n]*Scope/is);
  assert.match(joined, /architecture[^\n]*Plan[^\n]*design/is);
  assert.match(joined, /plan[^\n]*Plan[^\n]*planning/is);
  assert.match(joined, /implementation[^\n]*Implement[^\n]*phase/is);
  assert.match(joined, /preserve[^.\n]*(?:attempts|artifacts)[^.\n]*histor/i);
});

test("feedback contract is exact, private, once per attempt, and non-blocking", async () => {
  const [checkpoint, myflow, implement, verify] = await Promise.all([
    read("skills/myflow/templates/stage-context-checkpoint.md"),
    read("skills/myflow/SKILL.md"),
    read("skills/implement/SKILL.md"),
    read("skills/verify/SKILL.md"),
  ]);
  const contract = `${checkpoint}\n${myflow}`;

  assert.match(contract, /Before we leave \{stage\}, how did this stage go from your point of view\?/);
  for (const choice of ["smooth", "some-friction", "rough", "skip"]) assert.match(contract, new RegExp(choice));
  assert.match(contract, /once per eligible attempt/i);
  assert.match(contract, /structured[^.\n]*preferred/i);
  assert.match(contract, /plain-text[^.\n]*fallback/i);
  assert.match(contract, /non-blocking|must not block/i);
  assert.match(contract, /workstream's `feedback\/` folder/i);
  assert.match(contract, /rating[^.\n]*note[^.\n]*never[^.\n]*journal/i);
  assert.match(contract, /package[^.\n]*version/i);
  assert.match(contract, /Git commit/i);
  assert.match(contract, /governing skill digest/i);
  assert.match(contract, /lifecycle schema/i);
  assert.match(contract, /host capability/i);

  assert.match(implement, /pending/i);
  assert.match(implement, /without live (?:developer )?interaction/i);
  assert.match(verify, /before substantive[^.\n]*Verify/i);
  assert.match(verify, /pending Implement feedback/i);
  assert.match(verify, /feedback failure[^.\n]*(?:does not|must not)[^.\n]*(?:stage transition|verification)/i);
});

test("lifecycle core remains host-neutral", async () => {
  const core = await Promise.all([
    read("skills/myflow/scripts/lib/lifecycle-contract.mjs"),
    read("skills/myflow/scripts/lib/lifecycle-store.mjs"),
    read("skills/myflow/scripts/lib/lifecycle-reducer.mjs"),
  ]);
  for (const module of core) {
    assert.doesNotMatch(module, /pi-subagents|tool_call|ask_user_question|@langfuse/i);
  }
});
