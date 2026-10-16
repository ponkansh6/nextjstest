import { lstat, open, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import { RefreshError } from "./errors.mjs";

export async function acquireExclusiveLock(pathname) {
  let handle;
  try {
    handle = await open(pathname, "wx", 0o600);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (!(await removeConfirmedStaleLock(pathname)))
      throw new RefreshError(
        "refresh-locked",
        "Another data refresh run holds the exclusive lock.",
      );
    try {
      handle = await open(pathname, "wx", 0o600);
    } catch (retryError) {
      if (retryError?.code === "EEXIST")
        throw new RefreshError(
          "refresh-locked",
          "Another data refresh run holds the exclusive lock.",
        );
      throw retryError;
    }
  }
  try {
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString() })}\n`,
    );
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(pathname).catch(() => {});
    throw error;
  }
  return async () => {
    await handle.close();
    await unlink(pathname).catch(() => {});
  };
}

async function removeConfirmedStaleLock(pathname) {
  let before;
  let record;
  try {
    before = await lstat(pathname);
    if (!before.isFile() || before.isSymbolicLink()) return false;
    record = JSON.parse(await readFile(pathname, "utf8"));
  } catch {
    return false;
  }
  if (record?.host !== os.hostname() || !Number.isSafeInteger(record.pid) || record.pid < 1)
    return false;
  try {
    process.kill(record.pid, 0);
    return false;
  } catch (error) {
    if (error?.code !== "ESRCH") return false;
  }
  try {
    const current = await lstat(pathname);
    if (current.dev !== before.dev || current.ino !== before.ino) return false;
    await unlink(pathname);
    return true;
  } catch {
    return false;
  }
}
