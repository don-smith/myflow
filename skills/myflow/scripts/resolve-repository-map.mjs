#!/usr/bin/env node

/**
 * Resolve repository policy maps without exposing Git URL parsing or global
 * storage rules to individual skills. The command writes one JSON object to
 * stdout and never reads map contents. `discover` also reports where the
 * repository's workstreams live: `workstreamRoot`, `storeMode` (`home` or
 * `checkout`), and `storeFallback` (true when an unwritable home forced
 * `checkout`).
 *
 * Usage:
 *   node resolve-repository-map.mjs discover [--cwd <directory>] [--map <path>]
 *   node resolve-repository-map.mjs target [--cwd <directory>] [--map <path>]
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveWorkstreamRoot } from "./lib/artifact-store.mjs";
import {
  preferredGlobalRepositoryTarget,
  resolveRepositoryContext,
} from "./lib/repository-context.mjs";

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

function error(mode, code, message) {
  return { mode, found: false, error: { code, message } };
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

  const target = preferredGlobalRepositoryTarget(context);
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

  const result = preferredGlobalRepositoryTarget(context);
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

  let result;
  if (options.map) {
    result = options.mode === "discover" ? discover(options) : target(options);
  } else {
    try {
      const context = resolveRepositoryContext(options.cwd);
      result = options.mode === "discover" ? discover(options, context) : target(options, context);
    } catch (exception) {
      result = error(options.mode, exception.code, exception.message);
    }
  }

  if (result.mode === "discover" && !result.error) {
    try {
      const store = resolveWorkstreamRoot(options.cwd, { invokedPath: process.argv[1] });
      Object.assign(result, {
        workstreamRoot: store.workstreamRoot,
        storeMode: store.storeMode,
        storeFallback: store.storeFallback,
      });
    } catch {
      // A map override outside a Git repository has no workstream root.
    }
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.error) process.exitCode = 1;
}

main();
