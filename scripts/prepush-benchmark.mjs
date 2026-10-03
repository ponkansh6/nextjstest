#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform, release, totalmem, availableParallelism, cpus, freemem } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultRuns = 3;
const zeros = "0000000000000000000000000000000000000000";
const hookRelativePath = ".husky/pre-push.bash";
const hookSmokeFiles = [
  ".husky/pre-push.bash",
  ".husky/lib/hook-common.sh",
  ".husky/lib/push-impact.sh",
  ".husky/lib/prepush-profile.sh",
  ".husky/check-clean-worktree.sh",
  ".husky/check-detached-leftover.sh",
];

const preflightGates = ["clean worktree check", "detached HEAD leftover check"];

const retainableBrowserGates = new Set([
  "test:browser:prepush:component",
  "test:browser:next-route-poc:prepush:built",
]);

const sensitiveArtifactName =
  /(?:auth|credential|secret|token|password|passwd|cookie|session|private|key|cert|\.env|\.npmrc)/i;

export function failedRetainableBrowserGates(gateRecords) {
  return gateRecords
    .filter((record) => record.exitCode !== 0 && retainableBrowserGates.has(record.gate))
    .map((record) => record.gate);
}

export function isSafeBrowserScreenshotPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized.startsWith("tests/browser-mode/__screenshots__/")) return false;
  const parts = normalized.split("/");
  return (
    parts.every((part) => part !== ".." && !sensitiveArtifactName.test(part)) &&
    /\.png$/i.test(parts.at(-1) ?? "")
  );
}

export function sanitizeVitestBrowserReport(report, selectedName) {
  const assertions = Array.isArray(report?.testResults)
    ? report.testResults.flatMap((file) =>
        Array.isArray(file?.assertionResults) ? file.assertionResults : [],
      )
    : [];
  const selected = assertions.filter((assertion) => assertion?.fullName === selectedName);
  const status =
    selected.length === 1 && ["passed", "failed", "pending", "skipped"].includes(selected[0].status)
      ? selected[0].status
      : "unavailable";
  return {
    schemaVersion: "prepush-browser-report-v1",
    selectedTest: selectedName,
    status,
    selectedTestCount: selected.length,
    totalTestResults: Number.isInteger(report?.numTotalTests)
      ? report.numTotalTests
      : assertions.length,
    passedTestResults: Number.isInteger(report?.numPassedTests)
      ? report.numPassedTests
      : assertions.filter((item) => item.status === "passed").length,
    failedTestResults: Number.isInteger(report?.numFailedTests)
      ? report.numFailedTests
      : assertions.filter((item) => item.status === "failed").length,
  };
}

const gateSequences = {
  changed: [
    "changed integration tests",
    "test:browser:prepush:component",
    "build",
    "test:browser:next-route-poc:prepush:built",
  ],
  docs: ["test:browser:prepush:component", "build", "test:browser:next-route-poc:prepush:built"],
  full: [
    "lint:fast",
    "type-check",
    "test:coverage",
    "test:browser:component:all",
    "build",
    "test:browser:next-route-poc:built:all",
    "test:build-parity",
    "security-check",
  ],
  "full-prepush-browser": [
    "lint:fast",
    "type-check",
    "test:coverage",
    "test:browser:prepush:component",
    "build",
    "test:browser:next-route-poc:prepush:built",
    "test:build-parity",
    "security-check",
  ],
};

const scenarios = {
  "source-test": {
    profile: "changed",
    setup(root) {
      writeFixtureFile(
        root,
        "src/prepush-benchmark/value.ts",
        "export const benchmarkValue = 1;\n",
      );
      writeFixtureFile(
        root,
        "tests/unit/prepush-benchmark.test.ts",
        "import { describe, expect, it } from 'vitest';\nimport { benchmarkValue } from '../../src/prepush-benchmark/value';\ndescribe('pre-push benchmark fixture', () => { it('loads related code', () => { expect(benchmarkValue).toBe(1); }); });\n",
      );
      return { paths: ["src/prepush-benchmark/value.ts", "tests/unit/prepush-benchmark.test.ts"] };
    },
  },
  "source-no-test": {
    profile: "changed",
    setup(root) {
      writeFixtureFile(root, "src/prepush-benchmark/orphan.ts", "export const orphan = true;\n");
      return { paths: ["src/prepush-benchmark/orphan.ts"] };
    },
  },
  config: {
    profile: "auto",
    setup(root) {
      writeFixtureFile(
        root,
        ".github/prepush-benchmark.yml",
        "name: isolated pre-push benchmark\n",
      );
      return { paths: [".github/prepush-benchmark.yml"] };
    },
  },
  openspec: {
    profile: "auto",
    setup(root) {
      writeFixtureFile(
        root,
        "openspec/prepush-benchmark.md",
        "# Isolated pre-push benchmark fixture\n",
      );
      return { paths: ["openspec/prepush-benchmark.md"] };
    },
  },
  "docs-only": {
    profile: "changed",
    setup(root) {
      writeFixtureFile(root, "README.md", "pre-push benchmark documentation fixture\n");
      return { paths: ["README.md"] };
    },
  },
  unknown: {
    profile: "auto",
    setup(root) {
      writeFixtureFile(root, "benchmark-fixture/unclassified.dat", "unknown path\n");
      return { paths: ["benchmark-fixture/unclassified.dat"] };
    },
  },
  "delete-path": {
    profile: "auto",
    setup(root) {
      rmSync(join(root, "README.md"), { force: true });
      return { paths: ["README.md"] };
    },
  },
  "empty-diff": {
    profile: "auto",
    setup() {
      return { paths: [], emptyCommit: true };
    },
  },
  "new-ref": {
    profile: "auto",
    setup(root) {
      writeFixtureFile(root, "README.md", "new ref fixture\n");
      return { paths: ["README.md"], zeroRemoteOid: true };
    },
  },
  "remote-deletion": {
    profile: "auto",
    setup() {
      return { paths: [], zeroLocalOid: true };
    },
  },
  "explicit-full": {
    profile: "full",
    setup(root) {
      writeFixtureFile(root, "README.md", "explicit full profile fixture\n");
      return { paths: ["README.md"], explicitProfile: true };
    },
  },
  "multi-ref-changed": {
    profile: "changed",
    setup(root) {
      writeFixtureFile(root, "README.md", "multi-ref changed fixture\n");
      writeFixtureFile(root, "docs/prepush-benchmark.md", "docs input\n");
      return { paths: ["README.md", "docs/prepush-benchmark.md"], multiRef: true };
    },
  },
  "multi-ref-full": {
    profile: "auto",
    setup(root) {
      writeFixtureFile(root, "README.md", "multi-ref full fixture\n");
      writeFixtureFile(root, ".github/prepush-benchmark.yml", "name: full fallback\n");
      return { paths: ["README.md", ".github/prepush-benchmark.yml"], multiRef: true };
    },
  },
  shallow: {
    profile: "auto",
    setup(root) {
      writeFixtureFile(root, "README.md", "shallow fixture\n");
      return { paths: ["README.md"], markShallow: true };
    },
  },
  malformed: {
    profile: "auto",
    setup(root) {
      writeFixtureFile(root, "README.md", "malformed protocol fixture\n");
      return { paths: ["README.md"], malformed: true };
    },
  },
  unresolvable: {
    profile: "auto",
    setup(root) {
      writeFixtureFile(root, "README.md", "unresolvable ref fixture\n");
      return { paths: ["README.md"], unresolvableRemote: true };
    },
  },
};

