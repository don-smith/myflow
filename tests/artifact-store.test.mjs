import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  STORE_GITIGNORE,
  importWorkstreams,
  init,
  isAllowlistedStorePath,
  pull,
  resolveWorkstreamRoot,
  status,
  sync,
} from "../skills/myflow/scripts/lib/artifact-store.mjs";
import { recordStageFeedback } from "../skills/observing-myflow/scripts/record-stage-feedback.mjs";

const execFile = promisify(execFileCallback);
const cli = new URL("../skills/myflow/scripts/cli.mjs", import.meta.url).pathname;
const resolver = new URL("../skills/myflow/scripts/resolve-repository-map.mjs", import.meta.url).pathname;
const scriptsDirectory = new URL("../skills/myflow/scripts/", import.meta.url).pathname;
const IDENTITY = ["github.com", "acme", "widgets"];

async function git(cwd, env, ...args) {
  const { stdout } = await execFile("git", args, { cwd, env });
  return stdout.trim();
}

/** A temporary MyFlow home, product repository, and optional local bare remote. */
async function fixture({ remote = true } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "myflow-artifact-store-")));
  const home = join(root, "myflow-home");
  const globalConfig = join(root, "gitconfig");
  await writeFile(globalConfig, "");
  const env = {
    ...process.env,
    MYFLOW_HOME: home,
    HOME: join(root, "user-home"),
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  const repo = join(root, "project");
  await mkdir(repo);
  await git(repo, env, "init", "--quiet", "-b", "main");
  await git(repo, env, "remote", "add", "origin", "https://github.com/acme/widgets.git");
  await writeFile(join(repo, "README.md"), "product\n");
  await git(repo, env, "add", "README.md");
  await git(repo, env, "commit", "--quiet", "-m", "initial");

  let remotePath;
  if (remote) {
    remotePath = join(root, "artifacts.git");
    await git(root, env, "init", "--quiet", "--bare", "-b", "main", remotePath);
  }
  const storeRepository = join(home, "repositories", ...IDENTITY);
  const workstreams = join(storeRepository, "workstreams");
  const writeWorkstreamFile = async (id, relativePath, text, base = workstreams) => {
    const path = join(base, id, relativePath);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, text);
    return path;
  };
  const remoteFiles = async () => {
    try {
      return (await git(root, env, "--git-dir", remotePath, "ls-tree", "-r", "--name-only", "main")).split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  return { root, home, env, repo, remotePath, storeRepository, workstreams, writeWorkstreamFile, remoteFiles };
}

const prefix = `repositories/${IDENTITY.join("/")}/workstreams`;

async function runCli(context, ...args) {
  const { stdout } = await execFile(process.execPath, [cli, "artifacts", ...args, "--cwd", context.repo], { env: context.env });
  return JSON.parse(stdout);
}

test("three concurrent syncs of different workstreams all land on the remote", async () => {
  const context = await fixture();
  await init({ cwd: context.repo, env: context.env, location: "home", remote: context.remotePath });
  for (const id of ["alpha", "beta", "gamma"]) {
    await context.writeWorkstreamFile(id, "scope/scope.md", `# ${id}\n`);
  }

  const results = await Promise.all(["alpha", "beta", "gamma"].map((id) => runCli(context, "sync", "--workstream", id)));
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));

  const files = await context.remoteFiles();
  for (const id of ["alpha", "beta", "gamma"]) assert.ok(files.includes(`${prefix}/${id}/scope/scope.md`), files.join("\n"));
});

test("sync never commits another workstream's unsynced files or config", async () => {
  const context = await fixture();
  await init({ cwd: context.repo, env: context.env, location: "home", remote: context.remotePath });
  await context.writeWorkstreamFile("alpha", "plan/plan.md", "plan\n");
  await context.writeWorkstreamFile("delta", "scope/draft.md", "in progress\n");
  await stat(join(context.home, "config", "myflow.json"));

  const result = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(result.ok, true);

  const files = await context.remoteFiles();
  assert.ok(files.includes(`${prefix}/alpha/plan/plan.md`));
  assert.equal(files.some((file) => file.includes("/delta/")), false);
  assert.equal(files.some((file) => file.startsWith("config/")), false);
});

