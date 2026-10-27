#!/usr/bin/env node

import { recordBrowserRouteBuild } from "./browser-route-build-fingerprint.mjs";

try {
  const record = await recordBrowserRouteBuild();
  console.log(`[browser-mode] recorded build ${record.buildId} (${record.sourceSha256})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
