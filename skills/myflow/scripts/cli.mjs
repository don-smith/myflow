#!/usr/bin/env node

/**
 * MyFlow command line.
 *
 * Usage:
 *   myflow artifacts init [--location home|checkout] [--remote <url> | --no-remote]
 *   myflow artifacts sync (--workstream <id> | --all | --path <store-path>...)
 *   myflow artifacts import [--workstream <id>]
 *   myflow artifacts pull
 *   myflow artifacts status
 *
 * Every command accepts --cwd <directory> and writes one JSON object to stdout.
 */
import { resolve } from "node:path";

import { importWorkstreams, init, pull, status, sync } from "./lib/artifact-store.mjs";

const usage = `usage: myflow artifacts <command> [--cwd <directory>]
  init [--location home|checkout] [--remote <url> | --no-remote]
  sync (--workstream <id> | --all | --path <store-path>...)
  import [--workstream <id>]
  pull
  status`;

const VALUE_FLAGS = new Map([
  ["--cwd", "cwd"],
  ["--location", "location"],
  ["--remote", "remote"],
  ["--workstream", "workstream"],
  ["--path", "paths"],
]);
const BOOLEAN_FLAGS = new Map([
  ["--all", "all"],
  ["--no-remote", "noRemote"],
]);
const ALLOWED = {
  init: ["cwd", "location", "remote", "noRemote"],
  sync: ["cwd", "workstream", "all", "paths"],
  import: ["cwd", "workstream"],
  pull: ["cwd"],
  status: ["cwd"],
};

function usageError() {
  const error = new Error(usage);
  error.code = "USAGE";
  return error;
}

function parseArguments(arguments_) {
  const [group, command, ...rest] = arguments_;
  if (group !== "artifacts" || !ALLOWED[command]) throw usageError();
  const options = { command, paths: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (BOOLEAN_FLAGS.has(flag)) {
      options[BOOLEAN_FLAGS.get(flag)] = true;
      continue;
    }
    const name = VALUE_FLAGS.get(flag);
    const value = rest[index + 1];
    if (!name || value === undefined) throw usageError();
    if (name === "paths") options.paths.push(value);
    else options[name] = value;
    index += 1;
  }
  for (const [name, value] of Object.entries(options)) {
    if (name === "command" || (name === "paths" && value.length === 0)) continue;
    if (!ALLOWED[command].includes(name)) throw usageError();
  }
  if (options.remote !== undefined && options.noRemote) throw usageError();
  if (options.location !== undefined && !["home", "checkout"].includes(options.location)) throw usageError();
  if (command === "sync" && [options.workstream !== undefined, options.all === true, options.paths.length > 0].filter(Boolean).length !== 1) {
    throw usageError();
  }
  options.cwd = resolve(options.cwd ?? process.cwd());
  return options;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  const common = { cwd: options.cwd, env: process.env, invokedPath: process.argv[1] };
  try {
    let result;
    switch (options.command) {
      case "init":
        result = await init({
          ...common,
          location: options.location,
          remote: options.noRemote ? null : options.remote,
        });
        break;
      case "sync":
        result = await sync({ ...common, workstream: options.workstream, all: options.all, paths: options.paths });
        break;
      case "import":
        result = await importWorkstreams({ ...common, workstream: options.workstream });
        break;
      case "pull":
        result = await pull(common);
        break;
      default:
        result = await status(common);
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    for (const warning of [...(result.warnings ?? []), ...(result.results ?? []).flatMap(({ warnings = [] }) => warnings)]) {
      process.stderr.write(`warning: ${warning}\n`);
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code: error.code ?? "ERROR", message: error.message } })}\n`);
    process.exitCode = error.code === "USAGE" ? 2 : 1;
  }
}

main();
