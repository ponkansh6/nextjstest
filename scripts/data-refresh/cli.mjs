#!/usr/bin/env node
import { adapters } from "./adapters/index.mjs";
import { registry } from "./registry/index.mjs";
import { runRefresh } from "./runner.mjs";
import { RefreshError } from "./lib/errors.mjs";
import { validateStagedRuntimeData } from "./runtime-validator.mjs";

const args = process.argv.slice(2);
if (
  args.some((argument) => argument !== "--check") ||
  args.filter((argument) => argument === "--check").length > 1
) {
  process.stderr.write("Usage: pnpm data:refresh [--check]\n");
  process.exitCode = 2;
} else {
  try {
    const report = await runRefresh({
      registry,
      adapters,
      check: args.includes("--check"),
      validate: validateStagedRuntimeData,
    });
    process.stdout.write(
      JSON.stringify({
        status: report.status,
        mode: report.mode,
        report: `.data-refresh/${report.startedAt.replaceAll(":", "-")}-${report.runId}.json`,
      }) + "\n",
    );
  } catch (error) {
    const code = error instanceof RefreshError ? error.code : "failed";
    const sources = Array.isArray(error.sources)
      ? error.sources
          .filter(
            (source) =>
              source && typeof source.sourceId === "string" && typeof source.reason === "string",
          )
          .map(({ sourceId, reason }) => ({ sourceId, reason }))
      : undefined;
    const report =
      typeof error.reportPath === "string" &&
      /^\.data-refresh\/reports\/[A-Za-z0-9._-]+\.json$/.test(error.reportPath)
        ? error.reportPath
        : undefined;
    process.stderr.write(
      `data:refresh failed (${code}).${sources?.length ? ` ${JSON.stringify({ sources })}` : ""}${report ? ` report=${report}` : ""}\n`,
    );
    process.exitCode = 1;
  }
}
