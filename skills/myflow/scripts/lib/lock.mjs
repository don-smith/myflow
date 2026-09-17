import { mkdir, rm, stat } from "node:fs/promises";

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

/**
 * Acquire a mkdir-based advisory lock.
 *
 * Creates a directory at `path` to act as a lock.  If the directory already
 * exists and is fresh the caller waits / retries.  Stale locks (older than
 * `staleMs`) are broken automatically.
 *
 * Returns an async release function that removes the lock directory.
 */
export async function acquireLock(
  path,
  { timeoutMs = 5000, staleMs = 30000, description } = {},
) {
  const label = description ?? path;
  const started = Date.now();
  while (true) {
    try {
      await mkdir(path);
      return async () => rm(path, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const lockStat = await stat(path);
        if (Date.now() - lockStat.mtimeMs > staleMs) {
          await rm(path, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError.code !== "ENOENT") throw statError;
      }
      if (Date.now() - started >= timeoutMs) {
        throw new Error(`timed out acquiring lock: ${label}`);
      }
      await sleep(10 + Math.floor(Math.random() * 15));
    }
  }
}