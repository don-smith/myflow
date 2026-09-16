import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const helper = new URL("./review-range.mjs", import.meta.url);

const git = (cwd, args) =>
	execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });

const runHelper = (cwd, scope) =>
	execFileSync(process.execPath, [helper.pathname, scope], { cwd, encoding: "utf-8" });

const changedFiles = (output) => {
	const body = output.split("---changed-files---\n", 2)[1].trim();
	return body ? body.split("\n") : [];
};

const createRepo = () => {
	const repo = mkdtempSync(join(tmpdir(), "review-range-"));
	git(repo, ["init", "-qb", "main"]);
	git(repo, ["config", "user.email", "test@example.com"]);
	git(repo, ["config", "user.name", "Test"]);
	writeFileSync(join(repo, "base.txt"), "base\n");
	git(repo, ["add", "base.txt"]);
	git(repo, ["commit", "-qm", "base"]);
	return repo;
};

test("all scope includes committed, tracked working-tree, and untracked files", () => {
	const repo = createRepo();
	try {
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "committed.txt"), "feature commit\n");
		git(repo, ["add", "committed.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		writeFileSync(join(repo, "tracked.txt"), "working tree\n");
		git(repo, ["add", "tracked.txt"]);
		writeFileSync(join(repo, "untracked.txt"), "untracked\n");

		const output = runHelper(repo, "all");

		assert.match(output, /strategy:\s+branch-all/);
		assert.match(output, /scope_status:\s+ready/);
		assert.match(output, /dirty_state:\s+dirty/);
		assert.match(output, /changed_files_count:\s+3/);
		assert.deepEqual(changedFiles(output), ["committed.txt", "tracked.txt", "untracked.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("explicit range preserves the supplied base and head", () => {
	const repo = createRepo();
	try {
		writeFileSync(join(repo, "before.txt"), "before\n");
		git(repo, ["add", "before.txt"]);
		git(repo, ["commit", "-qm", "before range"]);
		const base = git(repo, ["rev-parse", "HEAD"]).trim();
		writeFileSync(join(repo, "feature.txt"), "feature\n");
		git(repo, ["add", "feature.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		const head = git(repo, ["rev-parse", "HEAD"]).trim();

		const output = runHelper(repo, `${base}..${head}`);

		assert.match(output, new RegExp(`base:\\s+${base}`));
		assert.match(output, new RegExp(`tip:\\s+${head}`));
		assert.deepEqual(changedFiles(output), ["feature.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("single root commit scope includes the root commit", () => {
	const repo = createRepo();
	try {
		const root = git(repo, ["rev-parse", "HEAD"]).trim();

		const output = runHelper(repo, root);

		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["base.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("explicit empty-tree range includes a root implementation through its final commit", () => {
	const repo = createRepo();
	try {
		writeFileSync(join(repo, "follow-up.txt"), "follow-up\n");
		git(repo, ["add", "follow-up.txt"]);
		git(repo, ["commit", "-qm", "follow-up"]);
		const head = git(repo, ["rev-parse", "HEAD"]).trim();
		const emptyTree = git(repo, ["hash-object", "-t", "tree", "/dev/null"]).trim();

		const output = runHelper(repo, `empty-tree..${head}`);

		assert.match(output, /strategy:\s+explicit-range/);
		assert.match(output, new RegExp(`base:\\s+${emptyTree}`));
		assert.match(output, new RegExp(`tip:\\s+${head}`));
		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["base.txt", "follow-up.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("commit-list scope includes the oldest named commit on a linear chain", () => {
	const repo = createRepo();
	try {
		const base = git(repo, ["rev-parse", "HEAD"]).trim();
		writeFileSync(join(repo, "first.txt"), "first\n");
		git(repo, ["add", "first.txt"]);
		git(repo, ["commit", "-qm", "first named commit"]);
		const oldest = git(repo, ["rev-parse", "HEAD"]).trim();
		writeFileSync(join(repo, "second.txt"), "second\n");
		git(repo, ["add", "second.txt"]);
		git(repo, ["commit", "-qm", "second named commit"]);
		const newest = git(repo, ["rev-parse", "HEAD"]).trim();

		const output = runHelper(repo, `${newest},${oldest}`);

		assert.match(output, new RegExp(`oldest:\\s+${oldest}`));
		assert.match(output, new RegExp(`newest:\\s+${newest}`));
		assert.match(output, new RegExp(`base:\\s+${base}`));
		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["first.txt", "second.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("commit-list scope rejects divergent commits", () => {
	const repo = createRepo();
	try {
		git(repo, ["checkout", "-qb", "left"]);
		writeFileSync(join(repo, "left.txt"), "left\n");
		git(repo, ["add", "left.txt"]);
		git(repo, ["commit", "-qm", "left"]);
		const left = git(repo, ["rev-parse", "HEAD"]).trim();
		git(repo, ["checkout", "-qb", "right", "main"]);
		writeFileSync(join(repo, "right.txt"), "right\n");
		git(repo, ["add", "right.txt"]);
		git(repo, ["commit", "-qm", "right"]);
		const right = git(repo, ["rev-parse", "HEAD"]).trim();

		const output = runHelper(repo, `${left},${right}`);

		assert.match(output, /strategy:\s+unrecognised/);
		assert.match(output, /scope_status:\s+invalid/);
		assert.match(output, /note:\s+commit list not on a single ancestry chain/);
		assert.deepEqual(changedFiles(output), []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("commit-list scope rejects divergent commits even with a common ancestor and merge descendant", () => {
	const repo = createRepo();
	try {
		const ancestor = git(repo, ["rev-parse", "HEAD"]).trim();
		git(repo, ["checkout", "-qb", "left"]);
		writeFileSync(join(repo, "left.txt"), "left\n");
		git(repo, ["add", "left.txt"]);
		git(repo, ["commit", "-qm", "left"]);
		const left = git(repo, ["rev-parse", "HEAD"]).trim();
		git(repo, ["checkout", "-qb", "right", "main"]);
		writeFileSync(join(repo, "right.txt"), "right\n");
		git(repo, ["add", "right.txt"]);
		git(repo, ["commit", "-qm", "right"]);
		const right = git(repo, ["rev-parse", "HEAD"]).trim();
		git(repo, ["merge", "-q", "--no-ff", "left", "-m", "merge"]);
		const merge = git(repo, ["rev-parse", "HEAD"]).trim();

		const output = runHelper(repo, `${ancestor},${left},${right},${merge}`);

		assert.match(output, /strategy:\s+unrecognised/);
		assert.match(output, /scope_status:\s+invalid/);
		assert.match(output, /note:\s+commit list not on a single ancestry chain/);
		assert.deepEqual(changedFiles(output), []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("named branch scope uses its tip and merge base while another branch is checked out", () => {
	const repo = createRepo();
	try {
		const base = git(repo, ["rev-parse", "HEAD"]).trim();
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "feature.txt"), "feature\n");
		git(repo, ["add", "feature.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		const featureTip = git(repo, ["rev-parse", "HEAD"]).trim();
		git(repo, ["checkout", "-q", "main"]);
		writeFileSync(join(repo, "main-only.txt"), "main only\n");
		git(repo, ["add", "main-only.txt"]);
		git(repo, ["commit", "-qm", "main only"]);

		const output = runHelper(repo, "feature");

		assert.match(output, new RegExp(`base:\\s+${base}`));
		assert.match(output, new RegExp(`tip:\\s+${featureTip}`));
		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["feature.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("invalid scope is explicit and never masquerades as an empty pass", () => {
	const repo = createRepo();
	try {
		const output = runHelper(repo, "missing-review-ref");

		assert.match(output, /strategy:\s+unrecognised/);
		assert.match(output, /scope_status:\s+invalid/);
		assert.match(output, /note:\s+scope spec not recognised/);
		assert.deepEqual(changedFiles(output), []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("valid scope with no changed files is reported as empty", () => {
	const repo = createRepo();
	try {
		const output = runHelper(repo, "all");

		assert.match(output, /strategy:\s+branch-all/);
		assert.match(output, /scope_status:\s+empty/);
		assert.match(output, /dirty_state:\s+clean/);
		assert.match(output, /changed_files_count:\s+0/);
		assert.deepEqual(changedFiles(output), []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