test("raw observations are refused while workstream feedback syncs", async () => {
  const context = await fixture();
  await init({ cwd: context.repo, env: context.env, location: "home", remote: context.remotePath });
  const observation = join(context.storeRepository, "observations", "alpha", "raw", "session.jsonl");
  await mkdir(join(observation, ".."), { recursive: true });
  await writeFile(observation, "{}\n");
  await context.writeWorkstreamFile("alpha", "feedback/events.jsonl", "{}\n");

  await assert.rejects(
    sync({ cwd: context.repo, env: context.env, paths: [`repositories/${IDENTITY.join("/")}/observations/alpha/raw/session.jsonl`] }),
    /not allowlisted/,
  );
  await assert.rejects(sync({ cwd: context.repo, env: context.env, paths: ["config/myflow.json"] }), /not allowlisted/);

  const result = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(result.ok, true);
  const files = await context.remoteFiles();
  assert.ok(files.includes(`${prefix}/alpha/feedback/events.jsonl`));
  assert.equal(files.some((file) => file.includes("/observations/")), false);

  // The store's own .gitignore enforces the same allowlist.
  const ignored = await git(context.home, context.env, "check-ignore", observation);
  assert.equal(ignored, observation);
  assert.equal(await readFile(join(context.home, ".gitignore"), "utf8"), STORE_GITIGNORE);
  assert.equal(isAllowlistedStorePath(`${prefix}/alpha/feedback/events.jsonl`), true);
  assert.equal(isAllowlistedStorePath("repositories/local/abc/workstreams/alpha/scope/a.md"), true);
  assert.equal(isAllowlistedStorePath(`repositories/${IDENTITY.join("/")}/repository-map.md`), true);
  assert.equal(isAllowlistedStorePath("repos/memory.md"), true);
  assert.equal(isAllowlistedStorePath(`repositories/${IDENTITY.join("/")}/observations/alpha/raw.jsonl`), false);
  assert.equal(isAllowlistedStorePath("config/myflow.json"), false);
  assert.equal(isAllowlistedStorePath(`${prefix}/alpha/../../observations/x`), false);
  assert.equal(isAllowlistedStorePath(`${prefix}/alpha/lifecycle/events.jsonl.lock/owner`), false);
});

test("deletions propagate and an unchanged sync is a no-op", async () => {
  const context = await fixture();
  await init({ cwd: context.repo, env: context.env, location: "home", remote: context.remotePath });
  await context.writeWorkstreamFile("alpha", "scope/keep.md", "keep\n");
  const removed = await context.writeWorkstreamFile("alpha", "scope/remove.md", "remove\n");
  await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.ok((await context.remoteFiles()).includes(`${prefix}/alpha/scope/remove.md`));

  await rm(removed);
  const deletion = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(deletion.results[0].status, "pushed");
  const files = await context.remoteFiles();
  assert.ok(files.includes(`${prefix}/alpha/scope/keep.md`));
  assert.equal(files.includes(`${prefix}/alpha/scope/remove.md`), false);

  const head = await git(context.root, context.env, "--git-dir", context.remotePath, "rev-parse", "main");
  const again = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(again.results[0].status, "unchanged");
  assert.equal(await git(context.root, context.env, "--git-dir", context.remotePath, "rev-parse", "main"), head);
  assert.equal(await git(context.home, context.env, "rev-parse", "main"), head);
});

test("without a remote, sync commits locally and pushes nothing", async () => {
  const context = await fixture({ remote: false });
  await init({ cwd: context.repo, env: context.env, location: "home", remote: null });
  await context.writeWorkstreamFile("alpha", "scope/scope.md", "scope\n");

  const result = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(result.results[0].status, "committed");
  assert.equal(await git(context.home, context.env, "remote"), "");
  const tracked = await git(context.home, context.env, "ls-tree", "-r", "--name-only", "main");
  assert.ok(tracked.split("\n").includes(`${prefix}/alpha/scope/scope.md`));
  assert.equal(await git(context.home, context.env, "status", "--porcelain"), "");

  // --all iterates local workstreams; --path syncs another allowlisted subtree.
  await context.writeWorkstreamFile("beta", "plan/plan.md", "plan\n");
  const legacy = join(context.storeRepository, "legacy-artifacts", "plans", "old.md");
  await mkdir(join(legacy, ".."), { recursive: true });
  await writeFile(legacy, "legacy\n");
  const everything = await sync({ cwd: context.repo, env: context.env, all: true });
  assert.deepEqual(everything.results.map(({ workstream, status: result }) => [workstream, result]), [
    ["alpha", "unchanged"],
    ["beta", "committed"],
  ]);
  const legacyResult = await sync({ cwd: context.repo, env: context.env, paths: [`repositories/${IDENTITY.join("/")}/legacy-artifacts`] });
  assert.equal(legacyResult.results[0].status, "committed");
  const all = (await git(context.home, context.env, "ls-tree", "-r", "--name-only", "main")).split("\n");
  assert.ok(all.includes(`repositories/${IDENTITY.join("/")}/legacy-artifacts/plans/old.md`));
  assert.ok(all.includes(`${prefix}/beta/plan/plan.md`));
});

