import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  chown,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { RefreshError, invariant } from "./errors.mjs";
import { normalizeRelativeOutput, resolveContainedPath } from "./fs-safety.mjs";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readJournal(journalPath) {
  try {
    const parsed = JSON.parse(await readFile(journalPath, "utf8"));
    validateJournal(parsed);
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw recoveryError();
  }
}

export async function recoverJournal({ root, journalPath, backupRoot, registry }) {
  let journal;
  try {
    journal = await readJournal(journalPath);
    if (!journal) return false;
    const currentAllowlist = registrySnapshot(registry);
    invariant(
      sameJson(journal.sourceAllowlist, currentAllowlist),
      "journal-invalid",
      "Journal source allowlist does not match the current registry.",
    );
    validateJournalTargets(journal, currentAllowlist);
    await validateJournalFiles({ root, journal, backupRoot });
  } catch {
    throw recoveryError();
  }

  if (journal.state === "committed" || journal.state === "rolled-back") {
    await removeTransactionBackups(backupRoot, journal.id);
    await rm(journalPath, { force: true });
    await syncDirectory(path.dirname(journalPath));
    return true;
  }

  try {
    for (const entry of [...journal.entries].reverse()) {
      const target = await resolveContainedPath(root, entry.path, { allowMissingLeaf: false });
      const stagedExists = await exists(await resolveContainedPath(root, entry.staged));
      if (entry.published || (entry.intent && !stagedExists)) {
        if (entry.existed) {
          const backup = await resolveContainedPath(root, entry.backup, {
            allowMissingLeaf: false,
          });
          const temporary = `${target}.refresh-rollback-${randomUUID()}`;
          await copyFile(backup, temporary);
          await restoreMetadata(temporary, entry.metadata);
          await syncFile(temporary);
          await rename(temporary, target);
          await syncDirectory(path.dirname(target));
        } else if (
          entry.published ||
          !(await exists(await resolveContainedPath(root, entry.staged)))
        ) {
          // Only remove the artifact when it is the exact staged payload. The
          // preflight above established its hash before any rollback begins.
          await rm(target, { force: true });
          await syncDirectory(path.dirname(target));
        }
      }
    }
  } catch {
    throw recoveryError();
  }
  journal.state = "rolled-back";
  await writeDurableJson(journalPath, journal);
  await removeTransactionBackups(backupRoot, journal.id);
  await rm(journalPath, { force: true });
  await syncDirectory(path.dirname(journalPath));
  return true;
}

export async function publishArtifacts({
  root,
  workDir: _workDir,
  journalPath,
  backupRoot,
  artifacts,
  registry,
  onRename = async () => {},
}) {
  const sourceAllowlist = registrySnapshot(registry);
  const transactionId = randomUUID();
  const entries = [];
  const seenTargets = new Set();
  const seenStaged = new Set();
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    const targetPath = allowlistedTarget(artifact.path, sourceAllowlist);
    invariant(
      !seenTargets.has(targetPath),
      "path-not-allowlisted",
      "Publish targets must be unique.",
    );
    seenTargets.add(targetPath);
    const target = await resolveContainedPath(root, targetPath);
    const stagedPath = normalizeRelativeOutput(artifact.stagedPath);
    invariant(
      stagedPath.startsWith(".data-refresh/staging/"),
      "path-not-allowlisted",
      "Staged files must be inside the refresh staging directory.",
    );
    invariant(!seenStaged.has(stagedPath), "path-not-allowlisted", "Staged files must be unique.");
    seenStaged.add(stagedPath);
    const staged = await resolveContainedPath(root, stagedPath, { allowMissingLeaf: false });
    const backupRel = `${path.relative(root, backupRoot).split(path.sep).join("/")}/${transactionId}/${index}.bak`;
    const backup = await resolveContainedPath(root, backupRel);
    await mkdir(path.dirname(backup), { recursive: true });
    await syncDirectoryTree(root, path.dirname(backup));
    let existed = false;
    let metadata = null;
    try {
      const info = await stat(target);
      existed = true;
      metadata = {
        mode: info.mode & 0o7777,
        uid: info.uid,
        gid: info.gid,
        atimeMs: info.atimeMs,
        mtimeMs: info.mtimeMs,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    let backupHash = null;
    if (existed) {
      await copyFile(target, backup);
      backupHash = await hashFile(backup);
      await restoreMetadata(backup, metadata);
      await syncFile(backup);
      await syncDirectoryTree(root, path.dirname(backup));
    }
    entries.push({
      path: targetPath,
      staged: stagedPath,
      backup: backupRel,
      existed,
      metadata,
      backupHash,
      targetHash: await hashFile(staged),
      intent: false,
      published: false,
    });
  }
  await syncDirectory(path.dirname(backupRoot));
  const journal = { version: 2, id: transactionId, state: "publishing", sourceAllowlist, entries };
  await writeDurableJson(journalPath, journal);
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const target = await resolveContainedPath(root, entry.path);
      const staged = await resolveContainedPath(root, entry.staged, { allowMissingLeaf: false });
      await mkdir(path.dirname(target), { recursive: true });
      await syncDirectoryTree(root, path.dirname(target));
      await syncFile(staged);
      await syncDirectoryTree(root, path.dirname(staged));
      entry.intent = true;
      await writeDurableJson(journalPath, journal);
      await rename(staged, target);
      entry.published = true;
      await syncDirectory(path.dirname(target));
      await syncDirectoryTree(root, path.dirname(staged));
      await writeDurableJson(journalPath, journal);
      await onRename(index, entry.path);
    }
    journal.state = "committed";
    await writeDurableJson(journalPath, journal);
  } catch (error) {
    await recoverJournal({ root, journalPath, backupRoot, registry });
    throw new RefreshError(
      "publish-failed",
      "Publish failed; prior canonical outputs were restored.",
      { cause: error },
    );
  }
  await removeTransactionBackups(backupRoot, transactionId);
  await rm(journalPath, { force: true });
  await syncDirectory(path.dirname(journalPath));
}

