#!/usr/bin/env node
// Reproduce docs/history/plan54-vocabulary-ledger.tsv.
// Scope: repository files matched by rg --hidden (Plan|plan)[0-9]+, excluding
// node_modules, .git, pnpm-lock.yaml, shared_plan and shared_plan* directories,
// vendor/third-party files, this generator/its own output, and the separately
// audited bare-plan ledger/verifier. Plan 54 itself is reported separately.
// Usage: node scripts/plan54/generate-vocabulary-ledger.mjs [output.tsv]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, process.argv[2] ?? "docs/history/plan54-vocabulary-ledger.tsv");
const args = [
  "-n",
  "-i",
  "--hidden",
  "--glob",
  "!node_modules/**",
  "--glob",
  "!.git/**",
  "--glob",
  "!pnpm-lock.yaml",
  "--glob",
  "!**/shared_plan/**",
  "--glob",
  "!**/shared_plan*/**",
  "--glob",
  "!vendor/**",
  "--glob",
  "!scripts/plan54/generate-vocabulary-ledger.mjs",
  "--glob",
  "!docs/history/plan54-vocabulary-ledger.tsv",
  "--glob",
  "!scripts/plan54/verify-bare-plan-ledger.mjs",
  "--glob",
  "!docs/history/plan54-bare-plan-ledger.tsv",
  "(Plan|plan)[0-9]+",
  ".",
];
const raw = execFileSync("rg", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const rows = raw
  .trimEnd()
  .split("\n")
  .filter(Boolean)
  .map((entry) => {
    const first = entry.indexOf(":");
    const second = entry.indexOf(":", first + 1);
    const path = entry.slice(0, first).replace(/^\.\//, "");
    const line = Number(entry.slice(first + 1, second));
    const text = entry.slice(second + 1);
    const { category, reason } = classify(path, text);
    return { path, line, category, reason, text };
  })
  .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);

const countBy = (key) =>
  Object.groupBy
    ? Object.groupBy(rows, (row) => row[key])
    : rows.reduce((acc, row) => ((acc[row[key]] ??= []).push(row), acc), {});
const byCategory = countBy("category");
const byPath = new Set(rows.map((row) => row.path));
const separatePlan54 = execFileSync(
  "rg",
  [
    "-n",
    "-i",
    "--hidden",
    "--glob",
    "!node_modules/**",
    "--glob",
    "!.git/**",
    "--glob",
    "!pnpm-lock.yaml",
    "(Plan|plan)[0-9]+",
    "shared_plan/54-domain-naming-and-spec-cleanup.md",
  ],
  { cwd: root, encoding: "utf8" },
)
  .trimEnd()
  .split("\n")
  .filter(Boolean).length;
const safeRenameCandidates = [];
const lines = [
  "# Plan 54 vocabulary occurrence ledger. Regenerate with: node scripts/plan54/generate-vocabulary-ledger.mjs",
  "# Scope: rg -n -i --hidden --glob !node_modules/** --glob !.git/** --glob !pnpm-lock.yaml --glob !**/shared_plan/** --glob !**/shared_plan*/** --glob !vendor/** --glob !scripts/plan54/generate-vocabulary-ledger.mjs --glob !docs/history/plan54-vocabulary-ledger.tsv --glob !scripts/plan54/verify-bare-plan-ledger.mjs --glob !docs/history/plan54-bare-plan-ledger.tsv (Plan|plan)[0-9]+ .",
  `# Matched files: ${byPath.size}; matching lines: ${rows.length}; Plan 54 document matches (separate): ${separatePlan54}.`,
  "# Excluded vendor/** is third-party code. Other excluded scopes are node_modules, .git, pnpm-lock.yaml, shared_plan/**, shared_plan*/**, this generator/output, and the separately audited bare-plan ledger/verifier.",
  "# Categories: results-evidence, openspec-current-retired, tests-fixtures, scripts-tooling, server-src-runtime, history-docs, config, data-schema-artifacts, docs-root, other.",
  "# No safe renames are asserted automatically; candidate paths require manual reference/fixture lineage review before any rename.",
  "# Safe rename candidate paths: none established by this occurrence-only inventory.",
  "path\tline\tcategory\treason\tmatching_line",
  ...rows.map((row) =>
    [row.path, row.line, row.category, row.reason, row.text].map(tsv).join("\t"),
  ),
];
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${lines.join("\n")}\n`);
for (const category of Object.keys(byCategory).sort()) {
  const entries = byCategory[category];
  process.stdout.write(
    `${category}\t${new Set(entries.map((row) => row.path)).size}\t${entries.length}\n`,
  );
}
process.stdout.write(`TOTAL\t${byPath.size}\t${rows.length}\n`);
process.stdout.write(`PLAN54_SEPARATE\t1\t${separatePlan54}\n`);
process.stdout.write(`SAFE_RENAME_CANDIDATE_PATHS\t${safeRenameCandidates.length}\n`);

function tsv(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n");
}

function classify(path, text) {
  const lower = path.toLowerCase();
  if (lower.startsWith("results/"))
    return {
      category: "results-evidence",
      reason:
        "Committed request, result, or verification evidence; preserve path and bytes for traceability.",
    };
  if (lower.startsWith("openspec/"))
    return {
      category: "openspec-current-retired",
      reason: /retired|histor|legacy|removed|previous|plan\d+/i.test(text)
        ? "Retired or historical requirement/anchor reference; preserve the stable reference and its history mapping."
        : "Current specification contract or stable requirement reference; retain until its requirement and incoming anchors are deliberately migrated.",
    };
  if (lower.startsWith("tests/"))
    return {
      category: "tests-fixtures",
      reason: /fixture|legacy|compat|schema|snapshot|plan\d+/i.test(text)
        ? "Test or fixture lineage/compatibility vocabulary; retain while it identifies the behavior or input under test."
        : "Test assertion or test organization reference; rename only with all runner, fixture, and reference paths updated together.",
    };
  if (lower.startsWith("scripts/"))
    return {
      category: "scripts-tooling",
      reason:
        "Operator/tooling path or artifact vocabulary; retain while callers and persisted outputs depend on the name.",
    };
  if (lower.startsWith("server/") || lower.startsWith("src/"))
    return {
      category: "server-src-runtime",
      reason: /compat|legacy|alias|normaliz|schema/i.test(text)
        ? "Runtime compatibility boundary or schema vocabulary; keep until old inputs/exports are proven unused and removal is explicitly safe."
        : "Runtime consumer, public metadata, or diagnostic reference; verify wire-contract and consumer effects before any rename.",
    };
  if (lower.startsWith("docs/history/"))
    return {
      category: "history-docs",
      reason: "Historical audit or compatibility map; preserve as traceability evidence.",
    };
  if (
    /^(package\.json|tsconfig|vitest|playwright|\.gitignore|\.ox|\.secretlint|\.depcheck)/i.test(
      path,
    )
  )
    return {
      category: "config",
      reason:
        "Tool/test configuration label or path; update only in lockstep with the referenced suite/path.",
    };
  if (lower.startsWith("data/") || lower.startsWith("shared/"))
    return {
      category: "data-schema-artifacts",
      reason:
        "Data, schema registry, or artifact vocabulary; preserve stored bytes and hashes, and distinguish canonical values from compatibility aliases.",
    };
  if (lower.startsWith("docs/"))
    return {
      category: "docs-root",
      reason:
        "Documentation or testing-profile reference; update only when the described path/behavior changes and preserve historical context.",
    };
  return {
    category: "other",
    reason:
      "Root-level or uncategorized repository reference; retain until its consumer and purpose are confirmed.",
  };
}
