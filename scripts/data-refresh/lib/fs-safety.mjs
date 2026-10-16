import { access, lstat, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { RefreshError, invariant } from "./errors.mjs";

export function normalizeRelativeOutput(output) {
  invariant(
    typeof output === "string" && output.length > 0,
    "path-not-allowlisted",
    "Output path is empty.",
  );
  invariant(
    !path.isAbsolute(output) && !output.includes("\\") && !output.split("/").includes(".."),
    "path-not-allowlisted",
    "Output path must be a safe relative path.",
  );
  const normalized = path.posix.normalize(output);
  invariant(
    normalized === output && normalized !== "." && !normalized.startsWith("../"),
    "path-not-allowlisted",
    "Output path is not canonical.",
  );
  return normalized;
}

export async function resolveContainedPath(root, relativePath, { allowMissingLeaf = true } = {}) {
  const rel = normalizeRelativeOutput(relativePath);
  const rootReal = await realpath(root);
  const absolute = path.resolve(rootReal, ...rel.split("/"));
  invariant(
    absolute.startsWith(`${rootReal}${path.sep}`),
    "path-escape",
    "Resolved path escapes the repository root.",
  );
  let cursor = rootReal;
  const segments = rel.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    cursor = path.join(cursor, segments[index]);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink())
        throw new RefreshError("symlink-path", "Managed paths cannot contain symlinks.");
      if (index < segments.length - 1 && !info.isDirectory())
        throw new RefreshError("invalid-parent-path", "Managed output parent is not a directory.");
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissingLeaf) break;
      if (error instanceof RefreshError) throw error;
      throw error;
    }
  }
  return absolute;
}

export async function ensureSameFilesystem(root, stagingDirectory) {
  const [rootInfo, stageInfo] = await Promise.all([stat(root), stat(stagingDirectory)]);
  invariant(
    rootInfo.dev === stageInfo.dev,
    "staging-filesystem-mismatch",
    "Staging must be on the same filesystem as canonical outputs.",
  );
}

export async function preflightCanonicalEdits(
  root,
  outputs,
  { checkChanges = gitHasChanges } = {},
) {
  for (const output of outputs) {
    const relative = normalizeRelativeOutput(output);
    const target = await resolveContainedPath(root, relative);
    try {
      await access(target);
      if (await checkChanges(root, relative))
        throw new RefreshError(
          "canonical-edited",
          `Managed canonical output has local changes: ${relative}`,
        );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function gitHasChanges(root, relative) {
  try {
    const output = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", relative],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.trim().length > 0;
  } catch {
    throw new RefreshError(
      "preflight-failed",
      "Unable to inspect managed output changes with git.",
    );
  }
}

export async function createDirectoriesSafely(root, relativeDirectory) {
  const rel = normalizeRelativeOutput(relativeDirectory);
  const parts = rel.split("/");
  let current = await realpath(root);
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      invariant(
        !info.isSymbolicLink() && info.isDirectory(),
        "symlink-path",
        "Refresh work directories cannot contain symlinks.",
      );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
  return current;
}
