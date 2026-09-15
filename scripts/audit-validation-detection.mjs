import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaVersion = "1.0.0";
const classificationCases = [
  ["source", "src/lib/example.ts", "changed", "source"],
  ["server", "server/example.ts", "changed", "server"],
  ["test", "tests/unit/example.test.ts", "changed", "tests"],
  ["docs", "docs/example.md", "changed", "docs/assets"],
  ["assets", "public/example.svg", "changed", "docs/assets"],
  ["config", "package.json", "full", "config/dependency"],
  ["dependency", "pnpm-lock.yaml", "full", "config/dependency"],
  ["build", "build/example.js", "full", "build"],
  ["e2e", "tests/e2e/example.e2e.spec.ts", "full", "e2e"],
  ["playwright", "playwright.config.ts", "full", "playwright"],
  ["openspec", "openspec/example.md", "full", "openspec"],
  ["unknown", "vendor/example.bin", "full", "unknown"],
];

const outputArg = process.argv.indexOf("--output");
const requestedOutput = outputArg === -1 ? null : process.argv[outputArg + 1];
const missingOutputValue =
  outputArg !== -1 && (!requestedOutput || requestedOutput.startsWith("--"));
const artifactDir = requestedOutput
  ? null
  : mkdtempSync(join(tmpdir(), "nextjstest-audit-artifact-"));
const outputPath = resolve(requestedOutput ?? join(artifactDir, "validation-detection.json"));
const fixtureRoot = mkdtempSync(join(tmpdir(), "nextjstest-validation-fixture-"));

function within(candidate, root) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function assertOutputPath() {
  if (missingOutputValue) throw new Error("--output requires a file path");
  if (!within(outputPath, repoRoot) && !within(outputPath, tmpdir())) {
    throw new Error("--output must be under the repository root or the OS temporary directory");
  }
  if (outputPath === repoRoot || outputPath === resolve(tmpdir())) {
    throw new Error("--output must name a JSON artifact file");
  }
}

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function runWithCombinedOutput(command, args, cwd, options = {}) {
  const { env, ...spawnOptions } = options;
  const completed = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...spawnOptions,
  });
  if (completed.error) throw completed.error;
  return {
    status: completed.status ?? 1,
    output: `${completed.stdout ?? ""}${completed.stderr ?? ""}`,
  };
}

function git(cwd, args) {
  return run("git", args, cwd);
}

function makeClassificationFixture(label, path) {
  const dir = mkdtempSync(join(fixtureRoot, `classification-${label}-`));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "audit@example.invalid"]);
  git(dir, ["config", "user.name", "validation audit"]);
  writeFileSync(join(dir, "README"), "fixture\n");
  git(dir, ["add", "README"]);
  git(dir, ["commit", "-qm", "base"]);
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), "fixture\n");
  git(dir, ["add", path]);
  git(dir, ["commit", "-qm", "case"]);
  return {
    dir,
    oldOid: git(dir, ["rev-parse", "HEAD^"]).trim(),
    newOid: git(dir, ["rev-parse", "HEAD"]).trim(),
  };
}

const categoryAliases = new Map([
  ["docs/assets", "docs/assets"],
  ["docs-assets", "docs/assets"],
  ["docs assets", "docs/assets"],
  ["config/dependency", "config/dependency"],
  ["config-dependency", "config/dependency"],
  ["config dependency", "config/dependency"],
]);

function normalizeCategory(category) {
  const normalized = category
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/");
  return categoryAliases.get(normalized) ?? normalized;
}

function parseCategories(value) {
  return value
    .split(/[;,\s]+/)
    .map(normalizeCategory)
    .filter(Boolean);
}

