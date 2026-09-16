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
//   <hash>              — single commit (~7+ hex chars)
//   <A>..<B>            — exact base..head range; A is verified ancestor of B, swapped if reversed
//   empty-tree..<B>     — root-inclusive range through B
//   <h1>,<h2>,<h3>      — commit list on one ancestry chain; includes the oldest named commit
//   <branch-name>       — committed changes from the branch merge base through its supplied tip
//
// Output (labeled key/value lines, then `---changed-files---` block):
//
//   default_branch: <name>|(unresolved)
//   strategy:       first-parent|working-tree|explicit-range|unrecognised
//   oldest:         <hash>|(n/a)
//   newest:         <hash>|(n/a)
//   base:           <hash>|(n/a)
//   tip:            <hash>|(n/a)
//   range:          <base>..<tip>|(n/a)
//   fp_flag:        --first-parent|(empty)
//   patch_path:     <worktree-safe path for the diff tempfile>
//   scope_status:   ready|empty|invalid
//   dirty_state:    clean|dirty
//   changed_files_count: <N>
//   note:           <reason>          (only when strategy=unrecognised)
//   ---changed-files---
//   <deduplicated file list, capped at 2000 entries OR 40 KB whichever first>
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

import { execFileSync } from "node:child_process";
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
	if (remoteHead) {
		const localHead = remoteHead.replace(/^origin\//, "");
		if (refExists(`refs/heads/${localHead}`)) return localHead;
		if (refExists(remoteHead)) return remoteHead;
	}
	if (refExists("refs/heads/main")) return "main";
	if (refExists("refs/heads/master")) return "master";
	return "(unresolved)";
};

const stripOuterQuotes = (s) =>
	s
		.replace(/^['"]/, "")
		.replace(/['"]$/, "")
		.trim();

const dedupChangedFiles = (raw) => {
	const seen = new Set();
	const lines = raw.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed) seen.add(trimmed);
	}
	return [...seen];
};

const formatChangedFiles = (files) => {
	let out = "";
	let count = 0;
	for (const f of files) {
		const next = `${f}\n`;
		if (out.length + next.length > CHANGED_FILES_BYTE_CAP) break;
		if (count >= CHANGED_FILES_LINE_CAP) break;
		out += next;
		count += 1;
	}
	if (count < files.length) {
		out += `(... ${files.length - count} more files truncated ...)\n`;
	}
	return out;
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
	changedFiles: [],
};

const argv = process.argv[2] ?? "";
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

const isHexHash = (s) => /^[0-9a-f]{4,40}$/i.test(s);

if (defaultBranch === "(unresolved)" && (lower === "" || lower === "auto" || lower === "all")) {
	result.strategy = "unrecognised";
	result.note = "default branch unresolved — pass an explicit commit range or run `git remote set-head origin -a`";
} else if (lower === "" || lower === "auto" || lower === "all") {
	const oldest = safe(["merge-base", defaultBranch, "HEAD"]);
	if (oldest) setBranchAll(oldest, safe(["rev-parse", "HEAD"]));
	else result.note = `merge-base ${defaultBranch}..HEAD failed`;
} else if (lower === "commit") {
	setWorkingTree(safe(["rev-parse", "HEAD"]), safe(["rev-parse", "HEAD"]));
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
	const hashes = scope.split(/[,\s]+/).filter(Boolean);
	const resolved = hashes.map((hash) => safe(["rev-parse", `${hash}^{commit}`])).filter(Boolean);
	const unique = [...new Set(resolved)];
	if (resolved.length !== hashes.length || unique.length < 2) {
		result.note = `commit list under-specified (need ≥2 distinct valid commits; got ${unique.length})`;
	} else {
		const hasTotalAncestryOrder = unique.every((left, index) =>
			unique.slice(index + 1).every((right) => isAncestor(left, right) || isAncestor(right, left)),
		);
		if (!hasTotalAncestryOrder) {
			result.note = "commit list not on a single ancestry chain";
		} else {
			const oldest = unique.find((candidate) => unique.every((hash) => isAncestor(candidate, hash)));
			const newest = unique.find((candidate) => unique.every((hash) => isAncestor(hash, candidate)));
			const base = safe(["rev-parse", `${oldest}^`]) || emptyTree;
			setExplicitRange(base, newest);
			result.oldest = oldest;
			result.newest = newest;
		}
	}
} else if (isHexHash(scope) && refExists(scope)) {
	const hash = safe(["rev-parse", scope]);
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

// ChangedFiles per strategy.
if (result.strategy === "branch-all") {
	// A complete branch review is a union: committed first-parent changes,
	// tracked working-tree changes, and untracked non-ignored files. Do not use
	// `git diff HEAD` alone: it intentionally omits untracked files.
	const committed = safe(["log", result.range, "--first-parent", "--name-only", "--pretty=format:"]);
	const tracked = safe(["diff", "HEAD", "--name-only"]);
	const untracked = safe(["ls-files", "--others", "--exclude-standard"]);
	result.changedFiles = dedupChangedFiles(`${committed}\n${tracked}\n${untracked}`);
} else if (result.strategy === "first-parent") {
	const raw = safe(["log", result.range, "--first-parent", "--name-only", "--pretty=format:"]);
	result.changedFiles = dedupChangedFiles(raw);
} else if (result.strategy === "explicit-range") {
	const raw = safe(["diff", "--name-only", result.range]);
	result.changedFiles = dedupChangedFiles(raw);
} else if (result.strategy === "working-tree") {
	if (lower === "commit") {
		const raw = safe(["show", "HEAD", "--name-only", "--pretty=format:"]);
		result.changedFiles = dedupChangedFiles(raw);
	} else if (lower === "staged") {
		const raw = safe(["diff", "--cached", "--name-only"]);
		result.changedFiles = dedupChangedFiles(raw);
	} else if (lower === "modified") {
		// modified: every tracked file that differs from HEAD (staged + unstaged,
		// no untracked). Matches `git diff HEAD` semantics — what would be
		// committed by `git add -u && git commit`.
		const raw = safe(["diff", "HEAD", "--name-only"]);
		result.changedFiles = dedupChangedFiles(raw);
	} else {
		// working: unstaged only (matches git's "working tree" definition and
		// the skill's `git diff -U30` patch command — both exclude staged).
		const raw = safe(["diff", "--name-only"]);
		result.changedFiles = dedupChangedFiles(raw);
	}
}

const scopeStatus =
	result.strategy === "unrecognised" ? "invalid" : result.changedFiles.length === 0 ? "empty" : "ready";
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

const lines = [
	`default_branch: ${result.default_branch}`,
	`strategy:       ${result.strategy}`,
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
if (result.strategy === "unrecognised" && result.note) {
	lines.push(`note:           ${result.note}`);
}
lines.push("---changed-files---");
process.stdout.write(`${lines.join("\n")}\n${formatChangedFiles(result.changedFiles)}`);