test("pull restores remote-only files and never overwrites a local file", async () => {
  const context = await fixture();
  await init({ cwd: context.repo, env: context.env, location: "home", remote: context.remotePath });
  await context.writeWorkstreamFile("alpha", "scope/shared.md", "remote version\n");
  await context.writeWorkstreamFile("alpha", "scope/remote-only.md", "from another machine\n");
  await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });

  // A second machine with its own MyFlow home.
  const otherHome = join(context.root, "other-home");
  const otherEnv = { ...context.env, MYFLOW_HOME: otherHome };
  await init({ cwd: context.repo, env: otherEnv, location: "home", remote: context.remotePath });
  const otherWorkstreams = join(otherHome, "repositories", ...IDENTITY, "workstreams");
  assert.equal(await readFile(join(otherWorkstreams, "alpha", "scope", "remote-only.md"), "utf8"), "from another machine\n");

  await rm(join(otherWorkstreams, "alpha", "scope", "remote-only.md"));
  await writeFile(join(otherWorkstreams, "alpha", "scope", "shared.md"), "local edit\n");
  const result = await pull({ cwd: context.repo, env: otherEnv });

  assert.ok(result.restored.includes(`${prefix}/alpha/scope/remote-only.md`));
  assert.equal(await readFile(join(otherWorkstreams, "alpha", "scope", "remote-only.md"), "utf8"), "from another machine\n");
  assert.equal(await readFile(join(otherWorkstreams, "alpha", "scope", "shared.md"), "utf8"), "local edit\n");
});

test("sync warns when the remote changed the same workstream since this machine last synced", async () => {
  const context = await fixture();
  await init({ cwd: context.repo, env: context.env, location: "home", remote: context.remotePath });
  await context.writeWorkstreamFile("alpha", "scope/scope.md", "v1\n");
  await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });

  const otherEnv = { ...context.env, MYFLOW_HOME: join(context.root, "other-home") };
  await init({ cwd: context.repo, env: otherEnv, location: "home", remote: context.remotePath });
  await writeFile(join(context.root, "other-home", "repositories", ...IDENTITY, "workstreams", "alpha", "scope", "scope.md"), "other\n");
  await sync({ cwd: context.repo, env: otherEnv, workstream: "alpha" });

  await context.writeWorkstreamFile("alpha", "scope/scope.md", "v2\n");
  const result = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(result.results[0].warnings.join("\n"), /changed on the remote since the last sync/);
});

test("checkout mode self-ignores workstreams and leaves a committed repository map visible", async () => {
  const context = await fixture({ remote: false });
  await mkdir(join(context.repo, ".myflow"), { recursive: true });
  await writeFile(join(context.repo, ".myflow", "repository-map.md"), "# map\n");
  await git(context.repo, context.env, "add", ".myflow/repository-map.md");
  await git(context.repo, context.env, "commit", "--quiet", "-m", "map");
  await init({ cwd: context.repo, env: context.env, location: "checkout" });

  const resolved = resolveWorkstreamRoot(context.repo, { env: context.env });
  assert.equal(resolved.storeMode, "checkout");
  assert.equal(resolved.storeFallback, false);
  assert.equal(resolved.workstreamRoot, join(context.repo, ".myflow", "workstreams"));
  assert.equal(await readFile(join(context.repo, ".myflow", "workstreams", ".gitignore"), "utf8"), "*\n");

  await context.writeWorkstreamFile("alpha", "scope/scope.md", "scope\n", resolved.workstreamRoot);
  assert.equal(await git(context.repo, context.env, "status", "--porcelain"), "");
  await assert.rejects(git(context.repo, context.env, "check-ignore", ".myflow/repository-map.md"));
  assert.equal(await git(context.repo, context.env, "ls-files", ".myflow"), ".myflow/repository-map.md");

  const skipped = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(skipped.skipped, "checkout");
  await assert.rejects(stat(join(context.home, ".git")), { code: "ENOENT" });
});