const expectedEffectiveProfile = {
  "source-test": "changed",
  "source-no-test": "full",
  config: "full",
  openspec: "full",
  "docs-only": "changed",
  unknown: "full",
  "delete-path": "full",
  "empty-diff": "full",
  "new-ref": "full",
  "remote-deletion": "full",
  "explicit-full": "full",
  "multi-ref-changed": "changed",
  "multi-ref-full": "full",
  shallow: "full",
  malformed: "full",
  unresolvable: "full",
};

const failureFallbackScenarios = new Set([
  "source-no-test",
  "config",
  "openspec",
  "unknown",
  "delete-path",
  "empty-diff",
  "new-ref",
  "remote-deletion",
  "multi-ref-full",
  "shallow",
  "malformed",
  "unresolvable",
]);

function expectedRun(scenarioName, requestedProfile) {
  const scenario = scenarios[scenarioName];
  if (scenario.unsupported) return { supported: false, reason: scenario.unsupported };
  if (scenarioName === "explicit-full" && requestedProfile !== "full") {
    return {
      supported: false,
      reason: "explicit-full only measures the explicit full-profile request",
    };
  }
  const expectedProfile =
    requestedProfile === "full"
      ? "full"
      : requestedProfile === "auto"
        ? expectedEffectiveProfile[scenarioName]
        : expectedEffectiveProfile[scenarioName] === "full"
          ? "full"
          : "changed";
  const fullBrowserMode = expectedProfile === "full" && requestedProfile !== "full";
  const businessGates =
    expectedProfile === "changed"
      ? scenarioName === "docs-only"
        ? gateSequences.docs
        : gateSequences.changed
      : fullBrowserMode
        ? gateSequences["full-prepush-browser"]
        : gateSequences.full;
  const gates = [...preflightGates, ...businessGates];
  // Current hooks have no intentional injected failure. Conservative fallback
  // scenarios still expect successful completion when all validation gates pass.
  const expectedExitCode = 0;
  return {
    supported: true,
    expectedProfile,
    expectedExitCode,
    requiredGates: gates,
    requiredBusinessGates: businessGates,
    failureFallback: failureFallbackScenarios.has(scenarioName),
    failureDetectionStart: null,
    failureDetectionEnd: null,
  };
}

function parseArgs(argv) {
  const options = {
    runs: defaultRuns,
    cacheStates: [],
    profiles: [],
    scenarioNames: [],
    outputDir: null,
    timeoutMs: 900_000,
    installMode: "offline",
  };
  if (argv.length === 0) return { ...options, help: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === "--runs") options.runs = Number.parseInt(next(), 10);
    else if (arg === "--cache-states") options.cacheStates = next().split(",");
    else if (arg === "--profiles") options.profiles = next().split(",");
    else if (arg === "--scenarios") {
      const value = next().split(",");
      options.scenarioNames =
        value.length === 1 && value[0] === "all" ? Object.keys(scenarios) : value;
    } else if (arg === "--output-dir") options.outputDir = resolve(next());
    else if (arg === "--timeout-ms") options.timeoutMs = Number.parseInt(next(), 10);
    else if (arg === "--install-mode") options.installMode = next();
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.runs) || options.runs < 1)
    throw new Error("--runs must be a positive integer");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)
    throw new Error("--timeout-ms must be a positive integer");
  if (!new Set(["offline", "online"]).has(options.installMode))
    throw new Error("--install-mode must be offline or online");
  for (const state of options.cacheStates) {
    if (!new Set(["next-cold", "next-warm"]).has(state))
      throw new Error(`unsupported cache state: ${state}`);
  }
  for (const profile of options.profiles) {
    if (!new Set(["auto", "changed", "full"]).has(profile))
      throw new Error(`unsupported profile: ${profile}`);
  }
  for (const name of options.scenarioNames) {
    if (!scenarios[name]) throw new Error(`unknown scenario: ${name}`);
  }
  for (const values of [options.cacheStates, options.profiles, options.scenarioNames]) {
    if (new Set(values).size !== values.length)
      throw new Error("selection values must not contain duplicates");
  }
  if (
    !options.help &&
    !options.dryRun &&
    (!options.scenarioNames.length || !options.profiles.length || !options.cacheStates.length)
  ) {
    throw new Error(
      "choose scenario(s), profile(s), and cache state(s) explicitly; the runner has no broad default workload",
    );
  }
  for (const scenarioName of options.scenarioNames) {
    for (const profile of options.profiles) {
      const expected = expectedRun(scenarioName, profile);
      if (!expected.supported)
        throw new Error(
          `unsupported scenario/profile combination ${scenarioName}/${profile}: ${expected.reason}`,
        );
    }
  }
  return options;
}

