#!/usr/bin/env node
import { adapters } from "./adapters/index.mjs";
import { registry } from "./registry/index.mjs";
import { runRefresh } from "./runner.mjs";
import { RefreshError } from "./lib/errors.mjs";
import { validateStagedRuntimeData } from "./runtime-validator.mjs";

const args = process.argv.slice(2);
const verifyFlag = "--verify-last-publish-noop";
const rebaselineArg = args.find((arg) => arg.startsWith("--rebaseline-semantic-state="));
const rebaselineHash = rebaselineArg?.slice("--rebaseline-semantic-state=".length);
const supportedArgs = new Set(["--check", verifyFlag]);
const validArgs =
  args.length <= 2 &&
  args.every((arg) => arg === rebaselineArg || supportedArgs.has(arg)) &&
  new Set(args).size === args.length &&
  (!rebaselineArg || /^[a-f0-9]{64}$/.test(rebaselineHash)) &&
  !(args.includes(verifyFlag) && rebaselineArg) &&
  (!args.includes(verifyFlag) || args.length === 1) &&
  (!args.includes("--check") || args.length <= 2);
if (!validArgs) {
  process.stderr.write(
    "Usage: pnpm data:refresh [--check | --verify-last-publish-noop] [--rebaseline-semantic-state=<sha256>]\n",
  );
  process.exitCode = 2;
} else {
  try {
    const report = await runRefresh({
      registry,
      adapters,
      check: args.includes("--check") || args.includes(verifyFlag),
      verifyLastPublishNoop: args.includes(verifyFlag),
      rebaselineSemanticStateHash: rebaselineHash,
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