test("without configuration, scripts inside the repository resolve checkout and scripts outside resolve home", async () => {
  const context = await fixture({ remote: false });
  const inside = resolveWorkstreamRoot(context.repo, {
    env: context.env,
    invokedPath: join(context.repo, ".agents", "skills", "myflow", "scripts", "cli.mjs"),
  });
  assert.equal(inside.storeMode, "checkout");
  assert.equal(inside.configured, false);

  const outside = resolveWorkstreamRoot(context.repo, { env: context.env, invokedPath: cli });
  assert.equal(outside.storeMode, "home");
  assert.equal(outside.workstreamRoot, context.workstreams);

  // The same through the real resolver, installed once inside the repository and once globally.
  const installed = join(context.repo, ".agents", "skills", "myflow", "scripts");
  await cp(scriptsDirectory, installed, { recursive: true });
  const local = JSON.parse((await execFile(process.execPath, [join(installed, "resolve-repository-map.mjs"), "discover", "--cwd", context.repo], { env: context.env })).stdout);
  assert.equal(local.storeMode, "checkout");
  assert.equal(local.workstreamRoot, join(context.repo, ".myflow", "workstreams"));
  const global = JSON.parse((await execFile(process.execPath, [resolver, "discover", "--cwd", context.repo], { env: context.env })).stdout);
  assert.equal(global.storeMode, "home");
  assert.equal(global.storeFallback, false);
  assert.equal(global.workstreamRoot, context.workstreams);
});