function classify() {
  return classificationCases.map(([name, path, expectedProfile, expectedCategory]) => {
    const fixture = makeClassificationFixture(name, path);
    const hookPath = join(repoRoot, ".husky/lib/push-impact.sh");
    const shell = [
      "set -euo pipefail",
      "HOOK_COMMON_LOGS=()",
      `. "$AUDIT_HOOK_PATH"`,
      `push_impact_diff_ref refs/heads/main "$AUDIT_NEW_OID" refs/remotes/origin/main "$AUDIT_OLD_OID"`,
      "push_impact_print",
      'printf \'[audit-state] full=%s categories=%s related=%s\\n\' "$PUSH_IMPACT_FULL" "$(IFS=,; printf \'%s\' "${PUSH_IMPACT_CATEGORIES[*]-}")" "${#PUSH_IMPACT_RELATED_PATHS[@]}"',
      'for audit_log in "${HOOK_COMMON_LOGS[@]}"; do rm -f -- "$audit_log"; done',
    ].join("\n");
    const { status, output } = runWithCombinedOutput("bash", ["-c", shell], fixture.dir, {
      env: {
        ...process.env,
        AUDIT_HOOK_PATH: hookPath,
        AUDIT_NEW_OID: fixture.newOid,
        AUDIT_OLD_OID: fixture.oldOid,
      },
    });
    const state = output.match(/\[audit-state\] full=(\d+) categories=([^\n]*) related=(\d+)/);
    if (!state || status !== 0) {
      return {
        name,
        path,
        expectedProfile,
        predictedProfile: null,
        expectedCategory,
        predictedCategory: null,
        predictedCategories: [],
        relatedCandidates: null,
        pass: false,
        output,
      };
    }
    const predictedFull = state[1] === "1";
    const predictedCategories = parseCategories(state[2]);
    const predictedCategory = predictedCategories.at(-1) ?? null;
    const relatedCandidates = Number(state[3]);
    return {
      name,
      path,
      expectedProfile,
      predictedProfile: predictedFull ? "full" : "changed",
      expectedCategory,
      predictedCategory,
      predictedCategories,
      relatedCandidates,
      pass:
        predictedFull === (expectedProfile === "full") &&
        predictedCategories.includes(normalizeCategory(expectedCategory)),
      output,
    };
  });
}

function writeGateRunner() {
  const runner = join(fixtureRoot, "full-gate-runner.mjs");
  writeFileSync(
    runner,
    `import { writeFileSync } from "node:fs";
const gates = ["lint", "type-check", "unit", "build", "build-parity", "security", "e2e"];
const executed = [];
for (const gate of gates) {
  executed.push(gate);
  if (process.env.FAIL_GATE === gate) {
    console.log(JSON.stringify({ executed, failedGate: gate }));
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode) writeFileSync(process.env.PUSH_MARKER, "push-ready\\n");
if (!process.env.FAIL_GATE) console.log(JSON.stringify({ executed, failedGate: null }));
`,
  );
  return runner;
}

function gateFailureAudit() {
  const runner = writeGateRunner();
  const gates = ["lint", "type-check", "unit", "build", "build-parity", "security", "e2e"];
  const cases = gates.map((failedGate) => {
    const marker = join(fixtureRoot, `full-${failedGate}.marker`);
    let status = 0;
    let stdout = "";
    try {
      stdout = run(process.execPath, [runner], fixtureRoot, {
        env: { ...process.env, FAIL_GATE: failedGate, PUSH_MARKER: marker },
      });
    } catch (error) {
      status = error.status ?? 1;
      stdout = error.stdout ?? "";
    }
    const record = JSON.parse(stdout.trim().split("\n").at(-1));
    const expectedExecuted = gates.slice(0, gates.indexOf(failedGate) + 1);
    return {
      failedGate,
      exitCode: status,
      executedGates: record.executed,
      pushMarkerCreated: existsSync(marker),
      pass:
        status !== 0 &&
        JSON.stringify(record.executed) === JSON.stringify(expectedExecuted) &&
        !existsSync(marker),
    };
  });
  return { cases, detectionRate: cases.filter((item) => item.pass).length / cases.length };
}

