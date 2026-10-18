#!/usr/bin/env node
// Verify docs/history/plan54-bare-plan-ledger.tsv for exact bare-token coverage.
// This checks inventory completeness and token positions; it does not recategorize.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const ledgerPath = "docs/history/plan54-bare-plan-ledger.tsv";
const validatorPath = "scripts/plan54/verify-bare-plan-ledger.mjs";
const excludedPaths = new Set([
  ledgerPath,
  validatorPath,
  "docs/history/plan54-vocabulary-ledger.tsv",
  "scripts/plan54/generate-vocabulary-ledger.mjs",
]);
const categories = new Set([
  "historical numbered-plan reference",
  "generic planning prose",
  "third-party/literal",
  "genuinely ambiguous-preserve",
]);
const expected = {
  occurrences: 1281,
  lines: 1039,
  files: 190,
  categories: {
    "historical numbered-plan reference": 356,
    "generic planning prose": 827,
    "third-party/literal": 98,
    "genuinely ambiguous-preserve": 0,
  },
};

const ledgerText = readFileSync(resolve(root, ledgerPath), "utf8");
const headerLines = ledgerText.split("\n").filter((line) => line.startsWith("#"));
for (const required of [
  "supplementary",
  "standalone `plan` token",
  "numbered-token vocabulary ledger",
  "Excludes shared_plan/**",
  "vendor/**",
  "node_modules/**",
  ".git/**",
  "manually semantic-audited inventory",
]) {
  if (!headerLines.some((line) => line.includes(required))) {
    throw new Error(`ledger header missing required scope note: ${required}`);
  }
}
const dataLines = ledgerText.split("\n").filter((line) => line && !line.startsWith("#"));
if (dataLines.shift() !== "path\tline\tchar_offset\ttoken\tcategory\treason\tcontext") {
  throw new Error("ledger columns do not match the required schema");
}
const rows = dataLines.map((line, index) => {
  const fields = line.split("\t").map(unescapeTsv);
  if (fields.length !== 7) throw new Error(`ledger row ${index + 1} has ${fields.length} columns`);
  const [path, lineText, offsetText, token, category, reason, context] = fields;
  const lineNumber = Number(lineText);
  const offset = Number(offsetText);
  if (!Number.isInteger(lineNumber) || lineNumber < 1 || !Number.isInteger(offset) || offset < 0) {
    throw new Error(`invalid line or character offset at ledger row ${index + 1}`);
  }
  if (!categories.has(category))
    throw new Error(`unknown category at ${path}:${lineNumber}: ${category}`);
  if (token.toLowerCase() !== "plan" || !reason || !context) {
    throw new Error(`invalid token, reason, or context at ${path}:${lineNumber}:${offset}`);
  }
  return { path, line: lineNumber, offset, token, category };
});

const observedKeys = new Set();
const byCategory = Object.fromEntries([...categories].map((category) => [category, 0]));
for (const row of rows) {
  const key = makeKey(row.path, row.line, row.offset);
  if (observedKeys.has(key))
    throw new Error(`duplicate ledger token position: ${row.path}:${row.line}:${row.offset}`);
  observedKeys.add(key);
  byCategory[row.category] += 1;
}

const fileArgs = [
  "--files",
  "--hidden",
  "--glob",
  "!node_modules/**",
  "--glob",
  "!.git/**",
  "--glob",
  "!vendor/**",
  "--glob",
  "!**/shared_plan/**",
  "--glob",
  "!shared_plan/**",
  "--glob",
  "!scripts/plan54/**",
  "--glob",
  "!docs/history/plan54-*.tsv",
];
const files = execFileSync("rg", fileArgs, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
})
  .split("\n")
  .filter(Boolean)
  .filter((path) => !excludedPaths.has(path));
const actual = new Map();
for (const path of files) {
  const bytes = readFileSync(resolve(root, path));
  if (bytes.includes(0)) continue;
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    continue;
  }
  const sourceLines = content.split("\n");
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
    const sourceLine = sourceLines[lineIndex].replace(/\r$/, "");
    const pattern = /(?<![\p{L}\p{N}_])plan(?![\p{L}\p{N}_])/giu;
    for (const match of sourceLine.matchAll(pattern)) {
      const offset = Array.from(sourceLine.slice(0, match.index)).length;
      const key = makeKey(path, lineIndex + 1, offset);
      actual.set(key, match[0]);
    }
  }
}

const missing = [];
const mismatched = [];
for (const row of rows) {
  const key = makeKey(row.path, row.line, row.offset);
  const token = actual.get(key);
  if (token === undefined) missing.push(`${row.path}:${row.line}:${row.offset}`);
  else if (token !== row.token)
    mismatched.push(`${row.path}:${row.line}:${row.offset} (${row.token} != ${token})`);
}
const unlisted = [];
for (const [key, token] of actual) {
  if (!observedKeys.has(key)) unlisted.push(`${key} (${token})`);
}
if (missing.length || mismatched.length || unlisted.length) {
  const summary = [
    `bare-plan ledger coverage mismatch: ${missing.length} missing, ${unlisted.length} unlisted, ${mismatched.length} token mismatches`,
    ...missing.slice(0, 10).map((value) => `missing: ${value}`),
    ...unlisted.slice(0, 10).map((value) => `unlisted: ${value}`),
    ...mismatched.slice(0, 10).map((value) => `mismatched: ${value}`),
  ];
  throw new Error(summary.join("\n"));
}

const lineKeys = new Set(rows.map((row) => `${row.path}\0${row.line}`));
const filePaths = new Set(rows.map((row) => row.path));
process.stdout.write(
  `Occurrences\t${rows.length}\nDistinct lines\t${lineKeys.size}\nFiles\t${filePaths.size}\n`,
);
for (const category of [...categories].sort())
  process.stdout.write(`${category}\t${byCategory[category]}\n`);
for (const [label, observed, expectedValue] of [
  ["occurrences", rows.length, expected.occurrences],
  ["distinct lines", lineKeys.size, expected.lines],
  ["files", filePaths.size, expected.files],
]) {
  if (observed !== expectedValue)
    throw new Error(
      `${label} total is ${observed}, expected ${expectedValue}; update the manually reviewed ledger header after audit`,
    );
}
for (const [category, count] of Object.entries(expected.categories)) {
  if (byCategory[category] !== count) {
    throw new Error(
      `${category} total is ${byCategory[category]}, expected ${count}; preserve manual classifications and audit before updating`,
    );
  }
}

function makeKey(path, line, offset) {
  return `${path}\0${line}\0${offset}`;
}

function unescapeTsv(value) {
  return value.replace(
    /\\([\\trn])/g,
    (_, escaped) => ({ "\\": "\\", t: "\t", r: "\r", n: "\n" })[escaped],
  );
}
