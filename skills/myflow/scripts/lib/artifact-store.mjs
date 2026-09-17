import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, writeFileSync } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireLock } from "./lock.mjs";
import {
  myflowHome,
  readArtifactConfig,
  repositoryStoreDirectory,
  writeArtifactConfig,
} from "./myflow-home.mjs";
import { normalizeRepositoryOrigin, resolveRepositoryContext } from "./repository-context.mjs";

/**
 * The artifact store keeps workstream artifacts either in the developer's
 * MyFlow home (`home`, a Git repository with an optional remote) or in the
 * current checkout (`checkout`, self-ignored). Sync builds each commit in a
 * private temporary index on top of the remote head, so it never touches the
 * store's working directory or another session's unsynced files.
 */

export const STORE_GITIGNORE = `# MyFlow artifact store: ignore everything, then allow only synced paths.
*
!*/
!/.gitignore
!/README.md
!/repositories/*/*/*/repository-map.md
!/repositories/*/*/*/onboarding/**
!/repositories/*/*/*/workstreams/**
!/repositories/*/*/*/legacy-artifacts/**
!/repositories/local/*/repository-map.md
!/repositories/local/*/onboarding/**
!/repositories/local/*/workstreams/**
!/repositories/local/*/legacy-artifacts/**
/config/
/repositories/**/observations/
*.lock
*.tmp
`;

const STORE_README = `# MyFlow artifact store

Managed by \`myflow artifacts\`. Workstream artifacts, repository maps,
onboarding records, and legacy artifacts are synced. Machine
configuration (\`config/\`) and raw observations stay on this machine.

Keep any remote for this store private: artifacts can contain code excerpts
and decisions.
`;

const CHECKOUT_GITIGNORE = "*\n";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REPOSITORY_CHILDREN = Object.freeze(["repository-map.md", "onboarding", "workstreams", "legacy-artifacts"]);
const RETRYABLE_PUSH = /non-fast-forward|fetch first|stale info|cannot lock ref|failed to update ref|incorrect old value|reference already exists/i;
const MAX_ATTEMPTS = 10;
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const ZERO_OID = "0000000000000000000000000000000000000000";
const modulePath = fileURLToPath(import.meta.url);

function storeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// ---------------------------------------------------------------------------
// Allowlist

function isTransientName(name) {
  return name.endsWith(".lock") || name.endsWith(".tmp");
}

/** True when a store-relative file path may be committed to the store. */
export function isAllowlistedStorePath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) return false;
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment === ".git" || isTransientName(segment))) {
    return false;
  }
  if (segments.length === 1) return segments[0] === ".gitignore" || segments[0] === "README.md";
  if (segments[0] !== "repositories") return false;
  const identityLength = segments[1] === "local" ? 2 : 3;
  const rest = segments.slice(1 + identityLength);
  if (rest.length === 0) return false;
  if (rest.length === 1) return rest[0] === "repository-map.md";
  if (rest[0] === "workstreams") return rest.length >= 3;
  return rest[0] === "onboarding" || rest[0] === "legacy-artifacts";
}

function isAllowlistedTarget(relativePath) {
  return isAllowlistedStorePath(relativePath) || isAllowlistedStorePath(`${relativePath}/file`);
}