function runFile(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: childEnvironment(options.env ?? process.env),
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`required ${basename(command)} operation exited ${result.status}`);
  }
  return result.stdout ?? "";
}

function git(cwd, args, options = {}) {
  return runFile("git", args, { ...options, cwd }).trim();
}

function copyTrackedTree(destination) {
  const fileList = runFile("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: repoRoot,
    encoding: "buffer",
  });
  const paths = fileList.split("\0").filter(Boolean);
  const excludedFixturePaths = [];
  for (const relativePath of paths) {
    const parts = relativePath.split("/");
    if (
      parts.some((part) =>
        [
          ".git",
          "node_modules",
          ".next",
          "coverage",
          "test-results",
          "playwright-report",
          "__traces__",
          "__screenshots__",
        ].includes(part),
      )
    )
      continue;
    if (
      parts.some(
        (part) =>
          /^\.env/i.test(part) ||
          /^(?:\.npmrc|\.netrc|\.pypirc|credentials(?:\.json)?|id_(?:rsa|ed25519)|known_hosts)$/i.test(
            part,
          ) ||
          /(?:credential|secret|token|private.?key)/i.test(part) ||
          /\.(?:pem|key|p12|pfx)$/i.test(part),
      )
    ) {
      excludedFixturePaths.push(relativePath);
      continue;
    }
    const source = join(repoRoot, relativePath);
    if (!existsSync(source)) continue;
    const target = join(destination, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    const info = lstatSync(source);
    // A symlink could escape the fixture and expose or modify source files.
    // Omit it from the fixture rather than reproducing its target.
    if (info.isSymbolicLink()) {
      excludedFixturePaths.push(`${relativePath} (symlink omitted)`);
    } else if (info.isDirectory()) mkdirSync(target, { recursive: true });
    else copyFileSync(source, target);
  }
  for (const relativePath of hookSmokeFiles) {
    if (!existsSync(join(destination, relativePath)))
      throw new Error(`fixture missing hook input: ${relativePath}`);
  }
  return excludedFixturePaths;
}

function copyBrowserArtifactTree(sourceRoot, destinationRoot, relativePath) {
  const source = join(sourceRoot, relativePath);
  if (!existsSync(source)) return [];
  const copied = [];
  const visit = (current, currentRelativePath) => {
    const info = lstatSync(current);
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      for (const entry of readdirSync(current))
        visit(join(current, entry), join(currentRelativePath, entry));
      return;
    }
    if (!info.isFile() || !isSafeBrowserScreenshotPath(currentRelativePath)) return;
    const target = join(destinationRoot, currentRelativePath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(current, target);
    copied.push(currentRelativePath);
  };
  visit(source, relativePath);
  return copied;
}

function listRegularFiles(root, relativePath = "") {
  if (!existsSync(root)) return [];
  const target = relativePath ? join(root, relativePath) : root;
  const info = lstatSync(target);
  if (info.isSymbolicLink()) return [];
  if (info.isFile()) return [relativePath];
  if (!info.isDirectory()) return [];
  return readdirSync(target).flatMap((entry) => listRegularFiles(root, join(relativePath, entry)));
}

function writeFixtureFile(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function setupGitFixture(root, scenarioName) {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "pre-push benchmark fixture"]);
  git(root, ["config", "user.email", "prepush-benchmark@example.invalid"]);
  git(root, ["add", "-A"]);
  const baseTree = git(root, ["write-tree"]);
  const baseOid = git(root, ["commit-tree", baseTree, "-m", "benchmark base"]);
  git(root, ["update-ref", "refs/heads/main", baseOid]);
  git(root, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(root, ["update-ref", "refs/remotes/origin/main", baseOid]);
  const setup = scenarios[scenarioName].setup(root);
  if (!setup.emptyCommit) git(root, ["add", "-A"]);
  const candidateTree = git(root, ["write-tree"]);
  const candidateOid = git(root, [
    "commit-tree",
    candidateTree,
    "-p",
    baseOid,
    "-m",
    `benchmark ${scenarioName}`,
  ]);
  git(root, ["update-ref", "refs/heads/prepush-benchmark", candidateOid]);
  git(root, ["symbolic-ref", "HEAD", "refs/heads/prepush-benchmark"]);
  if (setup.multiRef) git(root, ["update-ref", "refs/remotes/origin/secondary", baseOid]);
  if (setup.markShallow) writeFileSync(join(root, ".git", "shallow"), `${baseOid}\n`);
  return { ...setup, baseOid, candidateOid };
}

function protocolFor(setup) {
  if (setup.malformed)
    return `refs/heads/prepush-benchmark ${setup.candidateOid} refs/remotes/origin/main ${setup.baseOid} extra\n`;
  if (setup.zeroLocalOid)
    return `refs/heads/prepush-benchmark ${zeros} refs/remotes/origin/main ${setup.baseOid}\n`;
  if (setup.zeroRemoteOid)
    return `refs/heads/prepush-benchmark ${setup.candidateOid} refs/remotes/origin/main ${zeros}\n`;
  if (setup.unresolvableRemote)
    return `refs/heads/prepush-benchmark ${setup.candidateOid} refs/remotes/origin/main dddddddddddddddddddddddddddddddddddddddd\n`;
  if (setup.multiRef) {
    return (
      [
        `refs/heads/prepush-benchmark ${setup.candidateOid} refs/remotes/origin/main ${setup.baseOid}`,
        `refs/heads/prepush-benchmark ${setup.candidateOid} refs/remotes/origin/secondary ${setup.baseOid}`,
      ].join("\n") + "\n"
    );
  }
  return `refs/heads/prepush-benchmark ${setup.candidateOid} refs/remotes/origin/main ${setup.baseOid}\n`;
}

function hashFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function browserMetadata() {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(
      homedir(),
      platform() === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright",
    );
  let browserDirectories = [];
  try {
    browserDirectories = readdirSync(browsersPath).filter((name) =>
      /^(chromium|webkit|firefox|ffmpeg)-/.test(name),
    );
  } catch {
    // A missing browser cache is useful environment metadata, not a runner error.
  }
  return {
    playwrightPackageVersions: {
      "@playwright/test":
        packageJson.devDependencies?.["@playwright/test"] ??
        packageJson.dependencies?.["@playwright/test"] ??
        null,
      "@vitest/browser-playwright":
        packageJson.devDependencies?.["@vitest/browser-playwright"] ?? null,
      vitest: packageJson.devDependencies?.vitest ?? packageJson.dependencies?.vitest ?? null,
    },
    browsersPath,
    browserDirectories,
    browserCacheState: browserDirectories.length > 0 ? "present" : "missing-or-empty",
  };
}

function environmentSnapshot() {
  const cpu = cpus()[0];
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const pnpmVersion = spawnSync("pnpm", ["--version"], {
    cwd: repoRoot,
    env: childEnvironment(),
    encoding: "utf8",
  });
  return {
    capturedAt: new Date().toISOString(),
    os: { platform: platform(), release: release(), arch: process.arch },
    cpu: {
      model: cpu?.model ?? null,
      logicalCores: cpus().length,
      availableParallelism: availableParallelism(),
    },
    memory: { totalBytes: totalmem(), freeBytesAtCapture: freemem() },
    nodeVersion: process.version,
    pnpmVersion: pnpmVersion.status === 0 ? pnpmVersion.stdout.trim() : null,
    packageManager: packageJson.packageManager ?? null,
    lockfile: { path: "pnpm-lock.yaml", sha256: hashFile(join(repoRoot, "pnpm-lock.yaml")) },
    browser: browserMetadata(),
    cacheControl: {
      osPageCache: "uncontrolled; this runner does not flush or drop the operating-system cache",
      dependencyStore:
        "reused from configured pnpm store; fixture node_modules is installed separately",
      browserCache: "existing Playwright browser cache is read in place and is not cleared",
    },
  };
}