function validateJournal(journal) {
  invariant(
    journal &&
      typeof journal === "object" &&
      !Array.isArray(journal) &&
      sameKeys(journal, ["version", "id", "state", "sourceAllowlist", "entries"]),
    "journal-invalid",
    "Journal schema is invalid.",
  );
  invariant(
    journal.version === 2 &&
      ID_PATTERN.test(journal.id) &&
      ["publishing", "committed", "rolled-back"].includes(journal.state) &&
      Array.isArray(journal.entries) &&
      journal.entries.length > 0,
    "journal-invalid",
    "Journal header is invalid.",
  );
  validateAllowlistSnapshot(journal.sourceAllowlist);
  const targets = new Set();
  const stagedPaths = new Set();
  journal.entries.forEach((entry, index) => {
    invariant(
      entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        sameKeys(entry, [
          "path",
          "staged",
          "backup",
          "existed",
          "metadata",
          "backupHash",
          "targetHash",
          "intent",
          "published",
        ]),
      "journal-invalid",
      "Journal entry schema is invalid.",
    );
    invariant(
      allowlistedTarget(entry.path, journal.sourceAllowlist) === entry.path,
      "journal-invalid",
      "Journal target is not allowlisted.",
    );
    invariant(!targets.has(entry.path), "journal-invalid", "Journal targets must be unique.");
    targets.add(entry.path);
    invariant(
      typeof entry.staged === "string" &&
        normalizeRelativeOutput(entry.staged) === entry.staged &&
        entry.staged.startsWith(".data-refresh/staging/"),
      "journal-invalid",
      "Journal staged path is invalid.",
    );
    invariant(
      !stagedPaths.has(entry.staged),
      "journal-invalid",
      "Journal staged files must be unique.",
    );
    stagedPaths.add(entry.staged);
    invariant(
      typeof entry.backup === "string" &&
        normalizeRelativeOutput(entry.backup) === entry.backup &&
        entry.backup === `.data-refresh/backups/${journal.id}/${index}.bak`,
      "journal-invalid",
      "Journal backup path is invalid.",
    );
    invariant(
      typeof entry.existed === "boolean" &&
        typeof entry.intent === "boolean" &&
        typeof entry.published === "boolean" &&
        (!entry.published || entry.intent),
      "journal-invalid",
      "Journal transition state is invalid.",
    );
    invariant(
      HASH_PATTERN.test(entry.targetHash),
      "journal-invalid",
      "Journal target hash is invalid.",
    );
    if (entry.existed) {
      invariant(
        entry.metadata &&
          sameKeys(entry.metadata, ["mode", "uid", "gid", "atimeMs", "mtimeMs"]) &&
          Number.isInteger(entry.metadata.mode) &&
          entry.metadata.mode >= 0 &&
          entry.metadata.mode <= 0o7777 &&
          Number.isInteger(entry.metadata.uid) &&
          Number.isInteger(entry.metadata.gid) &&
          Number.isFinite(entry.metadata.atimeMs) &&
          Number.isFinite(entry.metadata.mtimeMs) &&
          HASH_PATTERN.test(entry.backupHash),
        "journal-invalid",
        "Journal backup metadata is invalid.",
      );
    } else {
      invariant(
        entry.metadata === null && entry.backupHash === null,
        "journal-invalid",
        "Unexpected backup information for a new target.",
      );
    }
    if (journal.state === "committed")
      invariant(
        entry.published && entry.intent,
        "journal-invalid",
        "Committed journal contains an unpublished entry.",
      );
  });
  if (journal.state === "publishing") {
    let inProgressSeen = false;
    let unpublishedSeen = false;
    for (const entry of journal.entries) {
      if (entry.published) {
        invariant(
          !inProgressSeen && !unpublishedSeen,
          "journal-invalid",
          "Published entries must form a complete prefix.",
        );
      } else if (entry.intent) {
        invariant(
          !inProgressSeen && !unpublishedSeen,
          "journal-invalid",
          "Only the next entry may have an in-progress intent.",
        );
        inProgressSeen = true;
      } else {
        unpublishedSeen = true;
      }
    }
  }
}

