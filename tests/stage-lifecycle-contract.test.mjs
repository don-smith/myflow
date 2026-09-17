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

/** The stage skills plus the router, which the boundary reference belongs to. */
async function readSkills() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries({ ...skillPaths, MyFlow: "skills/myflow/SKILL.md" }).map(async ([name, path]) => [
        name,
        await read(path),
      ]),
    ),
  );
}

test("every stage records its boundary through the one boundary command", async () => {
  const skills = await readSkills();

  for (const [name, document] of Object.entries(skills)) {
    assert.match(document, /stage-boundary\.mjs/, `${name} must name the stage-boundary command`);
    assert.doesNotMatch(document, /(?:append|write|edit)[^\n]*events\.jsonl/i, `${name} must not direct-write JSONL`);
    // Skills no longer construct keys; the command derives them.
    assert.doesNotMatch(document, /--idempotency-key/, `${name} must not pass an idempotency key of its own`);
  }
  for (const [name, document] of Object.entries(skillPaths)) {
    assert.match(skills[name], /references\/stage-boundary\.md/, `${name} must point at the boundary reference`);
    assert.ok(document);
  }

  // Each stage names the entry it makes; `exit` belongs to whichever activity closes the stage.
  for (const [name, entry] of Object.entries({
    Scope: "enter --stage Scope --activity scope",
    Design: "enter --stage Plan --activity design",
    Plan: "enter --stage Plan --activity planning",
    Implement: "enter --stage Implement --activity phase",
    Verify: "enter --stage Verify --activity verification",
    Close: "enter --stage Close --activity closeout",
  })) {
    assert.match(skills[name], new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${name} must name its entry`);
  }
  for (const name of ["Scope", "Plan", "Implement", "Verify", "Close"]) {
    assert.match(skills[name], /`exit --feedback|`exit` with/, `${name} must name its exit`);
  }
  assert.match(skills.Design, /Planning owns `exit`/, "Design does not exit the Plan stage");
  assert.match(skills.Close, /--terminal-reason workstream-closed/, "Close ends the workstream through exit");
});

test("the boundary command owns the derived keys, and the journal CLI keeps the rest", async () => {
  const [boundary, router, checkpoint] = await Promise.all([
    read("skills/myflow/references/stage-boundary.md"),
    read("skills/myflow/SKILL.md"),
    read("skills/myflow/templates/stage-context-checkpoint.md"),
  ]);

  assert.match(boundary, /derives\s+each\s+idempotency\s+key\s+from\s+the\s+workstream,\s+the\s+canonical\s+stage,\s+the\s+stage\s+attempt,\s+the\s+owning\s+activity,\s+and\s+the\s+action/i);
  assert.match(boundary, /never\s+invents\s+a\s+key/i);
  assert.match(router, /derives every idempotency key/i);
  assert.match(checkpoint, /derives every idempotency key/i);

  for (const subcommand of ["enter", "accept", "exit", "return"]) {
    assert.match(boundary, new RegExp(`\`${subcommand}\``), `the reference must document ${subcommand}`);
  }
  for (const event of ["stage-entered", "activity-entered", "artifact-accepted", "feedback-requested", "feedback-recorded", "activity-completed", "stage-completed"]) {
    assert.match(boundary, new RegExp(event, "i"), `the reference must say which subcommand records ${event}`);
  }
  for (const event of ["return-opened", "return-rerouted", "return-owner-ready", "return-resumed", "return-closed"]) {
    assert.match(boundary, new RegExp(event, "i"));
  }
  // The events the boundary command does not own still go through the low-level CLI.
  assert.match(boundary, /lifecycle-journal\.mjs[^.]*stage-blocked[^.]*stage-unblocked[^.]*verification-completed/s);
});

test("stage contracts preserve correction ownership and immutable history", async () => {
  const skills = await readSkills();
  const joined = Object.values(skills).join("\n");

  // Ownership is a workflow rule, stated once in the router.
  assert.match(skills.MyFlow, /outcome-or-acceptance[^\n]*Scope/is);
  assert.match(skills.MyFlow, /architecture[^\n]*Plan[^\n]*design/is);
  assert.match(skills.MyFlow, /plan[^\n]*Plan[^\n]*planning/is);
  assert.match(skills.MyFlow, /implementation[^\n]*Implement[^\n]*phase/is);
  assert.match(joined, /preserve[^.\n]*(?:attempts|artifacts)[^.\n]*histor/i);
});

test("feedback contract is exact, private, once per attempt, and non-blocking", async () => {
  const [boundary, checkpoint, myflow, capabilities, implement, verify] = await Promise.all([
    read("skills/myflow/references/stage-boundary.md"),
    read("skills/myflow/templates/stage-context-checkpoint.md"),
    read("skills/myflow/SKILL.md"),
    read("skills/myflow/references/capabilities.md"),
    read("skills/implement/SKILL.md"),
    read("skills/verify/SKILL.md"),
  ]);
  // The wording lives once, in the boundary reference; the capability reference says how to ask it.
  const contract = `${boundary}\n${checkpoint}\n${myflow}\n${capabilities}`;

  assert.match(boundary, /Before we leave \{stage\}, how did this stage go from your point of view\?/);
  for (const choice of ["smooth", "some-friction", "rough", "skip"]) assert.match(boundary, new RegExp(choice));
  assert.match(contract, /once per eligible (?:completed )?attempt/i);
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
    read("skills/myflow/scripts/stage-boundary.mjs"),
  ]);
  for (const module of core) {
    assert.doesNotMatch(module, /pi-subagents|tool_call|ask_user_question|@langfuse/i);
  }
});

test("only host-detection names an agent's environment variables", async () => {
  const [detection, boundary, reference] = await Promise.all([
    read("skills/myflow/scripts/lib/host-detection.mjs"),
    read("skills/myflow/scripts/stage-boundary.mjs"),
    read("skills/myflow/references/stage-boundary.md"),
  ]);

  assert.match(detection, /PI_SESSION_ID/, "the design's first known host stays listed");
  assert.doesNotMatch(boundary, /_SESSION_ID/, "the command reads the table, it does not repeat it");
  // Rule 4 of the skill lint forbids an agent's own spelling in skill Markdown; the
  // reference therefore describes the behaviour without naming a variable.
  assert.doesNotMatch(reference, /\bPI_|_SESSION_ID|CLAUDE/);
  assert.match(reference, /records the host and the session identifier when the environment names them/i);
});
