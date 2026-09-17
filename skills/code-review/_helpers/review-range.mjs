// review-range.mjs — scope resolution helper for the code-review skill.
//
// LLM-invoked (not render-time substituted). The LLM derives the scope spec
// from `$ARGUMENTS` (or `ask_user_question` clarification) and runs:
//
//   node "${SKILL_DIR}/_helpers/review-range.mjs" "<scope-spec>"
//
// Accepted <scope-spec> values:
//   auto                — empty-scope-default: complete current-branch review (committed, tracked, untracked)
//   commit              — review the most recent commit (working-tree-style, HEAD)
//   staged              — files staged for commit (git diff --cached)
//   working             — files with unstaged changes only (git diff)
//   modified            — every tracked file differing from HEAD (git diff HEAD; staged + unstaged, no untracked)
//   all                 — every current-branch change: committed since default base, staged, unstaged, and untracked
//   <hash>              — single SHA-1 or SHA-256 commit (abbreviated or full)
//   <A>..<B>            — exact base..head range; A is verified ancestor of B, swapped if reversed
//   empty-tree..<B>     — root-inclusive range through B
//   <h1>,<h2>,<h3>      — exact commit list on one total ancestry chain
//   <branch-name>       — committed changes from the branch merge base through its supplied tip
//
// Output (labeled key/value lines, then `---changed-files---` block):
//
//   default_branch: <name>|(unresolved)
//   scope_spec:     <JSON string preserving the exact input>
//   strategy:       branch-all|first-parent|working-tree|explicit-range|commit-list|unrecognised
//   resolved_commits: <ordered comma-separated hashes>|(n/a)
//   oldest:         <hash>|(n/a)
//   newest:         <hash>|(n/a)
//   base:           <hash>|(n/a) (orientation only for commit-list)
//   tip:            <hash>|(n/a) (orientation only for commit-list)
//   range:          <base>..<tip>|(n/a) (always n/a for commit-list)
//   fp_flag:        --first-parent|(empty)
//   patch_path:     <worktree-safe path for the diff tempfile>
//   scope_status:   ready|empty|invalid
//   dirty_state:    clean|dirty
//   changed_files_count: <N>
//   note:           <reason>          (when scope_status=invalid)
//   ---changed-files---
//   <deduplicated JSON-string path entries, capped at 2000 entries OR 40 KB whichever first>
//
// ChangedFiles cap: 2000 lines OR 40 KB. Footer `(... N more files truncated ...)`
// when hit. Per R-1, helper output is sized for the Pi-bash-tool consumer; this
// helper is LLM-invoked so the 50 KB rpiv-args tail-truncation budget does not
// apply, but the cap keeps output manageable in context.
//
// Load-bearing comments preserved from the original code-review skill:
//   - For first-parent strategies (empty/PR-branch), OLDEST is ALREADY the
//     parent-of-first-feature-commit (computed via git merge-base), so BASE=OLDEST.
//     Do NOT compute BASE=OLDEST^ — that would skip a commit.
//   - An explicit A..B is already a base..head range and must be preserved.
//     `empty-tree..B` is the explicit root-inclusive form. For a single hash
//     only, BASE=hash^ (or the empty tree for a root commit) so the hash's own
//     changes are included.
//   - --first-parent is orthogonal to --no-merges: the former prunes second-parent
//     subtrees from reachability; the latter drops merge commits themselves from
//     the log. Both flags are independently controllable in the consumer's git log.
//   - Always exit 0 (R-8) — unrecognised scope returns strategy=unrecognised with
//     `note:` so the LLM can ask the user via ask_user_question rather than fail.

import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, openSync, writeSync } from "node:fs";
import { resolve } from "node:path";

const CHANGED_FILES_LINE_CAP = 2000;
const CHANGED_FILES_BYTE_CAP = 40 * 1024;

const safe = (args, fb = "") => {
	try {
		return execFileSync("git", args, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return fb;
	}
};

const isAncestor = (a, b) => {
	try {
		execFileSync("git", ["merge-base", "--is-ancestor", a, b], {
			stdio: ["ignore", "ignore", "ignore"],
		});
		return true;
	} catch {
		return false;
	}
};

const refExists = (ref) => {
	try {
		execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], {
			stdio: ["ignore", "ignore", "ignore"],
		});
		return true;
	} catch {
		return false;
	}
};

