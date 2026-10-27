import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_ID_FILE = path.join(ROOT, ".next", "BUILD_ID");
const FINGERPRINT_FILE = path.join(ROOT, ".next", "browser-route-build-fingerprint.json");
const ROOT_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "tsconfig.json",
];
const ROOT_DIRS = [
  "src",
  "server",
  "data/source",
  "public",
  "tests/browser-mode",
  "tests/config/browser",
];

async function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function fingerprint() {
  if (!existsSync(BUILD_ID_FILE))
    throw new Error("No `.next/BUILD_ID` exists; build the application first.");
  const files = [
    BUILD_ID_FILE,
    ...ROOT_FILES.map((file) => path.join(ROOT, file)).filter(existsSync),
    ...(
      await Promise.all(ROOT_DIRS.map((directory) => collectFiles(path.join(ROOT, directory))))
    ).flat(),
    path.join(ROOT, "scripts/run-next-route-poc.mjs"),
    path.join(ROOT, "scripts/browser-mode-case-manifest.mjs"),
    path.join(ROOT, "scripts/browser-mode-report-validation.mjs"),
  ]
    .filter(existsSync)
    .sort((left, right) => left.localeCompare(right));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(ROOT, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return {
    schemaVersion: 2,
    buildId: (await readFile(BUILD_ID_FILE, "utf8")).trim(),
    sourceSha256: hash.digest("hex"),
  };
}

export async function recordBrowserRouteBuild() {
  const record = await fingerprint();
  await writeFile(FINGERPRINT_FILE, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

export async function assertBrowserRouteBuildCurrent() {
  if (!existsSync(FINGERPRINT_FILE))
    throw new Error(
      "No browser-route build fingerprint exists; run `pnpm run build` before Pixel 7 route tests.",
    );
  const recorded = JSON.parse(await readFile(FINGERPRINT_FILE, "utf8"));
  const current = await fingerprint();
  if (
    recorded?.schemaVersion !== current.schemaVersion ||
    recorded?.buildId !== current.buildId ||
    recorded?.sourceSha256 !== current.sourceSha256
  ) {
    throw new Error(
      "The production build does not match the current source and Browser Mode configuration; run `pnpm run build` again.",
    );
  }
}