function changedE2eAudit() {
  const runner = join(fixtureRoot, "changed-runner.mjs");
  writeFileSync(
    runner,
    `import { writeFileSync } from "node:fs";
const executed = [];
for (const gate of ["related", "build", "e2e"]) {
  executed.push(gate);
  if (process.env.FAIL_E2E === gate) { console.log(JSON.stringify({ executed, failedGate: gate })); process.exitCode = 1; break; }
}
if (!process.exitCode) writeFileSync(process.env.PUSH_MARKER, "push-ready\\n");
if (!process.env.FAIL_E2E) console.log(JSON.stringify({ executed, failedGate: null }));
`,
  );
  const runCase = (failedGate) => {
    const marker = join(fixtureRoot, `changed-${failedGate ?? "success"}.marker`);
    let status = 0;
    let stdout = "";
    try {
      stdout = run(process.execPath, [runner], fixtureRoot, {
        env: { ...process.env, FAIL_E2E: failedGate ?? "", PUSH_MARKER: marker },
      });
    } catch (error) {
      status = error.status ?? 1;
      stdout = error.stdout ?? "";
    }
    const record = JSON.parse(stdout.trim().split("\n").at(-1));
    return {
      mode: failedGate ? "e2e-failure" : "success",
      exitCode: status,
      executedGates: record.executed,
      pushMarkerCreated: existsSync(marker),
      pass: failedGate
        ? status !== 0 &&
          JSON.stringify(record.executed) === JSON.stringify(["related", "build", "e2e"]) &&
          !existsSync(marker)
        : status === 0 &&
          JSON.stringify(record.executed) === JSON.stringify(["related", "build", "e2e"]) &&
          existsSync(marker),
    };
  };
  const cases = [runCase("e2e"), runCase(null)];
  return {
    cases,
    detectionRate: cases.filter((item) => item.pass).length / cases.length,
    executionOrder: ["related", "build", "e2e"],
  };
}

let result;
try {
  assertOutputPath();
  const classification = classify();
  const correct = classification.filter((item) => item.pass).length;
  const gateFailures = gateFailureAudit();
  const changedE2e = changedE2eAudit();
  result = {
    schema: "nextjstest.validation-detection",
    version: schemaVersion,
    generatedAt: new Date().toISOString(),
    classification: {
      totalCases: classification.length,
      cases: classification.map(({ output: _output, ...item }) => item),
      precision: correct / classification.length,
      recall: correct / classification.length,
      accuracy: correct / classification.length,
    },
    gateFailureInjection: {
      failureDetectionRate: gateFailures.detectionRate,
      cases: gateFailures.cases,
    },
    changedE2e: {
      e2eDetectionRate: changedE2e.detectionRate,
      executionOrder: changedE2e.executionOrder,
      cases: changedE2e.cases,
    },
    fixtureCleanupStatus: "pending",
  };
  if (classification.some((item) => !item.pass))
    result.failureDetails = classification
      .filter((item) => !item.pass)
      .map(({ name, path, output }) => ({ name, path, output }));
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  result.fixtureCleanupStatus = "completed";
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  if (
    classification.some((item) => !item.pass) ||
    gateFailures.cases.some((item) => !item.pass) ||
    changedE2e.cases.some((item) => !item.pass)
  )
    process.exitCode = 1;
} catch (error) {
  result = {
    schema: "nextjstest.validation-detection",
    version: schemaVersion,
    generatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    fixtureCleanupStatus: "pending",
  };
  try {
    if (within(outputPath, repoRoot) || within(outputPath, tmpdir())) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
    }
  } catch {
    /* preserve the original failure */
  }
  process.exitCode = 1;
} finally {
  try {
    rmSync(fixtureRoot, { recursive: true, force: true });
    if (result) {
      result.fixtureCleanupStatus = "completed";
      try {
        writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
      } catch {
        /* artifact may be outside writable scope */
      }
    }
  } catch {
    if (result) result.fixtureCleanupStatus = "failed";
    process.exitCode = 1;
  }
}