const resolveDefaultBranch = () => {
	const remoteHead = safe(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
	if (remoteHead && refExists(remoteHead)) return remoteHead;
	if (refExists("refs/heads/main")) return "main";
	if (refExists("refs/heads/master")) return "master";
	return "(unresolved)";
};

const stripOuterQuotes = (s) =>
	s
		.replace(/^['"]/, "")
		.replace(/['"]$/, "")
		.trim();

let scopeFailure = "";

const pathList = (args) => {
	try {
		const raw = execFileSync("git", args, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return raw.endsWith("\0") ? raw.slice(0, -1).split("\0") : raw ? raw.split("\0") : [];
	} catch {
		scopeFailure ||= "changed-file manifest generation failed";
		return [];
	}
};

const dedupChangedFiles = (...lists) => [...new Set(lists.flat())];
const renderPath = (path) => JSON.stringify(path);

const formatChangedFiles = (files) => {
	const included = [];
	for (const file of files) {
		if (included.length >= CHANGED_FILES_LINE_CAP) break;
		const candidate = [...included, `${renderPath(file)}\n`];
		const remaining = files.length - candidate.length;
		const footer = remaining > 0 ? `(... ${remaining} more files truncated ...)\n` : "";
		if (Buffer.byteLength(candidate.join("") + footer, "utf8") > CHANGED_FILES_BYTE_CAP) break;
		included.push(`${renderPath(file)}\n`);
	}

	let footer =
		included.length < files.length ? `(... ${files.length - included.length} more files truncated ...)\n` : "";
	while (
		included.length > 0 &&
		Buffer.byteLength(included.join("") + footer, "utf8") > CHANGED_FILES_BYTE_CAP
	) {
		included.pop();
		footer = `(... ${files.length - included.length} more files truncated ...)\n`;
	}
	return included.join("") + footer;
};

const result = {
	default_branch: resolveDefaultBranch(),
	strategy: "unrecognised",
	oldest: "(n/a)",
	newest: "(n/a)",
	base: "(n/a)",
	tip: "(n/a)",
	range: "(n/a)",
	fp_flag: "(empty)",
	note: "",
	resolvedCommits: [],
	commitDiffs: [],
	changedFiles: [],
};

const argv = process.argv[2] ?? "";
const rawInput = argv;
const scope = stripOuterQuotes(argv);
const lower = scope.toLowerCase();
const defaultBranch = result.default_branch;
const emptyTree = safe(["hash-object", "-t", "tree", "/dev/null"]);

const setFirstParent = (oldest, newest) => {
	result.strategy = "first-parent";
	result.oldest = oldest;
	result.newest = newest;
	result.base = oldest;
	result.tip = newest;
	result.range = `${oldest}..${newest}`;
	result.fp_flag = "--first-parent";
};

const setBranchAll = (oldest, newest) => {
	setFirstParent(oldest, newest);
	result.strategy = "branch-all";
};

const setExplicitRange = (base, tip) => {
	result.strategy = "explicit-range";
	result.oldest = base;
	result.newest = tip;
	result.base = base;
	result.tip = tip;
	result.range = `${base}..${tip}`;
	result.fp_flag = "(empty)";
};

const setWorkingTree = (oldest = "(n/a)", newest = "(n/a)") => {
	result.strategy = "working-tree";
	result.oldest = oldest;
	result.newest = newest;
	result.base = "(n/a)";
	result.tip = "(n/a)";
	result.range = "(n/a)";
	result.fp_flag = "(empty)";
};

const setCommitList = (commits) => {
	const commitDiffs = commits.map((commit) => ({
		commit,
		parent: safe(["rev-parse", `${commit}^1`]) || emptyTree,
	}));
	result.strategy = "commit-list";
	result.resolvedCommits = commits;
	result.commitDiffs = commitDiffs;
	result.oldest = commits[0];
	result.newest = commits.at(-1);
	result.base = commitDiffs[0].parent;
	result.tip = commits.at(-1);
	result.range = "(n/a)";
	result.fp_flag = "(empty)";
};

const objectFormat = safe(["rev-parse", "--show-object-format"]) || "sha1";
const objectIdLength = objectFormat === "sha256" ? 64 : 40;
const resolveCommitId = (candidate) => {
	if (!new RegExp(`^[0-9a-f]{4,${objectIdLength}}$`, "i").test(candidate)) return "";
	return safe(["rev-parse", "--verify", `${candidate}^{commit}`]);
};

if (defaultBranch === "(unresolved)" && (lower === "" || lower === "auto" || lower === "all")) {
	result.strategy = "unrecognised";
	result.note = "default branch unresolved — pass an explicit commit range or run `git remote set-head origin -a`";
} else if (lower === "" || lower === "auto" || lower === "all") {
	const oldest = safe(["merge-base", defaultBranch, "HEAD"]);
	if (oldest) setBranchAll(oldest, safe(["rev-parse", "HEAD"]));
	else result.note = `merge-base ${defaultBranch}..HEAD failed`;
} else if (lower === "commit") {
	const head = safe(["rev-parse", "HEAD"]);
	const parent = safe(["rev-parse", "HEAD^1"]) || emptyTree;
	setExplicitRange(parent, head);
} else if (lower === "staged" || lower === "working" || lower === "modified") {
	setWorkingTree();
} else if (scope.includes("..")) {
	const parts = scope.split("..");
	if (parts.length !== 2 || parts.some((part) => !part) || scope.includes("...")) {
		result.note = `malformed explicit range: ${scope}`;
	} else {
		const [a, b] = parts;
		if (a === "empty-tree" && refExists(b)) {
			setExplicitRange(emptyTree, safe(["rev-parse", b]));
		} else if (refExists(a) && refExists(b)) {
			const aHash = safe(["rev-parse", a]);
			const bHash = safe(["rev-parse", b]);
			if (isAncestor(aHash, bHash)) setExplicitRange(aHash, bHash);
			else if (isAncestor(bHash, aHash)) setExplicitRange(bHash, aHash);
			else result.note = `neither ${a} nor ${b} is an ancestor of the other`;
		} else {
			result.note = `range endpoint(s) do not resolve: ${a}..${b}`;
		}
	}
} else if (/[,\s]/.test(scope)) {
	const candidates = scope.split(/[,\s]+/).filter(Boolean);
	const resolved = candidates.map((candidate) => safe(["rev-parse", `${candidate}^{commit}`]));
	if (resolved.some((commit) => !commit)) {
		result.note = "commit list contains an ID that does not resolve to a commit";
	} else if (new Set(resolved).size !== resolved.length) {
		result.note = "commit list contains a duplicate commit";
	} else if (resolved.length < 2) {
		result.note = `commit list under-specified (need ≥2 distinct valid commits; got ${resolved.length})`;
	} else {
		const hasTotalAncestryOrder = resolved.every((left, index) =>
			resolved.slice(index + 1).every((right) => isAncestor(left, right) || isAncestor(right, left)),
		);
		if (!hasTotalAncestryOrder) {
			result.note = "commit list not on a single ancestry chain";
		} else {
			const ordered = [...resolved].sort((left, right) => (isAncestor(left, right) ? -1 : 1));
			setCommitList(ordered);
		}
	}
} else if (resolveCommitId(scope)) {
	const hash = resolveCommitId(scope);
	const parent = safe(["rev-parse", `${hash}^`]) || emptyTree;
	setExplicitRange(parent, hash);
} else if (refExists(scope)) {
	const tip = safe(["rev-parse", scope]);
	const oldest = safe(["merge-base", defaultBranch, tip]);
	if (oldest) setFirstParent(oldest, tip);
	else result.note = `merge-base ${defaultBranch}..${scope} failed`;
} else {
	result.note = `scope spec not recognised: ${scope}`;
}

// ChangedFiles per strategy. Committed manifests use the same endpoint diff as
// their patch, so a path changed and restored before the tip is not advertised.
if (result.strategy === "branch-all") {
	// Keep cached and unstaged separate: their net HEAD-to-worktree view can
	// cancel even though both layers contain reviewable edits.
	const committed = pathList(["diff", "--name-only", "-z", result.range]);
	const cached = pathList(["diff", "--cached", "--name-only", "-z"]);
	const unstaged = pathList(["diff", "--name-only", "-z"]);
	const untracked = pathList(["ls-files", "--others", "--exclude-standard", "-z"]);
	result.changedFiles = dedupChangedFiles(committed, cached, unstaged, untracked);
} else if (result.strategy === "first-parent" || result.strategy === "explicit-range") {
	result.changedFiles = pathList(["diff", "--name-only", "-z", result.range]);
} else if (result.strategy === "commit-list") {
	result.changedFiles = dedupChangedFiles(
		...result.commitDiffs.map(({ parent, commit }) =>
			pathList(["diff", "--name-only", "-z", parent, commit]),
		),
	);
} else if (result.strategy === "working-tree") {
	if (lower === "staged") {
		result.changedFiles = pathList(["diff", "--cached", "--name-only", "-z"]);
	} else if (lower === "modified") {
		// modified: every tracked file that differs from HEAD (staged + unstaged,
		// no untracked). Matches `git diff HEAD` semantics.
		result.changedFiles = pathList(["diff", "HEAD", "--name-only", "-z"]);
	} else {
		result.changedFiles = pathList(["diff", "--name-only", "-z"]);
	}
}

const dirtyState = safe(["status", "--porcelain=v1", "--untracked-files=normal"]) ? "dirty" : "clean";

// Worktree-safe tempfile location. In a git worktree (or submodule) `.git` is a
// regular FILE (a gitlink), so a literal `.git/<name>` write fails with ENOTDIR.
// `rev-parse --git-path` resolves to the real per-worktree gitdir; in a plain
// checkout it returns `.git/<name>` unchanged. `rev-parse` returns the path
// relative to CWD — resolve to absolute so the orchestrator and every subagent
// hit the same file regardless of the directory they run from.
const patchPath = resolve(
	safe(["rev-parse", "--git-path", "code-review-patch.diff"], ".git/code-review-patch.diff"),
);

let patchFd;
try {
	patchFd = openSync(patchPath, "w");
	const writeLabel = (label) => writeSync(patchFd, `# code-review: ${label}\n`);
	const streamDiff = (args, acceptedStatuses = [0]) => {
		const child = spawnSync("git", ["diff", "--no-ext-diff", "--binary", "-U30", ...args], {
			stdio: ["ignore", patchFd, "ignore"],
		});
		if (child.error || !acceptedStatuses.includes(child.status)) {
			scopeFailure = "patch generation failed";
		}
	};

	if (result.strategy === "branch-all") {
		writeLabel("committed changes");
		streamDiff([result.range]);
		writeLabel("cached changes relative to HEAD");
		streamDiff(["--cached"]);
		writeLabel("unstaged changes relative to index");
		streamDiff([]);
		for (const file of pathList(["ls-files", "--others", "--exclude-standard", "-z"])) {
			writeLabel(`untracked file ${renderPath(file)}`);
			streamDiff(["--no-index", "--", "/dev/null", file], [0, 1]);
		}
	} else if (result.strategy === "first-parent" || result.strategy === "explicit-range") {
		streamDiff([result.range]);
	} else if (result.strategy === "commit-list") {
		for (const { parent, commit } of result.commitDiffs) {
			writeLabel(`commit ${commit} relative to first parent ${parent}`);
			streamDiff([parent, commit]);
		}
	} else if (result.strategy === "working-tree") {
		if (lower === "staged") streamDiff(["--cached"]);
		else if (lower === "modified") streamDiff(["HEAD"]);
		else streamDiff([]);
	}
} catch {
	scopeFailure = "patch generation failed";
} finally {
	if (patchFd !== undefined) closeSync(patchFd);
}

const scopeStatus =
	result.strategy === "unrecognised" || scopeFailure
		? "invalid"
		: result.changedFiles.length === 0
			? "empty"
			: "ready";

const lines = [
	`default_branch: ${result.default_branch}`,
	`scope_spec:     ${JSON.stringify(rawInput)}`,
	`strategy:       ${result.strategy}`,
	`resolved_commits: ${result.resolvedCommits.length > 0 ? result.resolvedCommits.join(",") : "(n/a)"}`,
	`oldest:         ${result.oldest}`,
	`newest:         ${result.newest}`,
	`base:           ${result.base}`,
	`tip:            ${result.tip}`,
	`range:          ${result.range}`,
	`fp_flag:        ${result.fp_flag}`,
	`patch_path:     ${patchPath}`,
	`scope_status:   ${scopeStatus}`,
	`dirty_state:    ${dirtyState}`,
	`changed_files_count: ${result.changedFiles.length}`,
];
if (scopeFailure || result.note) {
	lines.push(`note:           ${scopeFailure || result.note}`);
}
lines.push("---changed-files---");
process.stdout.write(`${lines.join("\n")}\n${formatChangedFiles(result.changedFiles)}`);
