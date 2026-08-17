import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const resolver = new URL("../skills/myflow/scripts/resolve-repository-map.mjs", import.meta.url);

async function git(cwd, ...args) {
  await execFile("git", args, { cwd });
}

async function createRepository({ remote } = {}) {
  const root = await mkdtemp(join(tmpdir(), "myflow-map-resolver-"));
  await git(root, "init", "--quiet");
  if (remote !== undefined) await git(root, "remote", "add", "origin", remote);
  return root;
}

async function run(mode, cwd, { map, home } = {}) {
  const args = [resolver.pathname, mode, "--cwd", cwd];
  if (map) args.push("--map", map);
  const environment = { ...process.env, HOME: home ?? join(cwd, "home") };

  try {
    const { stdout } = await execFile(process.execPath, args, { env: environment });
    return JSON.parse(stdout);
  } catch (error) {
    return JSON.parse(error.stdout);
  }
}

const globalMap = (home, identity) =>
  join(home, ".myflow", "repositories", ...identity.split("/"), "repository-map.md");

test("discover prefers an existing repository-local map", async () => {
  const cwd = await createRepository({ remote: "git@github.com:don-smith/myflow.git" });
  const localMap = join(await realpath(cwd), ".myflow", "repository-map.md");
  await mkdir(join(cwd, ".myflow"), { recursive: true });
  await writeFile(localMap, "local policy");

  const result = await run("discover", cwd);

  assert.deepEqual(result, {
    mode: "discover",
    found: true,
    source: "local",
    mapPath: localMap,
    identity: { kind: "origin", value: "github.com/don-smith/myflow" },
    reason: "existing repository-local map takes precedence",
  });
});

test("normalizes SSH and HTTPS origins to the same global target", async () => {
  const home = await mkdtemp(join(tmpdir(), "myflow-map-home-"));
  const sshRepository = await createRepository({ remote: "git@github.com:don-smith/myflow.git" });
  const httpsRepository = await createRepository({ remote: "https://github.com/don-smith/myflow.git" });
  const expected = globalMap(home, "github.com/don-smith/myflow");
  await mkdir(join(expected, ".."), { recursive: true });
  await writeFile(expected, "global policy");

  for (const cwd of [sshRepository, httpsRepository]) {
    const result = await run("discover", cwd, { home });
    assert.equal(result.found, true);
    assert.equal(result.source, "origin");
    assert.equal(result.mapPath, expected);
    assert.deepEqual(result.identity, { kind: "origin", value: "github.com/don-smith/myflow" });
  }

  const target = await run("target", httpsRepository, { home });
  assert.deepEqual(target, {
    mode: "target",
    found: true,
    source: "origin",
    mapPath: expected,
    identity: { kind: "origin", value: "github.com/don-smith/myflow" },
    reason: "preferred global target derived from origin",
  });
});

test("discover reports a missing origin-derived map without creating it", async () => {
  const home = await mkdtemp(join(tmpdir(), "myflow-map-home-"));
  const cwd = await createRepository({ remote: "https://github.com/acme/widgets.git" });

  const result = await run("discover", cwd, { home });

  assert.deepEqual(result, {
    mode: "discover",
    found: false,
    source: "origin",
    mapPath: globalMap(home, "github.com/acme/widgets"),
    identity: { kind: "origin", value: "github.com/acme/widgets" },
    reason: "no repository map exists at the preferred global target",
  });
});

test("an explicit map override is selected whether or not it exists", async () => {
  const cwd = await createRepository({ remote: "https://github.com/acme/widgets.git" });
  const override = join(cwd, "custom", "map.md");

  const missing = await run("discover", cwd, { map: override });
  assert.deepEqual(missing, {
    mode: "discover",
    found: false,
    source: "override",
    mapPath: override,
    identity: { kind: "override", value: override },
    reason: "explicit map override does not exist",
  });

  await mkdir(join(cwd, "custom"), { recursive: true });
  await writeFile(override, "override policy");
  const selected = await run("discover", cwd, { map: override });
  assert.equal(selected.found, true);
  assert.equal(selected.source, "override");
  assert.equal(selected.mapPath, override);

  const nonGit = await mkdtemp(join(tmpdir(), "myflow-override-not-git-"));
  const nonGitOverride = join(nonGit, "map.md");
  await writeFile(nonGitOverride, "override policy");
  const fromNonGitDirectory = await run("discover", nonGit, { map: nonGitOverride });
  assert.equal(fromNonGitDirectory.found, true);
  assert.equal(fromNonGitDirectory.source, "override");
  assert.equal(fromNonGitDirectory.mapPath, nonGitOverride);
});

test("no-origin repositories use a stable hash of the common Git directory", async () => {
  const home = await mkdtemp(join(tmpdir(), "myflow-map-home-"));
  const cwd = await createRepository();
  const commonGitDirectory = await realpath(join(cwd, ".git"));
  const hash = createHash("sha256").update(commonGitDirectory).digest("hex");
  const expected = join(home, ".myflow", "repositories", "local", hash, "repository-map.md");

  const missing = await run("discover", cwd, { home });
  assert.deepEqual(missing, {
    mode: "discover",
    found: false,
    source: "common-git-dir",
    mapPath: expected,
    identity: { kind: "common-git-dir-sha256", value: hash },
    reason: "no repository map exists at the preferred global target",
  });

  await mkdir(join(expected, ".."), { recursive: true });
  await writeFile(expected, "local policy");
  const selected = await run("discover", cwd, { home });
  assert.equal(selected.found, true);
  assert.equal(selected.source, "common-git-dir");
  assert.equal(selected.mapPath, expected);
});

test("reports actionable diagnostics for non-Git directories and malformed origins", async () => {
  const nonGit = await mkdtemp(join(tmpdir(), "myflow-not-git-"));
  const nonGitResult = await run("discover", nonGit);
  assert.deepEqual(nonGitResult, {
    mode: "discover",
    found: false,
    error: { code: "NOT_GIT_REPOSITORY", message: "working directory is not inside a Git repository" },
  });

  const malformed = await createRepository({ remote: "not a git remote" });
  const malformedResult = await run("discover", malformed);
  assert.deepEqual(malformedResult, {
    mode: "discover",
    found: false,
    error: { code: "INVALID_ORIGIN", message: "origin remote cannot be normalized to host/owner/repository" },
  });
});
