import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { PINNED_PROJECT_FILES } from "./runtime-validator.mjs";

const projectRoot = process.cwd();

for (const [relative, expected] of Object.entries(PINNED_PROJECT_FILES)) {
  const segments = relative.split(/[\\/]/);
  let current = projectRoot;
  let bytes;

  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const fileStat = await lstat(current);
    const isLast = index === segments.length - 1;

    if (fileStat.isSymbolicLink()) {
      throw new Error(`Pinned project path contains a symlink: ${relative}`);
    }
    if (isLast && !fileStat.isFile()) {
      throw new Error(`Pinned project path is not a regular file: ${relative}`);
    }
    if (!isLast && !fileStat.isDirectory()) {
      throw new Error(`Pinned project path parent is not a directory: ${relative}`);
    }
    if (isLast) bytes = await readFile(current);
  }

  const actual = createHash("sha256").update(bytes).digest("hex");
  const matches = actual === expected;
  console.log(
    `${matches ? "MATCH" : "MISMATCH"}\t${relative}\texpected=${expected}\tcandidate=${actual}`,
  );
  if (!matches) process.exitCode = 1;
}
