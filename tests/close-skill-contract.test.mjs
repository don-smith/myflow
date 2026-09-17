import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Close is resolver-aware, proportionate, and resumable", async () => {
  const close = await readFile("skills/close/SKILL.md", "utf8");
  for (const phrase of [
    "resolve-repository-map.mjs",
    "validation report",
    "<workstream-id>/close/",
    "proportionate",
    "closeout summary",
    "final closeout commit",
    "integration decision",
    "follow-up destination",
    "stage-boundary.mjs",
    "enter --stage Close --activity closeout",
    "stage-completed",
    "workstream-closed",
    "private stage pulse",
    "references/stage-boundary.md",
  ]) assert.match(close, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(close, /_shared|repo-store|eight|AGENTS\.md|must be empty/i);
});