test("stage feedback is written under the workstream feedback folder in both modes", async () => {
  const context = await fixture({ remote: false });
  const feedback = (overrides = {}) => recordStageFeedback({
    repositoryRoot: context.repo,
    env: context.env,
    workstreamId: "alpha",
    attemptId: "attempt_1",
    attemptOrdinal: 1,
    canonicalStage: "Scope",
    status: "recorded",
    rating: "smooth",
    hostCapability: "structured",
    source: "scope",
    idempotencyKey: "feedback-1",
    ...overrides,
  });

  await init({ cwd: context.repo, env: context.env, location: "home", remote: null });
  const home = await feedback();
  assert.equal(home.path, join(context.workstreams, "alpha", "feedback", "events.jsonl"));
  assert.match(home.privateRef, /^feedback\/events\.jsonl#feedback_/);

  await init({ cwd: context.repo, env: context.env, location: "checkout" });
  const checkout = await feedback();
  assert.equal(checkout.path, join(context.repo, ".myflow", "workstreams", "alpha", "feedback", "events.jsonl"));
  assert.match(checkout.privateRef, /^feedback\/events\.jsonl#feedback_/);
});

test("an unwritable home falls back to checkout with storeFallback", { skip: process.getuid?.() === 0 }, async () => {
  const context = await fixture({ remote: false });
  await init({ cwd: context.repo, env: context.env, location: "home", remote: null });
  await chmod(context.home, 0o500);
  try {
    const resolved = resolveWorkstreamRoot(context.repo, { env: context.env });
    assert.equal(resolved.storeMode, "checkout");
    assert.equal(resolved.storeFallback, true);
    assert.equal(resolved.workstreamRoot, join(context.repo, ".myflow", "workstreams"));

    await context.writeWorkstreamFile("alpha", "scope/scope.md", "scope\n", resolved.workstreamRoot);
    const report = await status({ cwd: context.repo, env: context.env });
    assert.equal(report.storeFallback, true);
    assert.deepEqual(report.needsImport, ["alpha"]);
  } finally {
    await chmod(context.home, 0o700);
  }
});

test("import keeps checkout copies when the push fails and removes them after a successful push", async () => {
  const context = await fixture();
  await init({ cwd: context.repo, env: context.env, location: "home", remote: context.remotePath });
  const checkoutRoot = join(context.repo, ".myflow", "workstreams");
  await context.writeWorkstreamFile("alpha", "scope/scope.md", "scope\n", checkoutRoot);
  await context.writeWorkstreamFile("beta", "plan/plan.md", "plan\n", checkoutRoot);

  const before = await status({ cwd: context.repo, env: context.env });
  assert.deepEqual(before.needsImport, ["alpha", "beta"]);

  const hook = join(context.remotePath, "hooks", "pre-receive");
  await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const failed = await importWorkstreams({ cwd: context.repo, env: context.env });
  assert.equal(failed.ok, false);
  assert.equal(await readFile(join(checkoutRoot, "alpha", "scope", "scope.md"), "utf8"), "scope\n");
  assert.equal(await readFile(join(checkoutRoot, "beta", "plan", "plan.md"), "utf8"), "plan\n");

  await rm(hook);
  const imported = await importWorkstreams({ cwd: context.repo, env: context.env });
  assert.equal(imported.ok, true, JSON.stringify(imported));
  assert.deepEqual(imported.results.map(({ workstream, status: result }) => [workstream, result]), [
    ["alpha", "imported"],
    ["beta", "imported"],
  ]);
  await assert.rejects(stat(join(checkoutRoot, "alpha")), { code: "ENOENT" });
  await assert.rejects(stat(join(checkoutRoot, "beta")), { code: "ENOENT" });
  const files = await context.remoteFiles();
  assert.ok(files.includes(`${prefix}/alpha/scope/scope.md`));
  assert.ok(files.includes(`${prefix}/beta/plan/plan.md`));

  const after = await status({ cwd: context.repo, env: context.env });
  assert.equal(after.storeMode, "home");
  assert.deepEqual(after.needsImport, []);
  assert.deepEqual(after.unsynced, []);
});

test("a worktree and its main checkout resolve the same workstream root", async () => {
  const context = await fixture({ remote: false });
  await init({ cwd: context.repo, env: context.env, location: "home", remote: null });
  const worktree = join(context.root, "project-worktree");
  await git(context.repo, context.env, "worktree", "add", "--quiet", "-b", "feature", worktree);

  const main = resolveWorkstreamRoot(context.repo, { env: context.env });
  const linked = resolveWorkstreamRoot(worktree, { env: context.env });
  assert.equal(main.workstreamRoot, context.workstreams);
  assert.equal(linked.workstreamRoot, main.workstreamRoot);
  assert.equal(linked.storeMode, "home");
});

test("a global install with no configuration behaves as home without a remote", async () => {
  const context = await fixture({ remote: false });
  const resolved = resolveWorkstreamRoot(context.repo, { env: context.env });
  assert.equal(resolved.configured, false);
  assert.equal(resolved.storeMode, "home");
  assert.equal(resolved.remote, null);

  await context.writeWorkstreamFile("alpha", "scope/scope.md", "scope\n");
  const result = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(result.results[0].status, "committed");
  assert.equal(await git(context.home, context.env, "remote"), "");
  await assert.rejects(stat(join(context.home, "config", "myflow.json")), { code: "ENOENT" });

  const report = await status({ cwd: context.repo, env: context.env });
  assert.equal(report.storeMode, "home");
  assert.equal(report.remote, null);
  assert.deepEqual(report.unsynced, []);
});

test("init archives a foreign store Git directory before adopting the folder", async () => {
  const context = await fixture({ remote: false });
  await mkdir(join(context.home, "repos"), { recursive: true });
  await writeFile(join(context.home, "repos", "memory.md"), "memory\n");
  await git(context.home, context.env, "init", "--quiet", "-b", "main");
  await git(context.home, context.env, "add", "repos/memory.md");
  await git(context.home, context.env, "commit", "--quiet", "-m", "safety net");

  const result = await init({
    cwd: context.repo,
    env: context.env,
    location: "home",
    remote: null,
    now: new Date("2026-09-17T12:00:00Z"),
  });
  assert.equal(result.archivedGit, `${context.home}-safety-net-git-2026-09-17.tgz`);
  await stat(result.archivedGit);
  assert.equal(await git(context.home, context.env, "config", "--get", "myflow.store"), "true");
  assert.equal((await git(context.home, context.env, "log", "--format=%s")).includes("safety net"), false);
  assert.ok((await git(context.home, context.env, "ls-tree", "-r", "--name-only", "main")).split("\n").includes("repos/memory.md"));

  // Adopting again is idempotent and does not archive the MyFlow store.
  const again = await init({ cwd: context.repo, env: context.env, location: "home", remote: null });
  assert.equal(again.archivedGit, null);
});

test("sync refuses a foreign store Git directory until init adopts it", async () => {
  const context = await fixture({ remote: false });
  await mkdir(context.home, { recursive: true });
  await git(context.home, context.env, "init", "--quiet", "-b", "main");
  await context.writeWorkstreamFile("alpha", "scope/scope.md", "scope\n");
  const result = await sync({ cwd: context.repo, env: context.env, workstream: "alpha" });
  assert.equal(result.ok, false);
  assert.match(result.results[0].error, /myflow artifacts init/);
});
