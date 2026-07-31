import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const helper = new URL("./review-range.mjs", import.meta.url);

const git = (cwd, args) =>
	execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });

const changedFiles = (output) => output.split("---changed-files---\n", 2)[1].trim().split("\n");

test("all scope includes committed, tracked working-tree, and untracked files", () => {
	const repo = mkdtempSync(join(tmpdir(), "review-range-"));
	try {
		git(repo, ["init", "-qb", "main"]);
		git(repo, ["config", "user.email", "test@example.com"]);
		git(repo, ["config", "user.name", "Test"]);
		writeFileSync(join(repo, "base.txt"), "base\n");
		git(repo, ["add", "base.txt"]);
		git(repo, ["commit", "-qm", "base"]);
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "committed.txt"), "feature commit\n");
		git(repo, ["add", "committed.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		writeFileSync(join(repo, "tracked.txt"), "working tree\n");
		git(repo, ["add", "tracked.txt"]);
		writeFileSync(join(repo, "untracked.txt"), "untracked\n");

		const output = execFileSync(process.execPath, [helper.pathname, "all"], {
			cwd: repo,
			encoding: "utf-8",
		});

		assert.match(output, /strategy:\s+branch-all/);
		assert.deepEqual(changedFiles(output), ["committed.txt", "tracked.txt", "untracked.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
