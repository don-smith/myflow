import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { myflowHome, repositoryStoreDirectory } from "./myflow-home.mjs";

function git(cwd, arguments_) {
  return execFileSync("git", arguments_, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function normalizeRepositoryOrigin(origin) {
  let host;
  let path;
  const urlStyle = origin.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?:\/|$)(.+)$/i);
  const scpStyle = origin.match(/^(?:[^@/:]+@)?([^/:]+):(.+)$/);

  if (urlStyle) {
    [, host, path] = urlStyle;
  } else if (scpStyle) {
    [, host, path] = scpStyle;
  } else {
    return undefined;
  }

  const segments = path.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.length !== 2 || segments.some((segment) => !segment)) return undefined;
  const [owner, repositoryWithSuffix] = segments;
  const repository = repositoryWithSuffix.replace(/\.git$/i, "");
  if (!repository || repository === "." || repository === "..") return undefined;
  return `${host.toLowerCase()}/${owner}/${repository}`;
}

export function resolveRepositoryContext(cwd) {
  let root;
  let commonGitDirectory;
  try {
    root = realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]));
    commonGitDirectory = realpathSync(
      git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    );
  } catch {
    const error = new Error("working directory is not inside a Git repository");
    error.code = "NOT_GIT_REPOSITORY";
    throw error;
  }

  let origin;
  try {
    origin = git(cwd, ["config", "--get", "remote.origin.url"]);
  } catch {
    origin = undefined;
  }

  if (origin !== undefined) {
    const identity = normalizeRepositoryOrigin(origin);
    if (!identity) {
      const error = new Error("origin remote cannot be normalized to host/owner/repository");
      error.code = "INVALID_ORIGIN";
      throw error;
    }
    return {
      root,
      commonGitDirectory,
      origin,
      identity: { kind: "origin", value: identity },
    };
  }

  const hash = createHash("sha256").update(commonGitDirectory).digest("hex");
  return {
    root,
    commonGitDirectory,
    origin: undefined,
    identity: { kind: "common-git-dir-sha256", value: hash },
  };
}

/**
 * `home` is an explicit user home directory whose `.myflow` holds the map.
 * Without it, the MyFlow home (`MYFLOW_HOME`, default `~/.myflow`) is used.
 */
export function globalRepositoryMapPath(identity, home) {
  const storeHome = home === undefined ? myflowHome() : join(home, ".myflow");
  return join(repositoryStoreDirectory(identity, storeHome), "repository-map.md");
}

export function preferredGlobalRepositoryTarget(context, home) {
  const source = context.identity.kind === "origin" ? "origin" : "common-git-dir";
  return {
    source,
    mapPath: globalRepositoryMapPath(context.identity, home),
    identity: context.identity,
    reason:
      source === "origin"
        ? "preferred global target derived from origin"
        : "preferred global target derived from common Git directory",
  };
}
