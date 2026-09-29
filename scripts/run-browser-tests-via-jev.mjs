#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VITEST = path.join(ROOT, "node_modules/vitest/vitest.mjs");
const JEV_CLIENT = path.join(ROOT, "skills/jev-review/scripts/jev-request.mjs");
const ROUTE_RUNNER = path.join(ROOT, "scripts/run-next-route-poc.mjs");
const CONFIGS = [
  "vitest.browser.config.ts",
  "vitest.browser.aggregate-chromium.config.ts",
  "vitest.browser.webkit.config.ts",
];
const ROUTE_CONFIGS = new Set(CONFIGS.slice(1));
const QUESTIONS_PER_REQUEST = 24;
const LISTING_EXCERPT_LIMIT = 800;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function fail(message) {
  throw new Error(message);
}

function safeExcerpt(value) {
  const text = String(value ?? "")
    .replace(
      /(\bTYPESAFE_API_KEY\b["']?\s*(?:=|:)\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[REDACTED]",
    )
    .replace(/(\bAuthorization\b["']?\s*:\s*["']?\s*Bearer\s+)[^\s,;"']+/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]");
  const truncated = text.length > LISTING_EXCERPT_LIMIT;
  return `${JSON.stringify(text.slice(0, LISTING_EXCERPT_LIMIT))}${truncated ? " (truncated)" : ""}`;
}

function listingDiagnostic(config, result, reason, artifactDirectory) {
  return [
    `Vitest catalog listing failed for ${config}: ${reason}`,
    `exit status=${result.status ?? "unavailable"}`,
    `stderr=${safeExcerpt(result.stderr)}`,
    `stdout=${safeExcerpt(result.stdout)}`,
    `raw listing diagnostics saved at ${artifactDirectory}`,
    result.error ? `spawn error=${safeExcerpt(result.error.message)}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

function parseArgs(args) {
  const changedPaths = [];
  let scope = "all";
  let positionalOnly = false;
  for (const arg of args) {
    if (positionalOnly) {
      changedPaths.push(arg);
      continue;
    }
    if (arg === "--") {
      positionalOnly = true;
      continue;
    }
    if (arg.startsWith("--scope=")) {
      scope = arg.slice("--scope=".length);
      if (!["all", "component", "routes"].includes(scope))
        fail(`Unknown browser-test scope: ${scope}`);
      continue;
    }
    if (arg.startsWith("--")) fail(`Unexpected option: ${arg}`);
    changedPaths.push(arg);
  }
  return { changedPaths, scope };
}

function normalizeFile(file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(ROOT, file);
  const relative = path.relative(ROOT, absolute).split(path.sep).join("/");
  if (relative.startsWith("../") || path.isAbsolute(relative))
    fail(`Vitest returned a file outside the repository: ${file}`);
  return relative;
}

function candidateId(config, file, name) {
  return createHash("sha256").update(`${config}\0${file}\0${name}`).digest("hex").slice(0, 16);
}

function parseList(stdout, config) {
  if (!stdout.trim()) fail("Vitest list returned empty output.");
  let entries;
  try {
    entries = JSON.parse(stdout);
  } catch {
    fail("Vitest list returned invalid JSON.");
  }
  if (!Array.isArray(entries)) fail("Vitest list returned an unexpected JSON shape.");
  const grouped = new Map();
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.file !== "string" ||
      typeof entry.name !== "string" ||
      !entry.name.trim()
    )
      fail(`Vitest list contained an invalid case for ${config}.`);
    const file = normalizeFile(entry.file);
    const key = `${file}\0${entry.name}`;
    const group = grouped.get(key) ?? { config, file, name: entry.name, occurrences: 0 };
    group.occurrences += 1;
    grouped.set(key, group);
  }
  return [...grouped.values()].map((candidate) => ({
    ...candidate,
    id: candidateId(candidate.config, candidate.file, candidate.name),
  }));
}

function collectCatalog(configs, diagnosticsDirectory) {
  const catalog = [];
  const listings = [];
  for (const config of configs) {
    const args = [VITEST, "list", "--config", config, "--json"];
    const result = run(process.execPath, args);
    const stdoutFile = path.join(diagnosticsDirectory, `${config}.stdout.txt`);
    const stderrFile = path.join(diagnosticsDirectory, `${config}.stderr.txt`);
    const metadataFile = path.join(diagnosticsDirectory, `${config}.metadata.json`);
    writeFileSync(stdoutFile, result.stdout ?? "", { flag: "wx", mode: 0o600 });
    writeFileSync(stderrFile, result.stderr ?? "", { flag: "wx", mode: 0o600 });
    writeFileSync(
      metadataFile,
      `${JSON.stringify(
        {
          config,
          command: process.execPath,
          args,
          exitStatus: result.status,
          signal: result.signal,
          spawnError: result.error
            ? {
                code: result.error.code,
                errno: result.error.errno,
                syscall: result.error.syscall,
                message: result.error.message,
              }
            : null,
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );
    listings.push({ config, result });
    if (result.error || result.status !== 0) {
      fail(
        listingDiagnostic(config, result, "Vitest list subprocess failed", diagnosticsDirectory),
      );
    }
    try {
      catalog.push(...parseList(result.stdout ?? "", config));
    } catch (error) {
      fail(listingDiagnostic(config, result, error.message, diagnosticsDirectory));
    }
  }
  if (catalog.length === 0) {
    fail(
      `The active browser-test catalog is empty. ${listings
        .map(({ config, result }) =>
          listingDiagnostic(config, result, "Vitest returned no test cases", diagnosticsDirectory),
        )
        .join(" | ")}`,
    );
  }
  const ids = new Set();
  for (const candidate of catalog) {
    if (ids.has(candidate.id)) fail(`Browser-test catalog ID collision: ${candidate.id}`);
    ids.add(candidate.id);
  }
  return catalog;
}

function requestForChunk(candidates, changedPaths, chunkNumber, chunkCount) {
  const questions = {};
  for (const candidate of candidates) {
    questions[candidate.id] = {
      type: "choice",
      instructions:
        "Should this exact browser test group run for the pushed changes? Choose run or skip.",
      criteria: {
        run: `Run ${candidate.config} :: ${candidate.file} :: ${candidate.name}${candidate.occurrences > 1 ? ` (groups ${candidate.occurrences} cases with this identical full title)` : ""}`,
        skip: "Skip this test for the current push.",
      },
    };
  }
  return {
    model: process.env.TYPESAFE_MODEL || "jev-latest",
    state: {
      evaluationScope: "select_browser_tests",
      changedPaths,
      catalogChunk: `${chunkNumber}/${chunkCount}`,
      candidateCount: candidates.length,
      outputRequirement:
        "Answer every listed question exactly once. Select run only when it adds useful browser coverage for the changed paths. The catalog is the complete set of available test groups in this chunk. Do not invent IDs or tests.",
    },
    questions,
  };
}

function answerEntries(response) {
  const raw = response?.rawResponse;
  const answers =
    raw?.answers ??
    raw?.data?.answers ??
    raw?.result?.answers ??
    raw?.output?.answers ??
    raw?.data?.result?.answers;
  if (Array.isArray(answers))
    return answers.map((answer) => [answer?.questionId ?? answer?.id, answer]);
  if (answers && typeof answers === "object")
    return Object.entries(answers).map(([id, answer]) => [
      answer?.questionId ?? answer?.id ?? id,
      answer,
    ]);
  fail("JEV response did not contain an answer list.");
}

function answerChoice(answer) {
  return typeof answer === "string"
    ? answer
    : (answer?.choice ??
        answer?.selectedChoice ??
        answer?.selected_choice ??
        answer?.value?.choice ??
        answer?.value?.selectedChoice ??
        answer?.value?.selected_choice ??
        answer?.answer ??
        (typeof answer?.value === "string" ? answer.value : undefined));
}

function selectedFromResponse(response, expected) {
  if (response?.status !== "http-success" || response?.responseValidation?.valid !== true)
    fail(
      `JEV selection request was not valid: ${response?.responseValidation?.error ?? response?.status ?? "unknown response"}`,
    );
  const entries = answerEntries(response);
  const answers = new Map();
  for (const [rawId, answer] of entries) {
    const id = String(rawId ?? "");
    if (!expected.has(id) || answers.has(id))
      fail(`JEV returned an unknown or duplicate browser-test ID: ${id || "<missing>"}`);
    answers.set(id, answerChoice(answer));
  }
  for (const id of expected) if (!answers.has(id)) fail(`JEV omitted browser-test answer ${id}.`);
  const selected = [];
  for (const [id, choice] of answers) {
    if (choice === "run") selected.push(id);
    else if (choice !== "skip")
      fail(`JEV returned an unsupported choice for ${id}: ${String(choice)}`);
  }
  return selected;
}

async function askJev(catalog, changedPaths, directory) {
  const selected = new Set();
  const chunks = [];
  for (let offset = 0; offset < catalog.length; offset += QUESTIONS_PER_REQUEST)
    chunks.push(catalog.slice(offset, offset + QUESTIONS_PER_REQUEST));
  for (const [index, chunk] of chunks.entries()) {
    const requestFile = path.join(directory, `request-${index}.json`);
    const responseFile = path.join(directory, `response-${index}.json`);
    await writeFile(
      requestFile,
      `${JSON.stringify(requestForChunk(chunk, changedPaths, index + 1, chunks.length), null, 2)}\n`,
      { flag: "wx" },
    );
    const result = run(process.execPath, [
      JEV_CLIENT,
      "--catalog-selection-request",
      requestFile,
      "--output",
      responseFile,
    ]);
    if (result.error || result.status !== 0)
      fail(
        `JEV browser-test selection failed: ${(result.stderr || result.error?.message || "request failed").trim()}`,
      );
    const response = JSON.parse(await readFile(responseFile, "utf8"));
    const ids = new Set(chunk.map(({ id }) => id));
    for (const id of selectedFromResponse(response, ids)) selected.add(id);
  }
  return selected;
}

function makeSelection(catalog, selected) {
  const direct = new Map();
  const routes = {};
  for (const candidate of catalog) {
    if (!selected.has(candidate.id)) continue;
    if (ROUTE_CONFIGS.has(candidate.config)) {
      const files = (routes[candidate.config] ??= new Map());
      const names = files.get(candidate.file) ?? new Set();
      names.add(candidate.name);
      files.set(candidate.file, names);
    } else {
      const key = `${candidate.config}\0${candidate.file}`;
      const entry = direct.get(key) ?? {
        config: candidate.config,
        file: candidate.file,
        names: new Set(),
      };
      entry.names.add(candidate.name);
      direct.set(key, entry);
    }
  }
  return {
    direct: [...direct.values()].map((entry) => ({ ...entry, names: [...entry.names] })),
    routes: Object.fromEntries(
      Object.entries(routes).map(([config, files]) => [
        config,
        [...files].map(([file, names]) => ({ file, names: [...names] })),
      ]),
    ),
  };
}

function runSelectedTests(selection, directory) {
  for (const entry of selection.direct) {
    const pattern = `^(?:${entry.names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`;
    const filter =
      entry.config === "vitest.browser.webkit.config.ts"
        ? `(?=.*webkit)${pattern}`
        : `^(?!.*-webkit)(?:${entry.names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`;
    const result = run(
      process.execPath,
      [VITEST, "run", "--config", entry.config, "--testNamePattern", filter, entry.file],
      { stdio: "inherit" },
    );
    if (result.error || result.status !== 0) return result.status ?? 1;
  }
  if (Object.keys(selection.routes).length) {
    const file = path.join(directory, "route-selection.json");
    writeFileSync(file, `${JSON.stringify(selection.routes, null, 2)}\n`, { flag: "wx" });
    const result = run(process.execPath, [ROUTE_RUNNER, `--selection-file=${file}`], {
      stdio: "inherit",
    });
    if (result.error || result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

async function main() {
  const { changedPaths, scope } = parseArgs(process.argv.slice(2));
  const configs =
    scope === "all" ? CONFIGS : scope === "routes" ? CONFIGS.slice(1) : CONFIGS.slice(0, 1);
  const diagnosticsDirectory = await mkdtemp(
    path.join(os.tmpdir(), "nextjstest-browser-jev-diagnostics-"),
  );
  await chmod(diagnosticsDirectory, 0o700);
  let completedSuccessfully = false;
  try {
    const catalog = collectCatalog(configs, diagnosticsDirectory);
    if (catalog.length === 0) fail(`The ${scope} browser-test catalog is empty.`);
    console.log(
      `[browser-jev] catalog: ${catalog.length} selectable groups across ${configs.length} Vitest Browser Mode configs`,
    );
    const directory = await mkdtemp(path.join(os.tmpdir(), "nextjstest-browser-jev-"));
    try {
      const selected = await askJev(catalog, changedPaths, directory);
      console.log(`[browser-jev] selected ${selected.size}/${catalog.length} groups`);
      if (selected.size === 0) {
        console.log("[browser-jev] JEV selected no browser tests.");
        completedSuccessfully = true;
        return;
      }
      for (const candidate of catalog) {
        if (!selected.has(candidate.id)) continue;
        console.log(
          `[browser-jev] selected ${JSON.stringify({
            config: candidate.config,
            file: candidate.file,
            name: candidate.name,
            groupedCases: candidate.occurrences,
          })}`,
        );
      }
      const selection = makeSelection(catalog, selected);
      process.exitCode = runSelectedTests(selection, directory);
      completedSuccessfully = process.exitCode === 0;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`[browser-jev] ${error instanceof Error ? error.message : error}`);
    console.error(`[browser-jev] catalog diagnostics preserved at ${diagnosticsDirectory}`);
    process.exitCode = 1;
  } finally {
    if (completedSuccessfully) await rm(diagnosticsDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[browser-jev] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