function safePnpmConfig() {
  const allowedValues = {
    "engine-strict": new Set(["true", "false"]),
    "package-lock": new Set(["true", "false"]),
    "node-linker": new Set(["isolated", "hoisted", "pnp"]),
  };
  const sourcePath = join(repoRoot, ".npmrc");
  if (!existsSync(sourcePath)) return "";
  if (!lstatSync(sourcePath).isFile()) return "";
  const safeLines = [];
  for (const sourceLine of readFileSync(sourcePath, "utf8").split(/\r?\n/)) {
    const match = sourceLine.match(/^\s*([a-z-]+)\s*=\s*([^\s#;]+)\s*(?:[#;].*)?$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].toLowerCase();
    if (allowedValues[key]?.has(value)) safeLines.push(`${key}=${value}`);
  }
  return safeLines.length ? `${safeLines.join("\n")}\n` : "";
}

function classifyPnpmFailure(output) {
  const code = output.match(/\b((?:ERR_)?PNPM_[A-Z0-9_]+)\b/)?.[1] ?? null;
  const lower = output.toLowerCase();
  const classification = /offline|not in the store|no network connection/.test(lower)
    ? "offline-store-miss"
    : /e401|e403|unauthorized|forbidden|auth/.test(lower)
      ? "authentication-or-permission"
      : /enotfound|econn|etimedout|network|fetch failed/.test(lower)
        ? "network"
        : "other";
  return { code, classification, outputSha256: createHash("sha256").update(output).digest("hex") };
}

function installFixture(root, installMode) {
  mkdirSync(join(root, "node_modules"), { recursive: true });
  const safeConfig = safePnpmConfig();
  if (safeConfig) writeFileSync(join(root, ".npmrc"), safeConfig);
  const env = childEnvironment();
  const args = [
    "install",
    ...(installMode === "offline" ? ["--offline"] : []),
    "--frozen-lockfile",
    "--ignore-scripts",
  ];
  if (installMode === "online") {
    const installHome = join(root, ".benchmark-home");
    const installXdg = join(root, ".benchmark-xdg");
    const userConfig = join(root, ".benchmark-user.npmrc");
    const globalConfig = join(root, ".benchmark-global.npmrc");
    mkdirSync(installHome, { recursive: true });
    mkdirSync(installXdg, { recursive: true });
    writeFileSync(userConfig, "");
    writeFileSync(globalConfig, "");
    for (const key of Object.keys(env)) {
      if (/(?:proxy|registry)/i.test(key)) delete env[key];
    }
    Object.assign(env, {
      HOME: installHome,
      XDG_CONFIG_HOME: installXdg,
      NPM_CONFIG_USERCONFIG: userConfig,
      NPM_CONFIG_GLOBALCONFIG: globalConfig,
    });
    args.push(
      "--registry=https://registry.npmjs.org/",
      `--store-dir=${join(root, ".benchmark-pnpm-store")}`,
    );
  }
  const result = spawnSync("pnpm", args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const diagnostic = classifyPnpmFailure(output);
    throw Object.assign(
      new Error(`isolated ${installMode} pnpm install failed (${result.status ?? "unavailable"})`),
      {
        installDiagnostic: { exitCode: result.status ?? null, ...diagnostic },
      },
    );
  }
}

function childEnvironment(source = process.env) {
  const blocked =
    /(API_KEY|ACCESS_KEY|TOKEN|PASSWORD|PASSWD|SECRET|CREDENTIAL|PRIVATE_KEY|AWS_|AZURE_|GITHUB_TOKEN|AUTH|COOKIE|SIGNING_KEY|CLIENT_CERT|NPM_CONFIG_)/i;
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !/^GIT_/i.test(key) && !blocked.test(key)),
  );
}

function redactOutput(source) {
  let result = source;
  for (const [key, value] of Object.entries(process.env)) {
    if (
      /(API_KEY|ACCESS_KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL|PRIVATE_KEY|AWS_|AZURE_|GITHUB_TOKEN|NPM_CONFIG_AUTH)/i.test(
        key,
      ) &&
      value &&
      value.length >= 4
    ) {
      result = result.split(value).join("[REDACTED]");
    }
  }
  return result;
}

function directorySnapshot(target) {
  try {
    lstatSync(target);
  } catch {
    return { exists: false };
  }
  const entries = [];
  const visit = (current) => {
    const info = lstatSync(current);
    const relativePath = relative(target, current);
    entries.push({
      path: relativePath,
      kind: info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : "file",
      size: info.size,
      mtimeMs: info.mtimeMs,
      link: info.isSymbolicLink() ? readlinkSync(current) : undefined,
    });
    if (info.isDirectory()) {
      for (const name of readdirSync(current).sort()) visit(join(current, name));
    }
  };
  visit(target);
  return { exists: true, entries };
}

function sourceSafetySnapshot() {
  const status = runFile("git", ["status", "--porcelain=v1", "--untracked-files=all", "-z"], {
    cwd: repoRoot,
  });
  const indexPath = resolve(repoRoot, git(repoRoot, ["rev-parse", "--git-path", "index"]));
  const configPath = resolve(repoRoot, git(repoRoot, ["rev-parse", "--git-path", "config"]));
  return {
    gitStatusSha256: createHash("sha256").update(status).digest("hex"),
    gitIndexSha256: existsSync(indexPath) ? hashFile(indexPath) : null,
    gitConfigSha256: existsSync(configPath) ? hashFile(configPath) : null,
    nextDirectory: directorySnapshot(join(repoRoot, ".next")),
  };
}

function captureSourceSafetySnapshot() {
  try {
    return { snapshot: sourceSafetySnapshot(), error: null };
  } catch (error) {
    return { snapshot: null, error: error.message };
  }
}

export function parseTimeOutput(filePath) {
  if (!existsSync(filePath))
    return {
      userCpuSeconds: null,
      systemCpuSeconds: null,
      peakRssKb: null,
      resourceMetricsAvailable: false,
    };
  const source = readFileSync(filePath, "utf8");
  const field = (key, legacyName) => {
    const keyed = source.match(new RegExp(`^${key}=([0-9]+(?:\\.[0-9]+)?)$`, "m"))?.[1];
    if (keyed !== undefined) return keyed;
    if (!legacyName) return null;
    const line = source
      .split(/\r?\n/)
      .find((entry) => entry.trimStart().startsWith(`${legacyName}:`));
    return line?.match(/:\s+([0-9]+(?:\.[0-9]+)?)/)?.[1] ?? null;
  };
  const user = field("USER_SECONDS", "User time (seconds)");
  const system = field("SYSTEM_SECONDS", "System time (seconds)");
  const peakRss = field("MAX_RSS_KB", "Maximum resident set size (kbytes)");
  const resourceMetricsAvailable = user !== null && system !== null && peakRss !== null;
  return {
    userCpuSeconds: user === null ? null : Number(user),
    systemCpuSeconds: system === null ? null : Number(system),
    peakRssKb: peakRss === null ? null : Number(peakRss),
    resourceMetricsAvailable,
  };
}

function runHook({
  root,
  setup,
  outputDir,
  id,
  scenarioName,
  profile,
  cacheState,
  timeoutMs,
  warmup,
}) {
  const hookTimingFile = join(outputDir, `${id}.hook.tsv`);
  const timeFile = join(outputDir, `${id}.time.txt`);
  const stdoutFile = join(outputDir, `${id}.stdout.log`);
  const stderrFile = join(outputDir, `${id}.stderr.log`);
  const browserArtifactDirectory = join(outputDir, `${id}.browser-artifacts`);
  rmSync(join(root, "tests/browser-mode/__traces__"), { recursive: true, force: true });
  rmSync(join(root, "tests/browser-mode/__screenshots__"), { recursive: true, force: true });
  const timeCommand = existsSync("/usr/bin/time") ? "/usr/bin/time" : null;
  const timeFormat =
    "USER_SECONDS=%U\\nSYSTEM_SECONDS=%S\\nELAPSED_SECONDS=%e\\nMAX_RSS_KB=%M\\nEXIT_STATUS=%x";
  const command = timeCommand
    ? ["-f", timeFormat, "-o", timeFile, "bash", hookRelativePath]
    : ["bash", hookRelativePath];
  const env = {
    ...childEnvironment(),
    LC_ALL: "C",
    PREPUSH_PROFILE: setup.explicitProfile ? "full" : profile === "auto" ? "changed" : profile,
    PREPUSH_SCENARIO: scenarioName,
    PREPUSH_TIMING_FILE: hookTimingFile,
    PREPUSH_TIMING_SCENARIO: scenarioName,
    PREPUSH_CACHE_CONDITION: cacheState,
    PREPUSH_BENCHMARK_ARTIFACT_DIR: browserArtifactDirectory,
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH || browserMetadata().browsersPath,
  };
  if (profile === "auto" && !setup.explicitProfile) delete env.PREPUSH_PROFILE;
  const protocol = protocolFor(setup);
  const start = performance.now();
  let timer;
  let killTimer;
  const child = spawn(timeCommand ?? "bash", command, {
    cwd: root,
    env,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let lineRemainder = "";
  let classifiedProfile = null;
  let lastGate = null;
  const observeOutput = (chunk, stream) => {
    const text = chunk.toString("utf8");
    if (stream === "stdout") stdout += text;
    else stderr += text;
    lineRemainder += text;
    const lines = lineRemainder.split(/\r?\n/);
    lineRemainder = lines.pop() ?? "";
    for (const line of lines) {
      const profileMatch = line.match(/^\[hook\] profile: (full|)/);
      if (profileMatch) classifiedProfile = profileMatch[1] === "full" ? "full" : "changed";
      const gateMatch = line.match(/^\[hook\] gate (?:passed|failed): ([^(]+?)(?: \(exit \d+\))?$/);
      if (gateMatch) lastGate = gateMatch[1].trim();
    }
  };
  child.stdout.on("data", (chunk) => observeOutput(chunk, "stdout"));
  child.stderr.on("data", (chunk) => observeOutput(chunk, "stderr"));
  child.stdin.end(protocol);
  const killedOnTimeout = new Promise((resolveTimeout) => {
    timer = setTimeout(() => {
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {
        // The child may have exited before the timeout fired.
      }
      killTimer = setTimeout(() => {
        try {
          if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          // The process group may already be gone.
        }
      }, 5_000);
      resolveTimeout(true);
    }, timeoutMs);
  });
  return new Promise((resolveRun, rejectRun) => {
    let timedOut = false;
    killedOnTimeout.then((value) => {
      timedOut = value;
    });
    child.on("error", rejectRun);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      const elapsedMs = Math.round(performance.now() - start);
      if (lineRemainder) {
        const profileMatch = lineRemainder.match(/^\[hook\] profile: (full|)/);
        if (profileMatch) classifiedProfile = profileMatch[1] === "full" ? "full" : "changed";
        const gateMatch = lineRemainder.match(
          /^\[hook\] gate (?:passed|failed): ([^(]+?)(?: \(exit \d+\))?$/,
        );
        if (gateMatch) lastGate = gateMatch[1].trim();
      }
      writeFileSync(stdoutFile, redactOutput(stdout));
      writeFileSync(stderrFile, redactOutput(stderr));
      const codeValue = timedOut ? 124 : (code ?? 128);
      // GNU time reports the whole hook process tree, and has finished writing at close.
      const metrics = parseTimeOutput(timeFile);
      const hookTsv = existsSync(hookTimingFile) ? readFileSync(hookTimingFile, "utf8") : "";
      const hookRows = hookTsv.trim() ? hookTsv.trim().split(/\r?\n/).slice(1) : [];
      const gateRecords = hookRows
        .map((line) => line.split("\t"))
        .filter((fields) => fields[0] === "gate")
        .map((fields) => ({
          scenario: fields[1],
          effectiveProfile: fields[2],
          cacheCondition: fields[3],
          gate: fields[4],
          startedAtUtc: fields[5],
          endedAtUtc: fields[6],
          durationMs: Number(fields[7]),
          exitCode: Number(fields[8]),
        }));
      const endSnapshot = {
        nextDirectoryPresent: existsSync(join(root, ".next")),
        viteCachePresent: existsSync(join(root, "node_modules", ".vite")),
        vitestCachePresent: existsSync(join(root, "node_modules", ".vitest")),
      };
      const expectation = expectedRun(scenarioName, profile);
      const expectedProfile = expectation.expectedProfile;
      const actualGates = gateRecords.map((record) => record.gate);
      const businessGateSequenceAssertion = expectation.requiredBusinessGates.every(
        (gate, index) => {
          let observedIndex = -1;
          for (let requiredIndex = 0; requiredIndex <= index; requiredIndex += 1) {
            observedIndex = actualGates.indexOf(
              expectation.requiredBusinessGates[requiredIndex],
              observedIndex + 1,
            );
          }
          return observedIndex >= 0;
        },
      );
      const gatesHaveValidEvents = gateRecords.every(
        (record) =>
          Number.isFinite(Date.parse(record.startedAtUtc)) &&
          Number.isFinite(Date.parse(record.endedAtUtc)) &&
          Date.parse(record.endedAtUtc) >= Date.parse(record.startedAtUtc) &&
          Number.isFinite(record.durationMs) &&
          record.durationMs >= 0 &&
          Number.isFinite(record.exitCode),
      );
      const gateContextAssertion = gateRecords.every(
        (record) =>
          record.scenario === scenarioName &&
          record.effectiveProfile === expectedProfile &&
          record.cacheCondition === cacheState,
      );
      const gateSequenceAssertion =
        gatesHaveValidEvents &&
        gateContextAssertion &&
        businessGateSequenceAssertion &&
        JSON.stringify(actualGates) === JSON.stringify(expectation.requiredGates);
      const expectedFinalGate = expectation.requiredGates.at(-1);
      const failedGate = gateRecords.find((record) => record.exitCode !== 0);
      const failedBrowserGates = failedRetainableBrowserGates(gateRecords);
      const browserArtifacts = [];
      if (failedBrowserGates.length > 0) {
        copyBrowserArtifactTree(
          root,
          browserArtifactDirectory,
          "tests/browser-mode/__screenshots__",
        );
        browserArtifacts.push(...listRegularFiles(browserArtifactDirectory));
      } else rmSync(browserArtifactDirectory, { recursive: true, force: true });
      const failureDetectionStartedAt = failedGate?.startedAtUtc ?? null;
      const failureDetectionEndedAt = failedGate?.endedAtUtc ?? null;
      const failureDetectionWallTimeMs = failedGate
        ? Math.max(0, Date.parse(failedGate.endedAtUtc) - Date.parse(failedGate.startedAtUtc))
        : null;
      const successAssertion = expectation.expectedExitCode === 0 ? codeValue === 0 : null;
      const failureAssertion = expectation.expectedExitCode !== 0 ? codeValue !== 0 : null;
      resolveRun({
        id,
        scenario: scenarioName,
        requestedProfile: profile,
        cacheState,
        warmup,
        wallTimeMs: elapsedMs,
        exitCode: codeValue,
        expectedExitCode: expectation.expectedExitCode,
        exitAssertion: expectation.expectedExitCode === 0 ? successAssertion : failureAssertion,
        successAssertion,
        failureAssertion,
        signal,
        timedOut,
        classifiedProfile,
        expectedProfile,
        profileAssertion: classifiedProfile === expectedProfile,
        finalGate: lastGate,
        expectedFinalGate,
        finalGateAssertion: lastGate === expectedFinalGate,
        expectedRequiredGates: expectation.requiredGates,
        expectedRequiredBusinessGates: expectation.requiredBusinessGates,
        observedGateSequence: actualGates,
        businessGateSequenceAssertion,
        gateSequenceAssertion,
        gatesHaveValidEvents,
        gateContextAssertion,
        failureFallbackExpected: expectation.failureFallback,
        failureDetectionStartedAt,
        failureDetectionEndedAt,
        failureDetectionWallTimeMs,
        failedBrowserGates,
        browserArtifactsDirectory:
          browserArtifacts.length > 0 ? basename(browserArtifactDirectory) : null,
        browserArtifacts,
        playwrightTraceRetained: false,
        traceOmissionReason:
          "Raw Playwright traces can contain network requests, headers, cookies, response bodies, and page snapshots.",
        ...metrics,
        fixtureCacheAfter: endSnapshot,
        protocolLines: protocol.trim().split(/\r?\n/).length,
        hookTimingFile: hookTsv ? basename(hookTimingFile) : null,
        hookRecords: hookRows.length,
        stdoutFile: basename(stdoutFile),
        stderrFile: basename(stderrFile),
        timeFile: existsSync(timeFile) ? basename(timeFile) : null,
      });
    });
  });
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length === 0) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function aggregateRuns(runs) {
  const successful = runs.filter((run) => run.exitCode === 0 && !run.warmup);
  const failed = runs.filter((run) => run.exitCode !== 0 && !run.warmup);
  const times = successful.map((run) => run.wallTimeMs);
  const failureTimes = failed.map((run) => run.failureDetectionWallTimeMs).filter(Number.isFinite);
  return {
    runCount: runs.filter((run) => !run.warmup).length,
    successfulRuns: successful.length,
    failedRuns: failed.length,
    successfulWallTimeMs: { median: median(times), max: times.length ? Math.max(...times) : null },
    failureDetection: {
      start: "first TSV gate event with nonzero exit code",
      end: "that gate's recorded ended_at_utc",
      detectedFailures: failureTimes.length,
      supported: false,
      unsupportedReason:
        "no gate-failure injection scenario is defined by the existing hook contract",
      wallTimeMs: {
        median: median(failureTimes),
        max: failureTimes.length ? Math.max(...failureTimes) : null,
      },
    },
  };
}

function usage() {
  return `Usage: node scripts/prepush-benchmark.mjs --scenarios a,b --profiles auto,changed,full --cache-states next-cold,next-warm [options]\n\nScenarios: ${Object.keys(scenarios).join(", ")}\nProfiles: auto follows hook classification; changed requests changed unless safety classification forces full; full explicitly requests the full profile.\nCache states: next-cold, next-warm\nFixture dependencies install offline by default; use --install-mode online only when explicitly measuring with registry access.\nRuns per cell default to 3. With no arguments, this short help is printed and no gates run.\nUse --dry-run with a selection to print the workload matrix without installing dependencies or invoking gates.\nScenario/profile combinations that cannot represent the named scenario are rejected.\n\nThis runner directly invokes .husky/pre-push.bash with protocol stdin and never invokes git push.\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (options.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          scenarios: options.scenarioNames,
          profiles: options.profiles,
          expectations: options.scenarioNames.flatMap((scenario) =>
            options.profiles.map((profile) => ({
              scenario,
              requestedProfile: profile,
              ...expectedRun(scenario, profile),
            })),
          ),
          cacheStates: options.cacheStates,
          installMode: options.installMode,
          runsPerCell: options.runs,
          warmupRunsExcluded: true,
          workloadCells:
            options.scenarioNames.length * options.profiles.length * options.cacheStates.length,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (process.platform === "win32")
    throw new Error("the pre-push bash benchmark requires a POSIX host");
  const requestedOutputDir =
    options.outputDir ??
    mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "nextjstest-prepush-benchmark-"));
  const outputDir = existsSync(requestedOutputDir)
    ? realpathSync(requestedOutputDir)
    : join(realpathSync(dirname(requestedOutputDir)), basename(requestedOutputDir));
  const outputRelative = relative(realpathSync(repoRoot), outputDir);
  if (
    outputRelative === "" ||
    (!outputRelative.startsWith(`..${sep}`) &&
      outputRelative !== ".." &&
      !outputRelative.startsWith("/"))
  ) {
    throw new Error("--output-dir must be outside the source worktree");
  }
  mkdirSync(outputDir, { recursive: true });
  const metadata = environmentSnapshot();
  const beforeSafetyResult = captureSourceSafetySnapshot();
  const beforeSafety = beforeSafetyResult.snapshot;
  metadata.runner = {
    scenarios: options.scenarioNames,
    profiles: options.profiles,
    cacheStates: options.cacheStates,
    installMode: options.installMode,
    runsPerCell: options.runs,
    timeoutMs: options.timeoutMs,
    hookExecution:
      "direct .husky/pre-push.bash with fixture-generated protocol stdin; git push is never invoked",
  };
  metadata.cacheSemantics = {
    "next-cold":
      "A new isolated fixture per scenario/profile/cache cell; fixture .next and fixture Vite/Vitest caches are removed before each measured run. OS page cache and the pre-existing Playwright browser cache are uncontrolled.",
    "next-warm":
      "The same isolated fixture is reused for a non-recorded warm-up and the measured runs; a warm .next result is included. OS page cache and the pre-existing Playwright browser cache are uncontrolled.",
  };
  const runs = [];
  const aggregates = [];
  const fixturesRoot = mkdtempSync(join(outputDir, "fixtures-"));
  metadata.fixtureInstall = `pnpm install ${options.installMode === "offline" ? "--offline " : ""}--frozen-lockfile --ignore-scripts; node_modules is isolated per fixture; an existing pnpm store may be read`;
  metadata.fixtureInstallMode = options.installMode;
  metadata.fixtureInstallIsolation =
    options.installMode === "online"
      ? {
          registry: "https://registry.npmjs.org/",
          home: "fixture-local",
          xdgConfigHome: "fixture-local",
          userConfig: "fixture-local empty config",
          globalConfig: "fixture-local empty config",
          store: "fixture-local",
        }
      : {
          home: "inherited sanitized environment",
          registry: "pnpm default",
          store: "configured pnpm store may be read",
        };
  metadata.fixtureInstallWallTimeMs = {};
  metadata.excludedFixturePaths = {};
  metadata.fixtureInstallDiagnostics = {};
  let installingScenario = null;
  let runError = null;
  let safetyAssertions = {};
  try {
    for (const scenarioName of options.scenarioNames) {
      installingScenario = scenarioName;
      const fixtureRoot = join(fixturesRoot, scenarioName);
      mkdirSync(fixtureRoot, { recursive: true });
      metadata.excludedFixturePaths[scenarioName] = copyTrackedTree(fixtureRoot);
      const installStart = performance.now();
      try {
        installFixture(fixtureRoot, options.installMode);
      } finally {
        metadata.fixtureInstallWallTimeMs[scenarioName] = Math.round(
          performance.now() - installStart,
        );
      }
      const setup = setupGitFixture(fixtureRoot, scenarioName);
      for (const profile of options.profiles) {
        for (const cacheState of options.cacheStates) {
          const cellId = `${scenarioName}-${profile}-${cacheState}`;
          let warmupExitCode = null;
          if (cacheState === "next-warm") {
            const warmup = await runHook({
              root: fixtureRoot,
              setup,
              outputDir,
              id: `${cellId}-warmup`,
              scenarioName,
              profile,
              cacheState,
              timeoutMs: options.timeoutMs,
              warmup: true,
            });
            warmupExitCode = warmup.exitCode;
            runs.push(warmup);
          }
          for (let index = 1; index <= options.runs; index += 1) {
            if (cacheState === "next-cold") {
              rmSync(join(fixtureRoot, ".next"), { recursive: true, force: true });
              rmSync(join(fixtureRoot, "node_modules", ".vite"), { recursive: true, force: true });
              rmSync(join(fixtureRoot, "node_modules", ".vitest"), {
                recursive: true,
                force: true,
              });
            }
            const id = `${cellId}-run-${index}`;
            const run = await runHook({
              root: fixtureRoot,
              setup,
              outputDir,
              id,
              scenarioName,
              profile,
              cacheState,
              timeoutMs: options.timeoutMs,
              warmup: false,
            });
            run.warmupExitCode = warmupExitCode;
            runs.push(run);
          }
          aggregates.push({
            scenario: scenarioName,
            profile,
            cacheState,
            ...aggregateRuns(
              runs.filter(
                (run) =>
                  run.scenario === scenarioName &&
                  run.requestedProfile === profile &&
                  run.cacheState === cacheState,
              ),
            ),
          });
        }
      }
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  } catch (error) {
    runError = error;
    if (error.installDiagnostic && installingScenario) {
      metadata.fixtureInstallDiagnostics[installingScenario] = error.installDiagnostic;
    }
  } finally {
    try {
      rmSync(fixturesRoot, { recursive: true, force: true });
      const timingHeader =
        "benchmark_run_id\tfixture\tprofile\tcache_state\trecord_type\tscenario\teffective_profile\tcache_condition\tgate\tstarted_at_utc\tended_at_utc\tduration_ms\texit_code\n";
      const timingLines = [timingHeader];
      for (const run of runs) {
        if (!run.hookTimingFile) continue;
        const contents = readFileSync(join(outputDir, run.hookTimingFile), "utf8")
          .trim()
          .split(/\r?\n/);
        for (const line of contents.slice(1)) {
          timingLines.push(
            `${run.id}\t${run.scenario}\t${run.requestedProfile}\t${run.cacheState}\t${line}\n`,
          );
        }
      }
      writeFileSync(join(outputDir, "gate-timings.tsv"), timingLines.join(""));
      const afterSafetyResult = captureSourceSafetySnapshot();
      const afterSafety = afterSafetyResult.snapshot;
      safetyAssertions = {
        sourceWorktreeStatusUnchanged:
          beforeSafety && afterSafety
            ? beforeSafety.gitStatusSha256 === afterSafety.gitStatusSha256
            : null,
        sourceGitIndexUnchanged:
          beforeSafety && afterSafety
            ? beforeSafety.gitIndexSha256 === afterSafety.gitIndexSha256
            : null,
        sourceGitConfigUnchanged:
          beforeSafety && afterSafety
            ? beforeSafety.gitConfigSha256 === afterSafety.gitConfigSha256
            : null,
        sourceNextDirectoryUnchanged:
          beforeSafety && afterSafety
            ? JSON.stringify(beforeSafety.nextDirectory) ===
              JSON.stringify(afterSafety.nextDirectory)
            : null,
      };
      writeFileSync(
        join(outputDir, "benchmark-results.json"),
        `${JSON.stringify({ metadata, safetySnapshots: { before: beforeSafety, after: afterSafety, beforeError: beforeSafetyResult.error, afterError: afterSafetyResult.error }, safetyAssertions, runs, aggregates, runError: runError?.message ?? null }, null, 2)}\n`,
      );
    } catch (error) {
      runError ??= error;
    }
  }
  process.stdout.write(`pre-push benchmark artifacts: ${outputDir}\n`);
  if (Object.values(safetyAssertions).some((passed) => passed !== true)) {
    process.stderr.write(
      "source worktree/index/config/.next changed during benchmark; inspect safetyAssertions\n",
    );
    process.exitCode = 2;
  }
  const failedAssertions = runs.filter(
    (run) =>
      !run.exitAssertion ||
      !run.profileAssertion ||
      !run.gateSequenceAssertion ||
      !run.finalGateAssertion,
  );
  if (failedAssertions.length > 0) {
    process.stderr.write(
      `benchmark assertions failed for ${failedAssertions.length} run(s); inspect benchmark-results.json\n`,
    );
    process.exitCode = 2;
  }
  if (runError) {
    process.stderr.write(`pre-push benchmark run failed: ${runError.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`pre-push benchmark failed: ${error.message}\n${usage()}`);
    process.exitCode = 1;
  });
}
