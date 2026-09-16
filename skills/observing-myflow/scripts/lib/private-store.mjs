import { open, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { canonicalJson } from "../../../myflow/scripts/lib/lifecycle-contract.mjs";
import {
  globalRepositoryMapPath,
  resolveRepositoryContext,
} from "../../../myflow/scripts/lib/repository-context.mjs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

function assertSafeId(value, name) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${name} must be filesystem-safe`);
}

export function privateObservationRoot(repositoryRoot, { stateRoot, home } = {}) {
  if (stateRoot) return resolve(stateRoot);
  const context = resolveRepositoryContext(repositoryRoot);
  return join(dirname(globalRepositoryMapPath(context.identity, home)), "observations");
}

async function acquireLock(path, timeoutMs = 5000) {
  const started = Date.now();
  while (true) {
    try {
      const handle = await open(path, "wx", 0o600);
      return async () => {
        await handle.close();
        await rm(path, { force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const metadata = await stat(path);
        if (Date.now() - metadata.mtimeMs > 30000) {
          await rm(path, { force: true });
          continue;
        }
      } catch (statError) {
        if (statError.code !== "ENOENT") throw statError;
      }
      if (Date.now() - started >= timeoutMs) throw new Error(`timed out acquiring private store lock: ${path}`);
      await sleep(10);
    }
  }
}

async function readRecords(path) {
  try {
    const text = await readFile(path, "utf8");
    if (text.length > 0 && !text.endsWith("\n")) throw new Error("private store has an incomplete record");
    return text.split("\n").filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid private store JSON at line ${index + 1}: ${error.message}`);
      }
    });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function appendPrivateRecord({
  repositoryRoot,
  stateRoot,
  home,
  workstreamId,
  category,
  record,
  validateExisting,
}) {
  assertSafeId(workstreamId, "workstreamId");
  assertSafeId(category, "category");
  const root = privateObservationRoot(repositoryRoot, { stateRoot, home });
  const workstreamRoot = join(root, workstreamId);
  const directory = join(workstreamRoot, category);
  const path = join(directory, "events.jsonl");
  const relativePath = relative(workstreamRoot, path);
  if (relativePath.startsWith("..") || relativePath.includes(`${sep}..${sep}`)) {
    throw new Error("private record path escaped its workstream directory");
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  const release = await acquireLock(lockPath);
  try {
    const existing = await readRecords(path);
    const duplicate = existing.find(({ recordId }) => recordId === record.recordId);
    if (duplicate) {
      const { recordedAt: existingRecordedAt, ...existingIntent } = duplicate;
      const { recordedAt: candidateRecordedAt, ...candidateIntent } = record;
      if (canonicalJson(existingIntent) !== canonicalJson(candidateIntent)) {
        throw new Error(`private record ID conflicts with existing content: ${record.recordId}`);
      }
      return { path, privateRef: `${relativePath}#${record.recordId}`, duplicate: true, record: duplicate };
    }
    validateExisting?.(existing, record);
    const temporaryPath = `${path}.${process.pid}.tmp`;
    const body = [...existing, record].map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    await writeFile(temporaryPath, body, { mode: 0o600 });
    await rename(temporaryPath, path);
    return { path, privateRef: `${relativePath}#${record.recordId}`, duplicate: false, record };
  } finally {
    await release();
  }
}
