#!/usr/bin/env node

/**
 * Resolve repository policy maps without exposing Git URL parsing or global
 * storage rules to individual skills. The command writes one JSON object to
 * stdout and never reads map contents.
 *
 * Usage:
 *   node resolve-repository-map.mjs discover [--cwd <directory>] [--map <path>]
 *   node resolve-repository-map.mjs target [--cwd <directory>] [--map <path>]
 */
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const usage =
  "usage: resolve-repository-map.mjs <discover|target> [--cwd <directory>] [--map <path>]";

function parseArguments(arguments_) {
  const [mode, ...rest] = arguments_;
  if (mode !== "discover" && mode !== "target") throw new Error(usage);

  const options = { mode, cwd: process.cwd(), map: undefined };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if ((flag !== "--cwd" && flag !== "--map") || !value) throw new Error(usage);
    options[flag.slice(2)] = value;
    index += 1;
  }
  options.cwd = resolve(options.cwd);
  if (options.map) options.map = resolve(options.cwd, options.map);
  return options;
}

function git(cwd, arguments_) {
  return execFileSync("git", arguments_, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function error(mode, code, message) {
  return { mode, found: false, error: { code, message } };
}

function normalizeOrigin(origin) {
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

function gitContext(cwd) {
  try {
    const root = git(cwd, ["rev-parse", "--show-toplevel"]);
    const commonGitDirectory = git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    let origin;
    try {
      origin = git(cwd, ["config", "--get", "remote.origin.url"]);
    } catch {
      origin = undefined;
    }
    return {
      root: realpathSync(root),
      commonGitDirectory: realpathSync(commonGitDirectory),
      origin,
    };
  } catch {
    return undefined;
  }
}

function globalMap(home, identity) {
  return join(home, ".myflow", "repositories", ...identity.split("/"), "repository-map.md");
}

function preferredGlobalTarget(context) {
  if (context.origin !== undefined) {
    const identity = normalizeOrigin(context.origin);
    if (!identity) return { error: "INVALID_ORIGIN" };
    return {
      source: "origin",
      mapPath: globalMap(homedir(), identity),
      identity: { kind: "origin", value: identity },
      reason: "preferred global target derived from origin",
    };
  }

  const hash = createHash("sha256").update(context.commonGitDirectory).digest("hex");
  return {
    source: "common-git-dir",
    mapPath: join(homedir(), ".myflow", "repositories", "local", hash, "repository-map.md"),
    identity: { kind: "common-git-dir-sha256", value: hash },
    reason: "preferred global target derived from common Git directory",
  };
}

function discover(options, context) {
  if (options.map) {
    return {
      mode: "discover",
      found: existsSync(options.map),
      source: "override",
      mapPath: options.map,
      identity: { kind: "override", value: options.map },
      reason: existsSync(options.map) ? "existing explicit map override" : "explicit map override does not exist",
    };
  }

  const target = preferredGlobalTarget(context);
  if (target.error) {
    return error(options.mode, "INVALID_ORIGIN", "origin remote cannot be normalized to host/owner/repository");
  }

  const localMap = join(context.root, ".myflow", "repository-map.md");
  if (existsSync(localMap)) {
    return {
      mode: "discover",
      found: true,
      source: "local",
      mapPath: localMap,
      identity: target.identity,
      reason: "existing repository-local map takes precedence",
    };
  }

  const found = existsSync(target.mapPath);
  return {
    mode: "discover",
    found,
    source: target.source,
    mapPath: target.mapPath,
    identity: target.identity,
    reason: found ? "existing preferred global map" : "no repository map exists at the preferred global target",
  };
}

function target(options, context) {
  if (options.map) {
    return {
      mode: "target",
      found: existsSync(options.map),
      source: "override",
      mapPath: options.map,
      identity: { kind: "override", value: options.map },
      reason: "explicit map override is the preferred target",
    };
  }

  const result = preferredGlobalTarget(context);
  if (result.error) {
    return error(options.mode, "INVALID_ORIGIN", "origin remote cannot be normalized to host/owner/repository");
  }
  return { mode: "target", found: existsSync(result.mapPath), ...result };
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (exception) {
    process.stderr.write(`${exception.message}\n`);
    process.exitCode = 2;
    return;
  }

  const context = options.map ? undefined : gitContext(options.cwd);
  const result = options.map
    ? options.mode === "discover"
      ? discover(options)
      : target(options)
    : context
      ? options.mode === "discover"
        ? discover(options, context)
        : target(options, context)
      : error(options.mode, "NOT_GIT_REPOSITORY", "working directory is not inside a Git repository");

  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.error) process.exitCode = 1;
}

main();