function normalizeStorePath(path) {
  const normalized = posix.normalize(String(path).replaceAll("\\", "/")).replace(/\/+$/, "");
  if (normalized.startsWith("/") || normalized === "." || normalized.startsWith("../")) {
    throw storeError(`store path is not allowlisted: ${path}`, "NOT_ALLOWLISTED");
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// Workstream root resolution

function isInsideRepository(context, invokedPath) {
  const roots = new Set([context.root]);
  if (basename(context.commonGitDirectory) === ".git") roots.add(dirname(context.commonGitDirectory));
  // Judge the invoked path lexically, before resolving symlinks: a global
  // install symlinked into the repository counts as inside, and a repository
  // copy symlinked into a global skills folder counts as outside.
  let current = resolve(invokedPath ?? modulePath);
  while (true) {
    try {
      if (roots.has(realpathSync(current))) return true;
    } catch {
      // Missing ancestors cannot match a root.
    }
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function isWritableDirectory(path) {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  try {
    const probe = mkdtempSync(join(current, ".myflow-write-probe-"));
    rmdirSync(probe);
    return true;
  } catch {
    return false;
  }
}

function ensureCheckoutIgnore(checkoutRoot) {
  try {
    mkdirSync(checkoutRoot, { recursive: true });
    writeFileSync(join(checkoutRoot, ".gitignore"), CHECKOUT_GITIGNORE, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") return false;
  }
  return true;
}

function storeRepositoryPrefix(identity) {
  return identity.kind === "origin"
    ? `repositories/${identity.value}`
    : `repositories/local/${identity.value}`;
}

/**
 * Resolve where the current repository's workstreams live.
 *
 * Configuration wins. Without it, scripts invoked from inside the current
 * repository select `checkout` and scripts installed elsewhere select `home`.
 * An unwritable home falls back to `checkout` with `storeFallback: true`.
 */
export function resolveWorkstreamRoot(cwd, { env = process.env, invokedPath } = {}) {
  const context = resolveRepositoryContext(cwd);
  const home = myflowHome(env);
  const config = readArtifactConfig(home);
  const location = config?.location ?? (isInsideRepository(context, invokedPath) ? "checkout" : "home");
  const checkoutRoot = join(context.root, ".myflow", "workstreams");
  const homeRoot = join(repositoryStoreDirectory(context.identity, home), "workstreams");

  let storeMode = location;
  let storeFallback = false;
  if (location === "home" && !isWritableDirectory(homeRoot)) {
    storeMode = "checkout";
    storeFallback = true;
  }
  if (storeMode === "checkout") ensureCheckoutIgnore(checkoutRoot);

  return {
    repositoryRoot: context.root,
    identity: context.identity,
    myflowHome: home,
    configured: config !== undefined,
    location,
    remote: config?.remote ?? null,
    storeMode,
    storeFallback,
    workstreamRoot: storeMode === "home" ? homeRoot : checkoutRoot,
    checkoutRoot,
    storePrefix: storeRepositoryPrefix(context.identity),
  };
}

// ---------------------------------------------------------------------------
// Git plumbing

function runGit(args, { cwd, env, input, indexFile, allowFailure = false, encoding = "utf8" }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: indexFile ? { ...env, GIT_INDEX_FILE: indexFile } : env,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout);
      const result = {
        code,
        stdout: encoding === "buffer" ? output : output.toString("utf8").trim(),
        stderr: Buffer.concat(stderr).toString("utf8").trim(),
      };
      if (code !== 0 && !allowFailure) {
        reject(storeError(`git ${args.find((arg) => !arg.startsWith("-")) ?? ""} failed: ${result.stderr}`, "GIT_FAILED"));
      } else {
        resolvePromise(result);
      }
    });
    if (input !== undefined) {
      // Git may exit before reading all input; its exit status reports the failure.
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}

function storeGit(home, env, args, options = {}) {
  return runGit(["--git-dir", join(home, ".git"), "--work-tree", home, ...args], { cwd: home, env, ...options });
}

async function revParse(home, env, revision) {
  const result = await storeGit(home, env, ["rev-parse", "--verify", "--quiet", revision], { allowFailure: true });
  return result.code === 0 ? result.stdout : null;
}

async function isAncestor(home, env, ancestor, descendant) {
  const result = await storeGit(home, env, ["merge-base", "--is-ancestor", ancestor, descendant], { allowFailure: true });
  return result.code === 0;
}

async function subtree(home, env, commit, path) {
  if (!commit) return null;
  return revParse(home, env, `${commit}:${path}`);
}

async function remoteUrl(home, env) {
  const result = await storeGit(home, env, ["remote", "get-url", "origin"], { allowFailure: true });
  return result.code === 0 && result.stdout ? result.stdout : null;
}

async function commitEnvironment(home, env) {
  const name = await storeGit(home, env, ["config", "user.name"], { allowFailure: true });
  const email = await storeGit(home, env, ["config", "user.email"], { allowFailure: true });
  return {
    ...env,
    ...(name.stdout || env.GIT_AUTHOR_NAME ? {} : { GIT_AUTHOR_NAME: "MyFlow", GIT_COMMITTER_NAME: "MyFlow" }),
    ...(email.stdout || env.GIT_AUTHOR_EMAIL ? {} : { GIT_AUTHOR_EMAIL: "myflow@localhost", GIT_COMMITTER_EMAIL: "myflow@localhost" }),
  };
}

/** Fetch the remote `main` into a private ref, so concurrent fetches never collide. */
async function fetchRemoteHead(home, env, url) {
  const temporaryRef = `refs/myflow/fetch/${process.pid}-${randomBytes(6).toString("hex")}`;
  const fetched = await storeGit(
    home,
    env,
    ["fetch", "--quiet", "--no-tags", "--no-write-fetch-head", url, `+refs/heads/main:${temporaryRef}`],
    { allowFailure: true },
  );
  if (fetched.code !== 0) {
    if (/couldn't find remote ref/i.test(fetched.stderr)) return null;
    throw storeError(`fetch from the artifact remote failed: ${fetched.stderr}`, "FETCH_FAILED");
  }
  const head = await revParse(home, env, temporaryRef);
  await storeGit(home, env, ["update-ref", "-d", temporaryRef], { allowFailure: true });
  return head;
}

// ---------------------------------------------------------------------------
// Store lifecycle

function isGitDirectory(home) {
  return existsSync(join(home, ".git"));
}

async function isMyflowStore(home, env) {
  if (!isGitDirectory(home)) return false;
  const result = await runGit(["config", "--file", join(home, ".git", "config"), "--get", "myflow.store"], {
    cwd: home,
    env,
    allowFailure: true,
  });
  return result.code === 0 && result.stdout === "true";
}

async function archiveForeignGit(home, env, now) {
  const date = now.toISOString().slice(0, 10);
  let archive = `${home}-safety-net-git-${date}.tgz`;
  for (let suffix = 1; existsSync(archive); suffix += 1) archive = `${home}-safety-net-git-${date}-${suffix}.tgz`;
  await new Promise((resolvePromise, reject) => {
    const child = spawn("tar", ["-czf", archive, "-C", home, ".git"], { env, stdio: ["ignore", "ignore", "pipe"] });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0
      ? resolvePromise()
      : reject(new Error(`archiving ${join(home, ".git")} failed: ${Buffer.concat(stderr).toString("utf8")}`))));
  });
  await rm(join(home, ".git"), { recursive: true, force: true });
  return archive;
}

/**
 * Make `home` a MyFlow store. `adopt` archives a foreign `.git`; without it a
 * foreign repository is refused so sync never commits into it.
 */
async function ensureStore(home, env, { adopt = false, now = new Date() } = {}) {
  let archivedGit = null;
  let created = false;
  if (isGitDirectory(home) && !(await isMyflowStore(home, env))) {
    if (!adopt) {
      throw storeError(
        `${home} is a Git repository not managed by MyFlow; run \`myflow artifacts init\` to archive its .git and adopt it`,
        "FOREIGN_STORE",
      );
    }
    archivedGit = await archiveForeignGit(home, env, now);
  }
  if (!isGitDirectory(home)) {
    await mkdir(home, { recursive: true });
    await runGit(["init", "--quiet", "-b", "main", home], { cwd: home, env });
    await storeGit(home, env, ["config", "myflow.store", "true"]);
    created = true;
  }
  const gitignore = join(home, ".gitignore");
  if (!existsSync(gitignore) || readFileSync(gitignore, "utf8") !== STORE_GITIGNORE) {
    await writeFile(gitignore, STORE_GITIGNORE);
  }
  if (!existsSync(join(home, "README.md"))) await writeFile(join(home, "README.md"), STORE_README);
  return { archivedGit, created };
}

async function listDirectories(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  }
}

/** Every allowlisted top-level target present in the store folder. */
async function allowlistedRoots(home) {
  const roots = [];
  for (const name of [".gitignore", "README.md"]) if (existsSync(join(home, name))) roots.push(name);
  const repositories = join(home, "repositories");
  const identities = [];
  for (const host of await listDirectories(repositories)) {
    if (host === "local") {
      for (const hash of await listDirectories(join(repositories, host))) identities.push(`repositories/local/${hash}`);
      continue;
    }
    for (const owner of await listDirectories(join(repositories, host))) {
      for (const repository of await listDirectories(join(repositories, host, owner))) {
        identities.push(`repositories/${host}/${owner}/${repository}`);
      }
    }
  }
  for (const identity of identities) {
    for (const child of REPOSITORY_CHILDREN) if (existsSync(join(home, identity, child))) roots.push(`${identity}/${child}`);
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Tree building

async function collectFiles(home, target, warnings) {
  const files = [];
  const visit = async (relativePath) => {
    const absolutePath = join(home, relativePath);
    let stats;
    try {
      stats = await lstat(absolutePath);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (isTransientName(basename(relativePath))) return;
    if (stats.isDirectory()) {
      for (const entry of (await readdir(absolutePath)).sort()) await visit(`${relativePath}/${entry}`);
      return;
    }
    if (!stats.isFile()) {
      warnings.push(`skipped non-regular file: ${relativePath}`);
      return;
    }
    if (relativePath.includes("\n")) throw storeError(`store path contains a newline: ${JSON.stringify(relativePath)}`, "NOT_ALLOWLISTED");
    if (!isAllowlistedStorePath(relativePath)) throw storeError(`store path is not allowlisted: ${relativePath}`, "NOT_ALLOWLISTED");
    files.push({ relativePath, absolutePath, mode: stats.mode & 0o111 ? "100755" : "100644" });
  };
  await visit(target);
  return files;
}

/** Build a tree in a private index: `base`, with each target replaced by its local contents. */
async function buildTree(home, env, { base, targets, warnings }) {
  const indexFile = join(home, ".git", `myflow-index-${process.pid}-${randomBytes(6).toString("hex")}`);
  try {
    const options = { indexFile };
    await storeGit(home, env, base ? ["read-tree", base] : ["read-tree", "--empty"], options);
    const files = [];
    for (const target of targets) {
      await storeGit(home, env, ["rm", "-r", "-f", "--cached", "--quiet", "--ignore-unmatch", "--", `:(literal)${target}`], options);
      files.push(...(await collectFiles(home, target, warnings)));
    }
    if (files.length > 0) {
      const hashed = await storeGit(home, env, ["hash-object", "-w", "--stdin-paths"], {
        input: files.map(({ absolutePath }) => absolutePath).join("\n") + "\n",
      });
      const shas = hashed.stdout.split("\n");
      const indexInfo = files.map(({ relativePath, mode }, index) => `${mode} ${shas[index]}\t${relativePath}`).join("\n") + "\n";
      await storeGit(home, env, ["update-index", "--add", "--index-info"], { ...options, input: indexInfo });
    }
    return (await storeGit(home, env, ["write-tree"], options)).stdout;
  } finally {
    await rm(indexFile, { force: true });
  }
}

// ---------------------------------------------------------------------------
// Local state

function syncStatePath(home) {
  return join(home, ".git", "myflow-sync-state.json");
}

async function readSyncState(home) {
  try {
    return JSON.parse(await readFile(syncStatePath(home), "utf8"));
  } catch {
    return {};
  }
}

/** Fast-forward local `main`, its index, and the tracking ref under a short lock. */
async function updateLocal(home, env, commit, { url, targets = [], force = false }) {
  const release = await acquireLock(join(home, ".git", "myflow-sync.lock"), { timeoutMs: 30000, description: "artifact store local update" });
  const warnings = [];
  try {
    if (url) {
      const tracking = await revParse(home, env, "refs/remotes/origin/main");
      if (!tracking || (await isAncestor(home, env, tracking, commit))) {
        await storeGit(home, env, ["update-ref", "refs/remotes/origin/main", commit]);
      }
    }
    const current = await revParse(home, env, "refs/heads/main");
    if (current !== commit && (!current || force || (await isAncestor(home, env, current, commit)))) {
      await storeGit(home, env, ["update-ref", "refs/heads/main", commit]);
    }
    const index = await storeGit(home, env, ["read-tree", "refs/heads/main"], { allowFailure: true });
    if (index.code !== 0) warnings.push(`store index was not refreshed: ${index.stderr}`);
    if (targets.length > 0) {
      const state = await readSyncState(home);
      for (const target of targets) state[target] = (await subtree(home, env, commit, target)) ?? null;
      const temporaryPath = `${syncStatePath(home)}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
      await rename(temporaryPath, syncStatePath(home));
    }
  } finally {
    await release();
  }
  return warnings;
}

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function syncTargets(home, env, { label, targets, force = false }) {
  const url = await remoteUrl(home, env);
  const commitEnv = await commitEnvironment(home, env);
  const warnings = [];
  const syncState = await readSyncState(home);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const localMain = await revParse(home, env, "refs/heads/main");
    const base = url ? (await fetchRemoteHead(home, env, url)) ?? localMain : localMain;
    const tree = await buildTree(home, env, { base, targets, warnings: attempt === 1 ? warnings : [] });
    const baseTree = base ? await revParse(home, env, `${base}^{tree}`) : EMPTY_TREE;

    if (tree === baseTree) {
      if (base) warnings.push(...(await updateLocal(home, env, base, { url, targets, force })));
      return { target: label, status: "unchanged", commit: base, warnings };
    }

    if (url && attempt === 1) {
      for (const target of targets) {
        if (!(target in syncState)) continue;
        if ((await subtree(home, env, base, target)) !== syncState[target]) {
          warnings.push(`${target} changed on the remote since the last sync from this machine; this sync replaces it (last push wins)`);
        }
      }
    }

    const parents = base ? ["-p", base] : [];
    const commit = (await storeGit(home, commitEnv, ["commit-tree", tree, ...parents, "-m", `sync ${label}`])).stdout;

    if (url) {
      const pushed = await storeGit(home, env, ["push", "--quiet", "--no-verify", url, `${commit}:refs/heads/main`], { allowFailure: true });
      if (pushed.code !== 0) {
        if (attempt < MAX_ATTEMPTS && RETRYABLE_PUSH.test(pushed.stderr)) {
          await sleep(Math.floor(Math.random() * 100 * attempt) + 20);
          continue;
        }
        throw storeError(`push to the artifact remote failed: ${pushed.stderr}`, "PUSH_FAILED");
      }
      warnings.push(...(await updateLocal(home, env, commit, { url, targets, force })));
      return { target: label, status: "pushed", commit, warnings };
    }

    const updated = await storeGit(home, env, ["update-ref", "refs/heads/main", commit, base ?? ZERO_OID], { allowFailure: true });
    if (updated.code !== 0) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.floor(Math.random() * 50 * attempt) + 10);
        continue;
      }
      throw storeError(`local store commit failed: ${updated.stderr}`, "COMMIT_FAILED");
    }
    warnings.push(...(await updateLocal(home, env, commit, { targets })));
    return { target: label, status: "committed", commit, warnings };
  }
  throw storeError(`sync of ${label} did not land after ${MAX_ATTEMPTS} attempts`, "SYNC_RETRIES_EXHAUSTED");
}

function assertSafeWorkstream(id) {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw storeError("workstream must be a filesystem-safe ID", "USAGE");
}

// ---------------------------------------------------------------------------
// Commands

/**
 * Sync one workstream, every local workstream (`all`), or explicit
 * allowlisted store paths. Failures are reported per target, never thrown,
 * except for usage errors and non-allowlisted paths.
 */
export async function sync({ cwd = process.cwd(), env = process.env, invokedPath, workstream, all = false, paths } = {}) {
  const resolved = resolveWorkstreamRoot(cwd, { env, invokedPath });
  const summary = { storeMode: resolved.storeMode, storeFallback: resolved.storeFallback, workstreamRoot: resolved.workstreamRoot };

  let groups;
  if (paths?.length) {
    const targets = paths.map(normalizeStorePath);
    for (const target of targets) {
      if (!isAllowlistedTarget(target)) throw storeError(`store path is not allowlisted: ${target}`, "NOT_ALLOWLISTED");
    }
    groups = [{ label: targets.join(", "), targets }];
  } else if (all) {
    groups = (await listDirectories(resolved.workstreamRoot)).map((id) => ({
      workstream: id,
      label: id,
      targets: [`${resolved.storePrefix}/workstreams/${id}`],
    }));
  } else if (workstream !== undefined) {
    assertSafeWorkstream(workstream);
    groups = [{ workstream, label: workstream, targets: [`${resolved.storePrefix}/workstreams/${workstream}`] }];
  } else {
    throw storeError("sync needs --workstream <id>, --all, or --path <store-path>", "USAGE");
  }

  if (resolved.storeMode === "checkout") return { ok: true, ...summary, skipped: "checkout", results: [] };

  const home = resolved.myflowHome;
  const results = [];
  try {
    await ensureStore(home, env);
  } catch (error) {
    return {
      ok: false,
      ...summary,
      results: groups.map(({ workstream: id, label }) => ({ workstream: id, target: label, status: "failed", error: error.message })),
    };
  }
  for (const group of groups) {
    try {
      results.push({ ...(group.workstream ? { workstream: group.workstream } : {}), ...(await syncTargets(home, env, group)) });
    } catch (error) {
      if (error.code === "NOT_ALLOWLISTED") throw error;
      results.push({ ...(group.workstream ? { workstream: group.workstream } : {}), target: group.label, status: "failed", error: error.message });
    }
  }
  return { ok: results.every(({ status: result }) => result !== "failed"), ...summary, results };
}

async function remoteVisibilityWarning(url) {
  const identity = normalizeRepositoryOrigin(url);
  if (!identity?.startsWith("github.com/")) return null;
  const [, owner, repository] = identity.split("/");
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repository}`, {
      headers: { "user-agent": "myflow-artifacts" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body.private === false
      ? `the artifact remote ${identity} is public; artifacts can contain code excerpts and decisions, so use a private repository`
      : null;
  } catch {
    return null;
  }
}

/** Restore allowlisted remote files missing locally. Never overwrites or deletes. */
async function restoreRemoteFiles(home, env, commit) {
  const restored = [];
  const warnings = [];
  const listing = await storeGit(home, env, ["ls-tree", "-r", "-z", commit]);
  for (const entry of listing.stdout.split("\0").filter(Boolean)) {
    const [meta, path] = entry.split("\t");
    const [mode, type, sha] = meta.split(" ");
    if (type !== "blob" || !isAllowlistedStorePath(path)) continue;
    const destination = join(home, path);
    try {
      await lstat(destination);
      continue;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      if (error.code === "ENOTDIR") {
        warnings.push(`not restored, a parent is a file: ${path}`);
        continue;
      }
    }
    const contents = (await storeGit(home, env, ["cat-file", "blob", sha], { encoding: "buffer" })).stdout;
    try {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, contents, { flag: "wx", mode: mode === "100755" ? 0o755 : 0o644 });
      restored.push(path);
    } catch (error) {
      warnings.push(`not restored: ${path}: ${error.message}`);
    }
  }
  return { restored, warnings };
}

export async function pull({ cwd = process.cwd(), env = process.env, invokedPath } = {}) {
  const resolved = resolveWorkstreamRoot(cwd, { env, invokedPath });
  if (resolved.storeMode === "checkout") {
    return { ok: true, storeMode: resolved.storeMode, storeFallback: resolved.storeFallback, skipped: "checkout", restored: [] };
  }
  const home = resolved.myflowHome;
  await ensureStore(home, env);
  const url = await remoteUrl(home, env);
  if (!url) return { ok: true, storeMode: "home", skipped: "no-remote", restored: [] };
  const head = await fetchRemoteHead(home, env, url);
  if (!head) return { ok: true, storeMode: "home", restored: [], warnings: [] };
  const { restored, warnings } = await restoreRemoteFiles(home, env, head);
  warnings.push(...(await updateLocal(home, env, head, { url })));
  return { ok: true, storeMode: "home", commit: head, restored, warnings };
}

/**
 * Write the artifact configuration and, for `home`, create or adopt the store,
 * attach or detach the remote, restore remote content, and commit (and push)
 * the allowlisted content already on disk.
 */
export async function init({ env = process.env, location, remote, now = new Date() } = {}) {
  const home = myflowHome(env);
  const existing = readArtifactConfig(home);
  const selectedLocation = location ?? existing?.location ?? "home";
  const selectedRemote = remote === undefined ? existing?.remote ?? null : remote;
  writeArtifactConfig(home, { location: selectedLocation, remote: selectedRemote });
  if (selectedLocation === "checkout") {
    return { ok: true, location: selectedLocation, remote: selectedRemote, myflowHome: home, archivedGit: null, warnings: [] };
  }

  const { archivedGit, created } = await ensureStore(home, env, { adopt: true, now });
  const warnings = [];
  const currentUrl = await remoteUrl(home, env);
  if (selectedRemote && currentUrl !== selectedRemote) {
    await storeGit(home, env, currentUrl ? ["remote", "set-url", "origin", selectedRemote] : ["remote", "add", "origin", selectedRemote]);
  } else if (!selectedRemote && currentUrl) {
    await storeGit(home, env, ["remote", "remove", "origin"]);
  }
  if (selectedRemote) {
    const visibility = await remoteVisibilityWarning(selectedRemote);
    if (visibility) warnings.push(visibility);
  }

  let restored = [];
  let result;
  try {
    if (selectedRemote) {
      const head = await fetchRemoteHead(home, env, selectedRemote);
      if (head) {
        const restoredFiles = await restoreRemoteFiles(home, env, head);
        restored = restoredFiles.restored;
        warnings.push(...restoredFiles.warnings);
      }
    }
    result = await syncTargets(home, env, { label: "store content", targets: await allowlistedRoots(home), force: true });
  } catch (error) {
    result = { target: "store content", status: "failed", error: error.message };
  }
  return {
    ok: result.status !== "failed",
    location: selectedLocation,
    remote: selectedRemote,
    myflowHome: home,
    created,
    archivedGit,
    restored,
    result,
    warnings,
  };
}

async function sameFileContents(left, right) {
  try {
    const [a, b] = await Promise.all([readFile(left), readFile(right)]);
    return a.equals(b);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function conflictingFiles(source, destination) {
  const conflicts = [];
  const visit = async (relativePath) => {
    const sourcePath = join(source, relativePath);
    const stats = await lstat(sourcePath);
    if (stats.isDirectory()) {
      for (const entry of await readdir(sourcePath)) await visit(relativePath ? join(relativePath, entry) : entry);
      return;
    }
    if ((await sameFileContents(sourcePath, join(destination, relativePath))) === false) conflicts.push(relativePath);
  };
  await visit("");
  return conflicts;
}

/**
 * Move checkout workstreams into the home store. A checkout copy is removed
 * only after its store commit, and push when a remote exists, succeed.
 */
export async function importWorkstreams({ cwd = process.cwd(), env = process.env, invokedPath, workstream } = {}) {
  const resolved = resolveWorkstreamRoot(cwd, { env, invokedPath });
  if (resolved.storeMode !== "home") {
    throw storeError(
      resolved.storeFallback
        ? "the home artifact store is not writable here; run import where it is writable"
        : "import needs artifacts.location home; run `myflow artifacts init --location home`",
      "IMPORT_UNAVAILABLE",
    );
  }
  if (workstream !== undefined) assertSafeWorkstream(workstream);
  const ids = workstream !== undefined ? [workstream] : await listDirectories(resolved.checkoutRoot);
  const results = [];
  for (const id of ids) {
    const source = join(resolved.checkoutRoot, id);
    const destination = join(resolved.workstreamRoot, id);
    if (!existsSync(source)) {
      results.push({ workstream: id, status: "failed", error: `no checkout workstream at ${source}` });
      continue;
    }
    const conflicts = await conflictingFiles(source, destination);
    if (conflicts.length > 0) {
      results.push({ workstream: id, status: "conflict", conflicts, error: "store copy differs; resolve by hand, then import again" });
      continue;
    }
    await cp(source, destination, { recursive: true, force: false, errorOnExist: false, preserveTimestamps: true });
    const synced = await sync({ cwd, env, invokedPath, workstream: id });
    const [result] = synced.results;
    if (!synced.ok || !result) {
      results.push({ workstream: id, status: "failed", error: result?.error ?? "sync failed", copiedTo: destination });
      continue;
    }
    await rm(source, { recursive: true, force: true });
    results.push({ workstream: id, status: "imported", sync: result.status, commit: result.commit, path: destination });
  }
  return { ok: results.every(({ status: result }) => result === "imported"), storeMode: "home", results };
}

/** Report the store mode, unsynced workstreams, and checkout workstreams awaiting import. */
export async function status({ cwd = process.cwd(), env = process.env, invokedPath } = {}) {
  const resolved = resolveWorkstreamRoot(cwd, { env, invokedPath });
  const checkoutWorkstreams = await listDirectories(resolved.checkoutRoot);
  const report = {
    ok: true,
    storeMode: resolved.storeMode,
    storeFallback: resolved.storeFallback,
    configured: resolved.configured,
    remote: resolved.remote,
    myflowHome: resolved.myflowHome,
    workstreamRoot: resolved.workstreamRoot,
    storeInitialized: false,
    unsynced: [],
    needsImport: resolved.location === "home" ? checkoutWorkstreams : [],
  };
  if (resolved.storeMode !== "home") return report;

  const home = resolved.myflowHome;
  const local = await listDirectories(resolved.workstreamRoot);
  report.storeInitialized = await isMyflowStore(home, env);
  if (!report.storeInitialized) {
    report.unsynced = local;
    return report;
  }
  const url = await remoteUrl(home, env);
  const reference = await revParse(home, env, url ? "refs/remotes/origin/main" : "refs/heads/main");
  const referenceTree = reference ? await revParse(home, env, `${reference}^{tree}`) : EMPTY_TREE;
  for (const id of local) {
    const target = `${resolved.storePrefix}/workstreams/${id}`;
    const tree = await buildTree(home, env, { base: reference, targets: [target], warnings: [] });
    if (tree !== referenceTree) report.unsynced.push(id);
  }
  return report;
}
