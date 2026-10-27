import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

export async function preserveBrowserModeReport(sourcePath, requestedPath) {
  if (!requestedPath) return undefined;
  const destination = path.resolve(requestedPath);
  if (!isWithin(ROOT, destination) && !isWithin(os.tmpdir(), destination)) {
    throw new Error(
      "BROWSER_MODE_REPORT_PATH must be inside the repository or OS temporary directory.",
    );
  }
  if (path.resolve(sourcePath) === destination) {
    throw new Error(
      "BROWSER_MODE_REPORT_PATH must differ from the runner's temporary report path.",
    );
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const realParent = await realpath(path.dirname(destination));
  if (!isWithin(ROOT, realParent) && !isWithin(await realpath(os.tmpdir()), realParent)) {
    throw new Error(
      "BROWSER_MODE_REPORT_PATH resolves outside the repository or OS temporary directory.",
    );
  }
  try {
    if ((await lstat(destination)).isSymbolicLink())
      throw new Error("BROWSER_MODE_REPORT_PATH must not be a symbolic link.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const contents = await readFile(sourcePath);
  await writeFile(destination, contents, { flag: "w" });
  console.log(`[browser-mode] complete Vitest JSON report saved to ${destination}`);
  return destination;
}
