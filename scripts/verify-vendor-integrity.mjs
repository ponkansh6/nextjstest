#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archive = resolve(root, "vendor/xlsx-0.20.3.tgz");
const checksumFile = `${archive}.sha512`;

function fail(message) {
  console.error(`vendor integrity check failed: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(archive)) {
  fail(`missing archive: ${archive}`);
} else if (!existsSync(checksumFile)) {
  fail(`missing checksum file: ${checksumFile}`);
} else {
  const entries = readFileSync(checksumFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const expected = entries
    .find(
      (line) =>
        line.endsWith("  vendor/xlsx-0.20.3.tgz") || line.endsWith(" *vendor/xlsx-0.20.3.tgz"),
    )
    ?.split(/\s+/)[0];
  if (entries.length !== 1 || !expected || !/^[a-f0-9]{128}$/i.test(expected)) {
    fail(`invalid checksum file: ${checksumFile}`);
  } else {
    const hash = createHash("sha512");
    const stream = createReadStream(archive);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (error) => fail(error.message));
    stream.on("end", () => {
      const actual = hash.digest("hex");
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        fail(`checksum mismatch for ${archive}`);
      } else {
        console.log(`vendor integrity verified: ${archive}`);
      }
    });
  }
}
