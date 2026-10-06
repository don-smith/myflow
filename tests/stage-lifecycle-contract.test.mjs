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
};

test("stage skills record facts without asking the journal for permission", async () => {
  const reference = await read("skills/myflow/references/stage-boundary.md");
  const router = await read("skills/myflow/SKILL.md");
  const skills = await Promise.all(Object.entries(skillPaths).map(async ([name, path]) => [name, await read(path)]));
  for (const [name, skill] of skills) {
    assert.match(skill, /stage-boundary\.mjs/, `${name} must record stage facts`);
    assert.match(skill, /references\/stage-boundary\.md/, `${name} must share recovery guidance`);
    assert.match(skill, /Pass `--repository-root <git-root>` on every subcommand/);
    assert.doesNotMatch(skill, /--idempotency-key|(?:append|write|edit)[^\n]*events\.jsonl/i);
    for (const [invocation] of skill.matchAll(/`enter --stage[^`]*`/g)) {
      assert.match(invocation, /--repository-root <git-root>/, `${name} has an unsafe entry example`);
    }
  }
  for (const action of ["enter", "accept", "exit", "correct --action note", "--new-attempt"]) {
    assert.ok(reference.includes(action), `${action} needs usable instructions`);
  }
  assert.match(reference, /journal command fails[^\n]*keep working/i);
  assert.match(reference, /Do not claim an event succeeded/i);
  assert.match(reference, /Before Close, run fresh Verify/i);
  assert.match(router, /journal records history, not permission/i);
  assert.match(router, /return to their owner/i);
  assert.match(router, /fresh Verify before Close/i);
});

test("correction guidance preserves owning stages and makes the artifact authoritative", async () => {
  const [router, contract, workstream, checkpoint, close] = await Promise.all([
    read("skills/myflow/SKILL.md"), read("docs/artifact-and-stage-boundary-contract.md"),
    read("skills/myflow/templates/workstream.md"), read("skills/myflow/templates/stage-context-checkpoint.md"),
    read("skills/close/SKILL.md"),
  ]);
  for (const owner of ["Scope", "Plan/design", "Plan/planning", "Implement"]) assert.ok(router.includes(owner));
  assert.match(contract, /journal never grants permission/i);
  assert.match(contract, /no episode, assessment, or reconciliation event is needed/i);
  assert.match(workstream, /Journal debt/);
  assert.match(checkpoint, /journal failures/);
  assert.match(close, /final Verify report covers all changes/i);
  assert.match(close, /linked passing review evidence/i);
  assert.doesNotMatch(close, /require a named audit gap/i);
});

test("stage feedback remains private and non-blocking", async () => {
  const [reference, implement, verify] = await Promise.all([
    read("skills/myflow/references/stage-boundary.md"), read(skillPaths.Implement), read(skillPaths.Verify),
  ]);
  assert.match(reference, /Before we leave \{stage\}, how did this stage go from your point of view\?/);
  for (const choice of ["smooth", "some-friction", "rough", "skip"]) assert.match(reference, new RegExp(choice));
  assert.match(reference, /Ask once per completed attempt/i);
  assert.match(reference, /Only coverage status reaches the lifecycle journal/i);
  assert.match(reference, /Feedback or sync failure never blocks stage work/i);
  assert.match(implement, /exit --feedback pending/);
  assert.match(verify, /pending Implement feedback/i);
});

test("lifecycle core remains host-neutral and host detection stays isolated", async () => {
  const core = await Promise.all([
    read("skills/myflow/scripts/lib/lifecycle-contract.mjs"),
    read("skills/myflow/scripts/lib/lifecycle-store.mjs"),
    read("skills/myflow/scripts/lib/lifecycle-reducer.mjs"),
    read("skills/myflow/scripts/stage-boundary.mjs"),
  ]);
  for (const module of core) assert.doesNotMatch(module, /pi-subagents|tool_call|ask_user_question|@langfuse/i);
  assert.match(await read("skills/myflow/scripts/lib/host-detection.mjs"), /PI_SESSION_ID/);
  assert.doesNotMatch(core.at(-1), /_SESSION_ID/);
  assert.doesNotMatch(await read("skills/myflow/references/stage-boundary.md"), /\bPI_|_SESSION_ID|CLAUDE/);
});
