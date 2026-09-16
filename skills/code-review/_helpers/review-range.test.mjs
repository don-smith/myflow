import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const helper = new URL("./review-range.mjs", import.meta.url);

const git = (cwd, args) =>
	execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });

const runHelper = (cwd, scope, options = {}) =>
	execFileSync(process.execPath, [helper.pathname, scope], {
		cwd,
		encoding: "utf-8",
		env: { ...process.env, ...options.env },
	});

const changedFilesBody = (output) => output.split("---changed-files---\n", 2)[1];

const changedFiles = (output) => {
	const body = changedFilesBody(output);
	if (!body) return [];
	const lines = body.endsWith("\n") ? body.slice(0, -1).split("\n") : body.split("\n");
	return lines.filter(Boolean).map((line) => {
		try {
			return JSON.parse(line);
		} catch {
			return line;
		}
	});
};

const outputField = (output, name) => {
	const match = output.match(new RegExp(`^${name}:\\s+(.+)$`, "m"));
	assert.ok(match, `missing ${name} in helper output`);
	return match[1];
};

const patchEvidence = (output) => readFileSync(outputField(output, "patch_path"), "utf8");

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
		const main = git(repo, ["rev-parse", "main"]).trim();
		git(repo, ["update-ref", "refs/remotes/origin/main", main]);
		git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "committed.txt"), "feature commit\n");
		git(repo, ["add", "committed.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		writeFileSync(join(repo, "tracked.txt"), "working tree\n");
		git(repo, ["add", "tracked.txt"]);
		writeFileSync(join(repo, "untracked.txt"), "untracked\n");

		const output = runHelper(repo, "all");
		const patch = patchEvidence(output);

		assert.match(output, /default_branch:\s+origin\/main/);
		assert.match(output, /strategy:\s+branch-all/);
		assert.match(output, /scope_status:\s+ready/);
		assert.match(output, /dirty_state:\s+dirty/);
		assert.match(output, /changed_files_count:\s+3/);
		assert.deepEqual(changedFiles(output), ["committed.txt", "tracked.txt", "untracked.txt"]);
		for (const file of ["committed.txt", "tracked.txt", "untracked.txt"]) {
			assert.match(patch, new RegExp(`diff --git (?:a|/dev/null)/${file.replace(".", "\\.")}`));
		}
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("all scope preserves opposing cached and unstaged layers in manifest and patch evidence", () => {
	const repo = createRepo();
	try {
		writeFileSync(join(repo, "base.txt"), "staged version\n");
		git(repo, ["add", "base.txt"]);
		writeFileSync(join(repo, "base.txt"), "base\n");

		for (const scope of ["all", "auto"]) {
			const output = runHelper(repo, scope);
			const patch = patchEvidence(output);

			assert.match(output, /scope_status:\s+ready/);
			assert.match(output, /changed_files_count:\s+1/);
			assert.deepEqual(changedFiles(output), ["base.txt"]);
			assert.match(patch, /cached changes relative to HEAD/);
			assert.match(patch, /-base\n\+staged version/);
			assert.match(patch, /unstaged changes relative to index/);
			assert.match(patch, /-staged version\n\+base/);
		}
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("all scope includes files introduced by a clean merge", () => {
	const repo = createRepo();
	try {
		const main = git(repo, ["rev-parse", "main"]).trim();
		git(repo, ["update-ref", "refs/remotes/origin/main", main]);
		git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
		git(repo, ["checkout", "-qb", "integration"]);
		git(repo, ["checkout", "-qb", "feature", "main"]);
		writeFileSync(join(repo, "merged.txt"), "merged\n");
		git(repo, ["add", "merged.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		git(repo, ["checkout", "-q", "integration"]);
		writeFileSync(join(repo, "main.txt"), "main\n");
		git(repo, ["add", "main.txt"]);
		git(repo, ["commit", "-qm", "main"]);
		git(repo, ["merge", "-q", "--no-ff", "feature", "-m", "clean merge"]);

		const output = runHelper(repo, "all");

		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["main.txt", "merged.txt"]);
		assert.match(patchEvidence(output), /diff --git a\/merged\.txt b\/merged\.txt/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("all scope preserves a remote-only default ref in a detached checkout", () => {
	const repo = createRepo();
	try {
		const main = git(repo, ["rev-parse", "main"]).trim();
		git(repo, ["update-ref", "refs/remotes/origin/main", main]);
		git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
		git(repo, ["checkout", "-q", "--detach", main]);
		git(repo, ["branch", "-D", "main"]);
		writeFileSync(join(repo, "detached-feature.txt"), "detached feature\n");
		git(repo, ["add", "detached-feature.txt"]);
		git(repo, ["commit", "-qm", "detached feature"]);
		const head = git(repo, ["rev-parse", "HEAD"]).trim();

		const output = runHelper(repo, "all");

		assert.match(output, /default_branch:\s+origin\/main/);
		assert.match(output, /strategy:\s+branch-all/);
		assert.match(output, new RegExp(`base:\\s+${main}`));
		assert.match(output, new RegExp(`tip:\\s+${head}`));
		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["detached-feature.txt"]);
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

test("explicit range rejects extra separators and empty endpoints", () => {
	const repo = createRepo();
	try {
		const base = git(repo, ["rev-parse", "HEAD"]).trim();
		writeFileSync(join(repo, "feature.txt"), "feature\n");
		git(repo, ["add", "feature.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		const head = git(repo, ["rev-parse", "HEAD"]).trim();

		for (const scope of [`${base}..${head}..HEAD`, `${base}..`, `..${head}`]) {
			const output = runHelper(repo, scope);

			assert.match(output, /strategy:\s+unrecognised/);
			assert.match(output, /scope_status:\s+invalid/);
			assert.match(output, /note:\s+malformed explicit range/);
			assert.deepEqual(changedFiles(output), []);
		}
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("single root commit scope includes the root commit", () => {
	const repo = createRepo();
	try {
		const root = git(repo, ["rev-parse", "HEAD"]).trim();
		const emptyTree = git(repo, ["hash-object", "-t", "tree", "/dev/null"]).trim();

		for (const scope of [root, "commit"]) {
			const output = runHelper(repo, scope);

			assert.match(output, new RegExp(`base:\\s+${emptyTree}`));
			assert.match(output, /scope_status:\s+ready/);
			assert.deepEqual(changedFiles(output), ["base.txt"]);
			assert.match(patchEvidence(output), /\+base/);
		}
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("commit scope at a clean merge includes changes relative to its first parent", () => {
	const repo = createRepo();
	try {
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "feature.txt"), "feature\n");
		git(repo, ["add", "feature.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		git(repo, ["checkout", "-q", "main"]);
		writeFileSync(join(repo, "main.txt"), "main\n");
		git(repo, ["add", "main.txt"]);
		git(repo, ["commit", "-qm", "main"]);
		const firstParent = git(repo, ["rev-parse", "HEAD"]).trim();
		git(repo, ["merge", "-q", "--no-ff", "feature", "-m", "clean merge"]);
		const merge = git(repo, ["rev-parse", "HEAD"]).trim();

		const output = runHelper(repo, "commit");

		assert.match(output, new RegExp(`base:\\s+${firstParent}`));
		assert.match(output, new RegExp(`tip:\\s+${merge}`));
		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["feature.txt"]);
		assert.match(patchEvidence(output), /diff --git a\/feature\.txt b\/feature\.txt/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("commit scope at a merge includes conflict resolution relative to its first parent", () => {
	const repo = createRepo();
	try {
		writeFileSync(join(repo, "conflict.txt"), "shared\n");
		git(repo, ["add", "conflict.txt"]);
		git(repo, ["commit", "-qm", "shared file"]);
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "conflict.txt"), "feature\n");
		git(repo, ["commit", "-qam", "feature edit"]);
		git(repo, ["checkout", "-q", "main"]);
		writeFileSync(join(repo, "conflict.txt"), "main\n");
		git(repo, ["commit", "-qam", "main edit"]);
		const firstParent = git(repo, ["rev-parse", "HEAD"]).trim();
		assert.throws(() => git(repo, ["merge", "--no-ff", "feature", "-m", "conflicted merge"]));
		writeFileSync(join(repo, "conflict.txt"), "resolved\n");
		git(repo, ["add", "conflict.txt"]);
		git(repo, ["commit", "-qm", "resolved merge"]);

		const output = runHelper(repo, "commit");

		assert.match(output, new RegExp(`base:\\s+${firstParent}`));
		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["conflict.txt"]);
		assert.match(patchEvidence(output), /-main\n\+resolved/);
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

test("named branch scope includes files introduced by a clean merge", () => {
	const repo = createRepo();
	try {
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "merged.txt"), "merged\n");
		git(repo, ["add", "merged.txt"]);
		git(repo, ["commit", "-qm", "feature"]);
		git(repo, ["checkout", "-qb", "integration", "main"]);
		writeFileSync(join(repo, "integration.txt"), "integration\n");
		git(repo, ["add", "integration.txt"]);
		git(repo, ["commit", "-qm", "integration"]);
		git(repo, ["merge", "-q", "--no-ff", "feature", "-m", "clean merge"]);
		git(repo, ["checkout", "-q", "main"]);

		const output = runHelper(repo, "integration");

		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["integration.txt", "merged.txt"]);
		assert.match(patchEvidence(output), /diff --git a\/merged\.txt b\/merged\.txt/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("working-tree strategies produce matching manifests and patch evidence", () => {
	const repo = createRepo();
	try {
		writeFileSync(join(repo, "staged.txt"), "staged\n");
		git(repo, ["add", "staged.txt"]);
		writeFileSync(join(repo, "base.txt"), "unstaged\n");

		const staged = runHelper(repo, "staged");
		assert.deepEqual(changedFiles(staged), ["staged.txt"]);
		assert.match(patchEvidence(staged), /diff --git a\/staged\.txt b\/staged\.txt/);
		assert.doesNotMatch(patchEvidence(staged), /diff --git a\/base\.txt b\/base\.txt/);

		const working = runHelper(repo, "working");
		assert.deepEqual(changedFiles(working), ["base.txt"]);
		assert.match(patchEvidence(working), /diff --git a\/base\.txt b\/base\.txt/);
		assert.doesNotMatch(patchEvidence(working), /diff --git a\/staged\.txt b\/staged\.txt/);

		const modified = runHelper(repo, "modified");
		assert.deepEqual(changedFiles(modified), ["base.txt", "staged.txt"]);
		assert.match(patchEvidence(modified), /diff --git a\/base\.txt b\/base\.txt/);
		assert.match(patchEvidence(modified), /diff --git a\/staged\.txt b\/staged\.txt/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("invalid scope is explicit, clears patch evidence, and never masquerades as an empty pass", () => {
	const repo = createRepo();
	try {
		const validOutput = runHelper(repo, git(repo, ["rev-parse", "HEAD"]).trim());
		assert.notEqual(patchEvidence(validOutput), "");
		const output = runHelper(repo, "missing-review-ref");

		assert.match(output, /strategy:\s+unrecognised/);
		assert.match(output, /scope_status:\s+invalid/);
		assert.match(output, /note:\s+scope spec not recognised/);
		assert.deepEqual(changedFiles(output), []);
		assert.equal(patchEvidence(output), "");
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("changed-files cap counts UTF-8 bytes and reserves the truncation footer", () => {
	const repo = createRepo();
	try {
		git(repo, ["config", "core.quotePath", "false"]);
		for (let index = 0; index < 220; index += 1) {
			const name = `${String(index).padStart(3, "0")}-${"界".repeat(70)}.txt`;
			writeFileSync(join(repo, name), `${index}\n`);
		}
		git(repo, ["add", "-A"]);

		const output = runHelper(repo, "staged");
		const body = changedFilesBody(output);

		assert.match(output, /changed_files_count:\s+220/);
		assert.match(body, /\(\.\.\. \d+ more files truncated \.\.\.\)\n$/);
		assert.ok(Buffer.byteLength(body, "utf8") <= 40 * 1024);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("all and named-branch scopes omit reverted paths that have no endpoint patch", () => {
	const repo = createRepo();
	try {
		const main = git(repo, ["rev-parse", "main"]).trim();
		git(repo, ["update-ref", "refs/remotes/origin/main", main]);
		git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "reverted.txt"), "temporary\n");
		git(repo, ["add", "reverted.txt"]);
		git(repo, ["commit", "-qm", "temporary change"]);
		git(repo, ["rm", "-q", "reverted.txt"]);
		git(repo, ["commit", "-qm", "revert temporary change"]);
		writeFileSync(join(repo, "lasting.txt"), "lasting\n");
		git(repo, ["add", "lasting.txt"]);
		git(repo, ["commit", "-qm", "lasting change"]);

		for (const scope of ["all", "feature"]) {
			const output = runHelper(repo, scope);
			assert.match(output, /scope_status:\s+ready/);
			assert.deepEqual(changedFiles(output), ["lasting.txt"]);
			assert.match(patchEvidence(output), /diff --git a\/lasting\.txt b\/lasting\.txt/);
			assert.doesNotMatch(patchEvidence(output), /reverted\.txt/);
		}
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("full SHA-256 commit IDs resolve as commit scope when supported by Git", (t) => {
	const repo = mkdtempSync(join(tmpdir(), "review-range-sha256-"));
	try {
		try {
			git(repo, ["init", "-q", "--object-format=sha256", "-b", "main"]);
		} catch {
			t.skip("local Git does not support git init --object-format=sha256");
			return;
		}
		git(repo, ["config", "user.email", "test@example.com"]);
		git(repo, ["config", "user.name", "Test"]);
		writeFileSync(join(repo, "sha256.txt"), "sha256\n");
		git(repo, ["add", "sha256.txt"]);
		git(repo, ["commit", "-qm", "sha256 commit"]);
		const commit = git(repo, ["rev-parse", "HEAD"]).trim();
		assert.equal(commit.length, 64);

		const output = runHelper(repo, commit);
		assert.match(output, /strategy:\s+explicit-range/);
		assert.match(output, new RegExp(`tip:\\s+${commit}`));
		assert.match(output, /scope_status:\s+ready/);
		assert.deepEqual(changedFiles(output), ["sha256.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("changed-file manifests preserve leading, trailing, and newline path bytes", () => {
	const repo = createRepo();
	try {
		const paths = [" leading.txt", "trailing.txt ", "line\nbreak.txt"];
		for (const path of paths) writeFileSync(join(repo, path), `${JSON.stringify(path)}\n`);
		git(repo, ["add", "-A"]);

		const output = runHelper(repo, "staged");
		assert.match(output, /scope_status:\s+ready/);
		assert.equal(outputField(output, "changed_files_count"), "3");
		assert.deepEqual(changedFiles(output), [" leading.txt", "line\nbreak.txt", "trailing.txt "]);
		for (const path of paths) assert.ok(changedFilesBody(output).includes(JSON.stringify(path)));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("origin HEAD takes precedence over a stale local default branch", () => {
	const repo = createRepo();
	try {
		const staleMain = git(repo, ["rev-parse", "main"]).trim();
		git(repo, ["checkout", "-qb", "upstream"]);
		writeFileSync(join(repo, "upstream.txt"), "upstream\n");
		git(repo, ["add", "upstream.txt"]);
		git(repo, ["commit", "-qm", "upstream change"]);
		const remoteMain = git(repo, ["rev-parse", "HEAD"]).trim();
		git(repo, ["update-ref", "refs/remotes/origin/main", remoteMain]);
		git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
		git(repo, ["checkout", "-qb", "feature"]);
		writeFileSync(join(repo, "feature.txt"), "feature\n");
		git(repo, ["add", "feature.txt"]);
		git(repo, ["commit", "-qm", "feature change"]);

		const output = runHelper(repo, "all");
		assert.match(output, /default_branch:\s+origin\/main/);
		assert.match(output, new RegExp(`base:\\s+${remoteMain}`));
		assert.doesNotMatch(output, new RegExp(`base:\\s+${staleMain}`));
		assert.deepEqual(changedFiles(output), ["feature.txt"]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("patch generation streams more than 1 MiB without losing tail evidence", () => {
	const repo = createRepo();
	try {
		const tail = "TAIL-EVIDENCE-7d558768";
		writeFileSync(join(repo, "large.txt"), `${"x".repeat(1024 * 1024 + 128 * 1024)}\n${tail}\n`);
		git(repo, ["add", "large.txt"]);
		git(repo, ["commit", "-qm", "large patch"]);

		const output = runHelper(repo, "commit");
		const patch = patchEvidence(output);
		assert.match(output, /scope_status:\s+ready/);
		assert.ok(Buffer.byteLength(patch) > 1024 * 1024);
		assert.match(patch, new RegExp(tail));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("patch generation failure makes scope invalid instead of ready", () => {
	const repo = createRepo();
	const bin = mkdtempSync(join(tmpdir(), "review-range-git-wrapper-"));
	try {
		writeFileSync(join(repo, "changed.txt"), "changed\n");
		git(repo, ["add", "changed.txt"]);
		git(repo, ["commit", "-qm", "changed"]);
		const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
		const wrapper = join(bin, "git");
		writeFileSync(
			wrapper,
			`#!/bin/sh\ncase "$*" in\n  "diff --no-ext-diff --binary -U30"*) exit 2 ;;\nesac\nexec ${JSON.stringify(realGit)} "$@"\n`,
		);
		chmodSync(wrapper, 0o755);

		const output = runHelper(repo, "commit", { env: { PATH: `${bin}:${process.env.PATH}` } });
		assert.match(output, /scope_status:\s+invalid/);
		assert.match(output, /note:\s+patch generation failed/i);
	} finally {
		rmSync(bin, { recursive: true, force: true });
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
