#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KINDS = ["B", "A", "L"];
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_ARTIFACT_ROOT = path.join(REPO_ROOT, "data/source/cti-adjusted");
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--create" || argument === "--verify" || argument === "--force") {
      args.set(argument, true);
    } else if (argument === "--restore") {
      if (!argv[index + 1] || argv[index + 1].startsWith("--"))
        throw new Error("--restore requires a snapshot id");
      args.set(argument, argv[index + 1]);
      index += 1;
    } else if (argument.startsWith("--") && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      args.set(argument, argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return args;
}

function artifactFiles(root) {
  return Object.fromEntries(KINDS.map((kind) => [kind, path.join(root, `${kind}.json`)]));
}

function artifactHashes(root) {
  const files = artifactFiles(root);
  const hashes = Object.fromEntries(KINDS.map((kind) => [kind, sha256(files[kind])]));
  const canonical = KINDS.map((kind) => `${kind}:${hashes[kind]}`).join("\n");
  return { hashes, canonical, snapshotId: createHash("sha256").update(canonical).digest("hex") };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function snapshotPath(root, snapshotId) {
  if (!HASH_PATTERN.test(snapshotId)) throw new Error("snapshot id must be a SHA-256 hex digest");
  return path.join(root, "snapshots", `plan39-${snapshotId}`);
}

function readSnapshot(root, snapshotId) {
  const directory = snapshotPath(root, snapshotId);
  if (!fs.existsSync(directory)) throw new Error(`snapshot not found: ${directory}`);
  const hashes = readJson(path.join(directory, "hashes.json"));
  if (hashes.snapshotId !== snapshotId || hashes.hashAlgorithm !== "SHA-256")
    throw new Error("invalid snapshot hash manifest");
  if (hashes.canonicalInput !== KINDS.map((kind) => `${kind}:${hashes.artifacts[kind]}`).join("\n"))
    throw new Error("snapshot canonical hash input mismatch");
  for (const kind of KINDS) {
    const file = path.join(directory, `${kind}.json`);
    if (sha256(file) !== hashes.artifacts[kind])
      throw new Error(`snapshot artifact hash mismatch: ${kind}`);
    const metadata = readJson(path.join(directory, "metadata", `${kind}.json`));
    if (sha256(path.join(directory, "metadata", `${kind}.json`)) !== hashes.metadata[kind])
      throw new Error(`snapshot metadata hash mismatch: ${kind}`);
    if (JSON.stringify(readJson(file).metadata) !== JSON.stringify(metadata))
      throw new Error(`snapshot metadata content mismatch: ${kind}`);
  }
  if (sha256(path.join(directory, "manifest.json")) !== hashes.manifest)
    throw new Error("snapshot manifest hash mismatch");
  if (sha256(path.join(directory, "audit.json")) !== hashes.audit)
    throw new Error("snapshot audit hash mismatch");
  return { directory, hashes };
}

function verifyLoaderHashes(root) {
  const manifestFile = path.join(root, "manifest.json");
  const manifest = readJson(manifestFile);
  if (manifest.schemaVersion !== "plan39-annual-v1" || manifest.statisticalCode !== "00200567")
    throw new Error("invalid Plan39 manifest");
  for (const kind of KINDS) {
    const entry = manifest.artifacts?.[kind];
    if (!entry?.path || !HASH_PATTERN.test(entry.sha256))
      throw new Error(`loader manifest hash missing: ${kind}`);
    const file = path.resolve(root, entry.path);
    if (path.dirname(file) !== path.resolve(root) || sha256(file) !== entry.sha256)
      throw new Error(`loader artifact hash mismatch: ${kind}`);
    const metadata = readJson(file).metadata;
    if (
      !metadata ||
      metadata.schemaVersion !== manifest.schemaVersion ||
      metadata.revision !== manifest.revision ||
      metadata.statisticalCode !== manifest.statisticalCode
    ) {
      throw new Error(`loader metadata contract mismatch: ${kind}`);
    }
    if (metadata.sha256 !== sha256(file) && metadata.sourceSha256 !== metadata.sha256)
      throw new Error(`loader metadata hash contract mismatch: ${kind}`);
  }
  return Object.fromEntries(KINDS.map((kind) => [kind, manifest.artifacts[kind].sha256]));
}

function createSnapshot(root) {
  const { hashes, canonical, snapshotId } = artifactHashes(root);
  const artifactDigest = { ...hashes };
  const metadataDigest = {};
  const directory = snapshotPath(root, snapshotId);
  if (fs.existsSync(directory)) {
    readSnapshot(root, snapshotId);
    console.log(`snapshot already verified: ${snapshotId}`);
    return snapshotId;
  }
  for (const kind of KINDS)
    if (!fs.existsSync(path.join(root, `${kind}.json`)))
      throw new Error(`missing artifact: ${kind}`);
  const staging = path.join(root, `snapshots/.plan39-${snapshotId}.staging`);
  if (fs.existsSync(staging)) throw new Error(`staging path already exists: ${staging}`);
  fs.mkdirSync(path.join(staging, "metadata"), { recursive: true });
  for (const kind of KINDS) {
    fs.copyFileSync(path.join(root, `${kind}.json`), path.join(staging, `${kind}.json`));
    writeJson(
      path.join(staging, "metadata", `${kind}.json`),
      readJson(path.join(root, `${kind}.json`)).metadata,
    );
    metadataDigest[kind] = sha256(path.join(staging, "metadata", `${kind}.json`));
  }
  for (const name of ["manifest.json", "audit.json"])
    fs.copyFileSync(path.join(root, name), path.join(staging, name));
  const manifestDigest = sha256(path.join(staging, "manifest.json"));
  const auditDigest = sha256(path.join(staging, "audit.json"));
  writeJson(path.join(staging, "hashes.json"), {
    schemaVersion: "plan39-rollback-v1",
    hashAlgorithm: "SHA-256",
    snapshotId,
    canonicalInput: canonical,
    artifacts: artifactDigest,
    metadata: metadataDigest,
    manifest: manifestDigest,
    audit: auditDigest,
  });
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.renameSync(staging, directory);
  readSnapshot(root, snapshotId);
  console.log(`created and verified snapshot: ${snapshotId}`);
  return snapshotId;
}

function restoreSnapshot(root, snapshotId, force) {
  const { directory, hashes } = readSnapshot(root, snapshotId);
  const loaderHashes = verifyLoaderHashes(directory);
  if (JSON.stringify(loaderHashes) !== JSON.stringify(hashes.artifacts))
    throw new Error("snapshot does not satisfy loader hash contract");
  if (!force) throw new Error("restore requires --force; no files were changed");
  const staging = path.join(root, `.plan39-restore-${snapshotId}.staging`);
  if (fs.existsSync(staging)) throw new Error(`staging path already exists: ${staging}`);
  fs.mkdirSync(staging, { recursive: true });
  for (const name of ["B.json", "A.json", "L.json", "manifest.json", "audit.json"])
    fs.copyFileSync(path.join(directory, name), path.join(staging, name));
  for (const name of ["B.json", "A.json", "L.json", "manifest.json", "audit.json"])
    fs.copyFileSync(path.join(staging, name), path.join(root, name));
  fs.rmSync(staging, { recursive: true, force: true });
  const restored = verifyLoaderHashes(root);
  if (JSON.stringify(restored) !== JSON.stringify(hashes.artifacts))
    throw new Error("restored loader hash verification failed");
  console.log(`restored and loader-hash-verified snapshot: ${snapshotId}`);
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.get("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
if (
  [args.has("--create"), args.has("--verify"), args.has("--restore")].filter(Boolean).length !== 1
) {
  throw new Error("choose exactly one of --create, --verify, or --restore");
}
if (args.has("--create")) createSnapshot(root);
if (args.has("--verify")) {
  const { snapshotId } = artifactHashes(root);
  readSnapshot(root, snapshotId);
  verifyLoaderHashes(root);
  console.log(`current artifacts and loader hashes verified: ${snapshotId}`);
}
if (args.has("--restore")) {
  const snapshotId = args.get("--restore");
  if (typeof snapshotId !== "string") throw new Error("--restore requires a snapshot id");
  restoreSnapshot(root, snapshotId, args.has("--force"));
}