function allowlistedTarget(value, sourceAllowlist) {
  const relative = normalizeRelativeOutput(value);
  const declaredOutputs = new Set(sourceAllowlist.flatMap(({ outputs }) => outputs));
  invariant(
    relative === ".data-refresh/semantic-state.json" || declaredOutputs.has(relative),
    "path-not-allowlisted",
    "Journal target is outside the exact source output allowlist.",
  );
  return relative;
}

function registrySnapshot(registry) {
  invariant(
    registry && Array.isArray(registry.sources) && registry.sources.length > 0,
    "journal-invalid",
    "A source registry is required for artifact publication and recovery.",
  );
  const sources = registry.sources
    .map((source) => {
      invariant(
        source && typeof source.id === "string" && source.identity && Array.isArray(source.outputs),
        "journal-invalid",
        "Source registry entry is invalid.",
      );
      return {
        sourceId: source.id,
        identity: structuredClone(source.identity),
        outputs: [...source.outputs].map((output) => normalizeRelativeOutput(output)).sort(),
      };
    })
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  validateAllowlistSnapshot(sources);
  return sources;
}

function validateAllowlistSnapshot(snapshot) {
  invariant(
    Array.isArray(snapshot) && snapshot.length > 0,
    "journal-invalid",
    "Journal source allowlist is invalid.",
  );
  const sourceIds = new Set();
  const outputs = new Set();
  for (const source of snapshot) {
    invariant(
      source &&
        typeof source === "object" &&
        !Array.isArray(source) &&
        sameKeys(source, ["sourceId", "identity", "outputs"]),
      "journal-invalid",
      "Journal source allowlist entry is invalid.",
    );
    invariant(
      typeof source.sourceId === "string" &&
        /^[a-z0-9][a-z0-9-]+$/.test(source.sourceId) &&
        !sourceIds.has(source.sourceId),
      "journal-invalid",
      "Journal source identities must be unique.",
    );
    sourceIds.add(source.sourceId);
    invariant(
      source.identity &&
        typeof source.identity === "object" &&
        !Array.isArray(source.identity) &&
        ["api", "file"].includes(source.identity.kind),
      "journal-invalid",
      "Journal source identity is invalid.",
    );
    invariant(
      Array.isArray(source.outputs) && source.outputs.length > 0,
      "journal-invalid",
      "Journal source outputs are invalid.",
    );
    for (const output of source.outputs) {
      invariant(
        normalizeRelativeOutput(output) === output &&
          output !== ".data-refresh/semantic-state.json" &&
          !outputs.has(output),
        "journal-invalid",
        "Journal source output is invalid or duplicated.",
      );
      outputs.add(output);
    }
  }
}

