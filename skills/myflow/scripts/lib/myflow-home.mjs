import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * The MyFlow home holds machine-local configuration and the personal store.
 * `MYFLOW_HOME` overrides the default `~/.myflow`, for tests and for separate
 * work and personal profiles.
 */
export function myflowHome(env = process.env) {
  return env.MYFLOW_HOME ? resolve(env.MYFLOW_HOME) : join(homedir(), ".myflow");
}

export function myflowConfigPath(home = myflowHome()) {
  return join(home, "config", "myflow.json");
}

export function readMyflowConfig(home = myflowHome()) {
  const path = myflowConfigPath(home);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid MyFlow configuration at ${path}: ${error.message}`);
  }
}

export const ARTIFACT_LOCATIONS = Object.freeze(["home", "checkout"]);

/**
 * Returns the developer's artifact settings, or undefined when none are
 * configured. `remote` is a Git URL or null for `none`.
 */
export function readArtifactConfig(home = myflowHome()) {
  const artifacts = readMyflowConfig(home)?.artifacts;
  if (!artifacts || artifacts.location === undefined) return undefined;
  if (!ARTIFACT_LOCATIONS.includes(artifacts.location)) {
    throw new Error(`artifacts.location must be one of ${ARTIFACT_LOCATIONS.join(", ")}`);
  }
  const remote = artifacts.remote && artifacts.remote !== "none" ? artifacts.remote : null;
  return { location: artifacts.location, remote };
}

export function writeArtifactConfig(home, { location, remote }) {
  if (!ARTIFACT_LOCATIONS.includes(location)) {
    throw new Error(`artifacts.location must be one of ${ARTIFACT_LOCATIONS.join(", ")}`);
  }
  const path = myflowConfigPath(home);
  const config = readMyflowConfig(home) ?? {};
  config.artifacts = { ...config.artifacts, location, remote: remote ?? "none" };
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, path);
  return config;
}

/** `<home>/repositories/<host>/<owner>/<repo>` or `<home>/repositories/local/<sha>`. */
export function repositoryStoreDirectory(identity, home = myflowHome()) {
  if (identity.kind === "origin") return join(home, "repositories", ...identity.value.split("/"));
  return join(home, "repositories", "local", identity.value);
}
