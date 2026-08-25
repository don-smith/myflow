#!/usr/bin/env node
import { appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

function git(...args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
}

git("init", "-q");
git("config", "user.name", "Architecture Fixture");
git("config", "user.email", "fixture@example.invalid");
git("add", "README.md", "package.json", "context", "docs", "src");
git("commit", "-q", "-m", "Create commerce records");

await appendFile("src/billing/invoice.ts", "\n// Corrections are tracked with their ledger evidence.\n");
await appendFile("src/shared/ledger.ts", "\n// Billing correction audit linkage.\n");
git("add", "src/billing/invoice.ts", "src/shared/ledger.ts");
git("commit", "-q", "-m", "Link invoice corrections to ledger audit");

await appendFile("src/fulfillment/shipment.ts", "\n// TODO: rename remaining shipment process symbols to dispatch.\n");
await appendFile("context/glossary.md", "\nDispatch is the canonical process term for new work.\n");
git("add", "src/fulfillment/shipment.ts", "context/glossary.md");
git("commit", "-q", "-m", "Clarify dispatch terminology");

for (const file of [
  "README.md",
  "context/architecture.md",
  "context/glossary.md",
  "docs/operations.md",
  "src/billing/invoice.ts",
  "src/shared/ledger.ts",
  "src/fulfillment/shipment.ts",
]) await appendFile(file, "\n");
git("add", "README.md", "context", "docs", "src");
git("commit", "-q", "-m", "Format repository");
