#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createVitest } from "vitest/node";
import { makeTestNamePattern } from "./browser-test-name-pattern.mjs";

/**
 * @typedef {{ moduleId: string, testNamePattern?: RegExp }} BatchSpecification
 * @typedef {{ moduleId: string, ok: () => boolean }} BatchTestModule
 * @typedef {{
 *   standalone: () => Promise<unknown>,
 *   getRelevantTestSpecifications: (filters: string[]) => Promise<BatchSpecification[]>,
 *   runTestSpecifications: (specifications: BatchSpecification[]) => Promise<{
 *     testModules: BatchTestModule[],
 *     unhandledErrors: unknown[],
 *   }>,
 *   close: () => Promise<unknown>,
 * }} BatchVitestContext
 * @typedef {(
 *   mode: "test",
 *   options: { config: string, run: true, watch: false }
 * ) => Promise<BatchVitestContext>} BatchContextFactory
 */

/**
 * @param {{ config: string, entries: Array<{ file: string, names: string[] }> }} request
 * @param {{
 *   createContext?: BatchContextFactory,
 *   reportError?: (message: string) => void,
 * }} [options]
 */
export async function runBrowserTestBatch({ config, entries }, options = {}) {
  const createContext = options.createContext ?? createVitest;
  const reportError = options.reportError ?? ((message) => console.error(message));
  let context;
  let failed = false;

  try {
    context = await createContext("test", { config, run: true, watch: false });
    await context.standalone();

    for (const entry of entries) {
      const specifications = await context.getRelevantTestSpecifications([entry.file]);
      if (specifications.length !== 1) {
        throw new Error(
          `Expected one Vitest specification for ${entry.file}, received ${specifications.length}`,
        );
      }

      const [specification] = specifications;
      specification.testNamePattern = new RegExp(makeTestNamePattern(entry.names));

      const result = await context.runTestSpecifications([specification]);
      const currentTestModules = result.testModules.filter(
        (module) => module.moduleId === specification.moduleId,
      );
      if (
        result.unhandledErrors.length > 0 ||
        currentTestModules.length !== 1 ||
        currentTestModules.some((module) => !module.ok())
      ) {
        failed = true;
        break;
      }
    }
  } catch (error) {
    failed = true;
    reportError(
      `[browser-jev] batched Vitest run failed: ${error instanceof Error ? error.stack : error}`,
    );
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (error) {
        failed = true;
        reportError(
          `[browser-jev] could not close batched Vitest context: ${error instanceof Error ? error.stack : error}`,
        );
      }
    }
  }

  return failed ? 1 : 0;
}

async function main() {
  const requestPath = process.argv[2];
  if (!requestPath) throw new Error("Expected a browser test batch request file");

  const request = JSON.parse(await readFile(requestPath, "utf8"));
  if (
    typeof request.config !== "string" ||
    !Array.isArray(request.entries) ||
    request.entries.length < 2 ||
    request.entries.some(
      (entry) =>
        typeof entry.file !== "string" || !Array.isArray(entry.names) || entry.names.length === 0,
    )
  ) {
    throw new Error("Invalid browser test batch request");
  }

  process.exitCode = await runBrowserTestBatch(request);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[browser-jev] ${error instanceof Error ? error.stack : error}`);
    process.exitCode = 1;
  });
}
