import { access, lstat, mkdir, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

// G6 is the sole exception to the ordinary dirty-target guard. It accepts only
// the exact, unstaged bytes from the last published transaction.
export async function snapshotPublishedManagedOutputs(root, outputs, expectedHashes) {
  const snapshot = {};
  for (const output of outputs) {
    const relative = normalizeRelativeOutput(output);
    const target = await resolveContainedPath(root, relative, { allowMissingLeaf: false });
    const info = await lstat(target);
    invariant(info.isFile(), "verify-noop-output-type", "Managed output is not a regular file.");
    const bytes = await readFile(target);
    const hash = createHash("sha256").update(bytes).digest("hex");
    invariant(
      expectedHashes[relative] === hash,
      "verify-noop-output-hash",
      "Managed output does not match the last published bytes.",
    );
    snapshot[relative] = hash;
  }
  return snapshot;
}

export function verifyUnstagedManagedChanges(root, outputs, verifiedSnapshot) {
  try {
    const expectedOutputs = [...outputs].sort();
    invariant(
      verifiedSnapshot &&
        Object.keys(verifiedSnapshot).sort().join("\0") === expectedOutputs.join("\0") &&
        expectedOutputs.every((output) => /^[a-f0-9]{64}$/.test(verifiedSnapshot[output])),
      "verify-noop-git-state",
      "Managed output hashes must be verified before checking git state.",
    );
    const output = execFileSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const records = output.split("\0").filter(Boolean);
    const managed = new Set(expectedOutputs);
    const statuses = new Map();
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const status = record.slice(0, 2);
      const relative = record.slice(3);
      if (!relative) {
        throw new RefreshError("verify-noop-git-state", "Managed git state is not unstaged-only.");
      }
      const affectedPaths = [relative];
      if (status.includes("R") || status.includes("C")) {
        const secondPath = records[++index];
        if (!secondPath)
          throw new RefreshError(
            "verify-noop-git-state",
            "Managed git state is not unstaged-only.",
          );
        affectedPaths.push(secondPath);
      }
      for (const affectedPath of affectedPaths) {
        const isManaged = managed.has(affectedPath);
        const isDataSource =
          affectedPath === "data/source" || affectedPath.startsWith("data/source/");
        if (isManaged) {
          if (statuses.has(affectedPath) || status !== " M")
            throw new RefreshError(
              "verify-noop-git-state",
              "Managed git state is not unstaged-only.",
            );
          statuses.set(affectedPath, status);
        } else if (isDataSource) {
          throw new RefreshError(
            "verify-noop-git-state",
            "Unmanaged source data has local changes.",
          );
        }
      }
    }
    const trackedOutput = execFileSync("git", ["ls-files", "-z", "--", ...expectedOutputs], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const tracked = new Set(trackedOutput.split("\0").filter(Boolean));
    invariant(
      expectedOutputs.every((output) => tracked.has(output)),
      "verify-noop-git-state",
      "Every managed output must be tracked.",
    );
  } catch (error) {
    if (error instanceof RefreshError) throw error;
    throw new RefreshError(
      "preflight-failed",
      "Unable to inspect managed output changes with git.",
    );
  }
}

export function verifyCleanTrackedOutputsAtHead(root, outputs) {
  const expectedOutputs = [...new Set(outputs.map(normalizeRelativeOutput))].sort();
  try {
    const trackedOutput = execFileSync("git", ["ls-files", "-z", "--", ...expectedOutputs], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const tracked = new Set(trackedOutput.split("\0").filter(Boolean));
    invariant(
      expectedOutputs.every((output) => tracked.has(output)),
      "rebaseline-output-not-tracked",
      "Every managed output must be tracked before semantic-state rebaseline.",
    );
    const changed = execFileSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...expectedOutputs],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    invariant(
      changed.length === 0,
      "rebaseline-output-dirty",
      "Managed outputs must be clean in Git before semantic-state rebaseline.",
    );
    for (const output of expectedOutputs) {
      const target = readFileSync(path.resolve(root, output));
      const head = execFileSync("git", ["show", `HEAD:${output}`], {
        cwd: root,
        stdio: ["ignore", "pipe", "ignore"],
      });
      invariant(
        createHash("sha256").update(target).digest("hex") ===
          createHash("sha256").update(head).digest("hex"),
        "rebaseline-output-not-at-head",
        "Managed output bytes must match HEAD before semantic-state rebaseline.",
      );
    }
  } catch (error) {
    if (error instanceof RefreshError) throw error;
    throw new RefreshError(
      "rebaseline-git-preflight-failed",
      "Unable to verify managed outputs against Git HEAD.",
    );
  }
}

export async function verifyNoRebaselineResidue({
  root,
  stagingRoot,
  currentStageName,
  backupRoot,
  outputs,
}) {
  const stagingEntries = await readdir(stagingRoot).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  invariant(
    stagingEntries.every((entry) => entry === currentStageName),
    "rebaseline-staging-residue",
    "Existing staging directories prevent semantic-state rebaseline.",
  );
  const backupEntries = await readdir(backupRoot).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  invariant(
    backupEntries.length === 0,
    "rebaseline-backup-residue",
    "Existing transaction backups prevent semantic-state rebaseline.",
  );
  const checkedParents = new Set();
  for (const output of outputs) {
    const relative = normalizeRelativeOutput(output);
    const parent = path.dirname(path.resolve(root, relative));
    const basename = path.basename(relative);
    if (checkedParents.has(`${parent}\0${basename}`)) continue;
    checkedParents.add(`${parent}\0${basename}`);
    const siblings = await readdir(parent).catch((error) => {
      if (error?.code === "ENOENT") return [];
      throw error;
    });
    invariant(
      !siblings.some((entry) => entry.startsWith(`${basename}.refresh-rollback-`)),
      "rebaseline-recovery-residue",
      "An output rollback temporary file prevents semantic-state rebaseline.",
    );
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