function validateJournalTargets(journal, sourceAllowlist) {
  for (const entry of journal.entries) allowlistedTarget(entry.path, sourceAllowlist);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function validateJournalFiles({ root, journal, backupRoot }) {
  const backupRootRel = path.relative(root, backupRoot).split(path.sep).join("/");
  invariant(
    backupRootRel === ".data-refresh/backups",
    "journal-invalid",
    "Backup root does not match the journal allowlist.",
  );
  const backupDirectoryRel = `${backupRootRel}/${journal.id}`;
  const expectedBackupDirectory = await resolveContainedPath(root, backupDirectoryRel);
  const backupDirectoryExists = await exists(expectedBackupDirectory);
  const cleanupCanResume = journal.state === "committed" || journal.state === "rolled-back";
  if (!backupDirectoryExists && !cleanupCanResume) throw recoveryError();
  const expectedBackups = new Set(
    journal.entries
      .filter((entry) => entry.existed)
      .map((entry) => path.posix.basename(entry.backup)),
  );
  const actualBackups = new Set(
    backupDirectoryExists ? await readdir(expectedBackupDirectory) : [],
  );
  invariant(
    [...actualBackups].every((name) => expectedBackups.has(name)),
    "journal-invalid",
    "Backup directory contents do not match journal entries.",
  );
  if (!cleanupCanResume)
    invariant(
      actualBackups.size === expectedBackups.size,
      "journal-invalid",
      "Backup directory contents do not match journal entries.",
    );
  for (const entry of journal.entries) {
    const target = await resolveContainedPath(root, entry.path);
    const staged = await resolveContainedPath(root, entry.staged);
    const targetExists = await exists(target);
    const stagedExists = await exists(staged);
    if (journal.state === "committed") {
      invariant(
        targetExists && (await hashFile(target)) === entry.targetHash,
        "journal-invalid",
        "Committed target does not match its recorded hash.",
      );
    } else if (journal.state === "rolled-back") {
      invariant(
        entry.existed
          ? targetExists && (await hashFile(target)) === entry.backupHash
          : !targetExists,
        "journal-invalid",
        "Rolled-back target does not match its original state.",
      );
    } else if (entry.published || (entry.intent && !stagedExists)) {
      invariant(
        targetExists && (await hashFile(target)) === entry.targetHash,
        "journal-invalid",
        "Published target does not match its recorded hash.",
      );
    }
    if (entry.existed) {
      if (actualBackups.has(path.posix.basename(entry.backup))) {
        const backup = await resolveContainedPath(root, entry.backup, { allowMissingLeaf: false });
        const info = await stat(backup);
        invariant(
          (info.mode & 0o7777) === entry.metadata.mode &&
            info.uid === entry.metadata.uid &&
            info.gid === entry.metadata.gid &&
            info.mtimeMs === entry.metadata.mtimeMs,
          "journal-invalid",
          "Journal backup metadata does not match.",
        );
        invariant(
          (await hashFile(backup)) === entry.backupHash,
          "journal-invalid",
          "Journal backup bytes do not match.",
        );
      }
    }
  }
}

async function removeTransactionBackups(backupRoot, transactionId) {
  await rm(path.join(backupRoot, transactionId), { recursive: true, force: true });
  await syncDirectory(path.dirname(backupRoot));
  try {
    await rmdir(backupRoot);
    await syncDirectory(path.dirname(backupRoot));
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTEMPTY") throw error;
  }
}

async function restoreMetadata(file, metadata) {
  await chown(file, metadata.uid, metadata.gid);
  await chmod(file, metadata.mode);
  await utimes(file, metadata.atimeMs / 1000, metadata.mtimeMs / 1000);
}

function sameKeys(value, keys) {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function hashFile(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

function recoveryError() {
  return new RefreshError(
    "recovery-required",
    "Publish journal is invalid or rollback could not be verified; canonical recovery is still required.",
  );
}

async function writeDurableJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await syncFile(temporary);
  await rename(temporary, file);
  await syncDirectory(path.dirname(file));
}

async function syncFile(file) {
  const handle = await open(file, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directory) {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectoryTree(root, directory) {
  let current = directory;
  while (true) {
    await syncDirectory(current);
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current || (parent !== root && !parent.startsWith(`${root}${path.sep}`)))
      throw new RefreshError("path-escape", "Directory sync escaped the repository root.");
    current = parent;
  }
}
