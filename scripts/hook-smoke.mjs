#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const smokeRoot = mkdtempSync(join(tmpdir(), "nextjstest-hook-smoke-"));
const remote = join(smokeRoot, "remote.git");
const work = join(smokeRoot, "work");
const bin = join(smokeRoot, "bin");
const log = join(smokeRoot, "pnpm.log");

function run(args, cwd = work, extraEnv = {}) {
  return execFileSync("git", args, {
    cwd,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      HOOK_SMOKE_LOG: log,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

function git(args, cwd = work, extraEnv = {}) {
  return run(args, cwd, extraEnv).trim();
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function hasExactCommand(log, command) {
  return log.split(/\r?\n/).includes(command);
}

function expectPush(args, message, extraEnv = {}) {
  try {
    run(["push", ...args], work, extraEnv);
  } catch (error) {
    throw new Error(`${message}: ${error.stderr?.toString() ?? error.message}`);
  }
}

function expectRejectedPush(args, message, extraEnv = {}, onRejected = undefined) {
  try {
    run(["push", ...args], work, extraEnv);
  } catch (error) {
    onRejected?.({
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    });
    return;
  }
  throw new Error(`${message}: push unexpectedly succeeded`);
}

function remoteRef(ref) {
  return git(["--git-dir", remote, "rev-parse", `refs/heads/${ref}`], projectRoot);
}

try {
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "pnpm"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$HOOK_SMOKE_LOG"
if [[ -n "\${HOOK_SMOKE_FAIL_GATE:-}" && " $* " == *" run $HOOK_SMOKE_FAIL_GATE "* ]]; then
  exit 91
fi
if [[ "\${1:-}" == exec && "\${2:-}" == vitest && "\${3:-}" == related ]]; then
  output_file=""
  for arg in "$@"; do
    case "$arg" in
      --outputFile=*)
        output_file="\${arg#--outputFile=}"
        ;;
    esac
  done
  if [[ -z "$output_file" ]]; then
    echo "related-test stub received no --outputFile argument" >&2
    exit 92
  fi
  case "\${HOOK_SMOKE_RELATED_MODE:-nonempty}" in
    nonempty)
      printf '%s\\n' '{"testResults":[{"name":"hook smoke related test"}]}' > "$output_file"
      ;;
    empty)
      printf '%s\\n' '{"testResults":[]}' > "$output_file"
      ;;
    invalid)
      printf '%s\\n' '{invalid JSON' > "$output_file"
      ;;
    indeterminate)
      printf '%s\\n' '{"otherResults":[]}' > "$output_file"
      ;;
    *)
      echo "unknown related-test mode: $HOOK_SMOKE_RELATED_MODE" >&2
      exit 93
      ;;
  esac
fi
`,
  );
  chmodSync(join(bin, "pnpm"), 0o755);

  execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
  execFileSync("git", ["init", "-b", "main", work], { stdio: "ignore" });
  git(["config", "user.name", "Hook Smoke Test"]);
  git(["config", "user.email", "hook-smoke@example.invalid"]);
  git(["remote", "add", "origin", remote]);

  mkdirSync(join(work, ".git", "hooks", "lib"), { recursive: true });
  cpSync(join(projectRoot, ".husky", "pre-push"), join(work, ".git", "hooks", "pre-push"));
  cpSync(
    join(projectRoot, ".husky", "pre-push.bash"),
    join(work, ".git", "hooks", "pre-push.bash"),
  );
  cpSync(join(projectRoot, ".husky", "lib"), join(work, ".git", "hooks", "lib"), {
    recursive: true,
  });
  cpSync(
    join(projectRoot, ".husky", "check-detached-leftover.sh"),
    join(work, ".git", "hooks", "check-detached-leftover.sh"),
  );
  cpSync(
    join(projectRoot, ".husky", "check-clean-worktree.sh"),
    join(work, ".git", "hooks", "check-clean-worktree.sh"),
  );
  chmodSync(join(work, ".git", "hooks", "pre-push"), 0o755);
  chmodSync(join(work, ".git", "hooks", "pre-push.bash"), 0o755);
  chmodSync(join(work, ".git", "hooks", "check-detached-leftover.sh"), 0o755);
  chmodSync(join(work, ".git", "hooks", "check-clean-worktree.sh"), 0o755);

  writeFileSync(join(work, "README.md"), "hook smoke initial\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "initial"]);
  expectPush(["origin", "main"], "initial push failed");
  const initial = remoteRef("main");
  expect(
    hasExactCommand(readFileSync(log, "utf8"), "run lint:fast"),
    "initial push did not execute the hook profile",
  );

  git(["switch", "-c", "docs-assets"]);
  writeFileSync(join(work, "README.md"), "hook smoke normal\n");
  mkdirSync(join(work, "public"), { recursive: true });
  writeFileSync(
    join(work, "public", "hook-smoke-fixture.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>\n',
  );
  git(["add", "README.md", "public/hook-smoke-fixture.svg"]);
  git(["commit", "-m", "normal push"]);
  const docsOnlyLogStart = readFileSync(log, "utf8").length;
  expectPush(["origin", "docs-assets:main"], "docs/assets-only push failed", {
    PREPUSH_PROFILE: "changed",
  });
  const docsOnlyLog = readFileSync(log, "utf8").slice(docsOnlyLogStart);
  for (const codeGate of ["exec vitest related", "run test:all"]) {
    expect(
      codeGate === "exec vitest related"
        ? !docsOnlyLog.split(/\r?\n/).some((line) => line.startsWith(`${codeGate} `))
        : !hasExactCommand(docsOnlyLog, codeGate),
      `docs/assets-only push ran ${codeGate}`,
    );
  }
  const docsOnlyGates = docsOnlyLog.split(/\r?\n/);
  expect(
    hasExactCommand(docsOnlyLog, "run test:browser:prepush:component"),
    "docs/assets-only push skipped the pre-push component smoke case",
  );
  expect(hasExactCommand(docsOnlyLog, "run build"), "docs/assets-only push skipped build");
  expect(
    hasExactCommand(docsOnlyLog, "run test:browser:next-route-poc:prepush:built"),
    "docs/assets-only push skipped the pre-push production-route cases",
  );
  expect(
    docsOnlyGates.indexOf("run test:browser:prepush:component") <
      docsOnlyGates.indexOf("run build") &&
      docsOnlyGates.indexOf("run build") <
        docsOnlyGates.indexOf("run test:browser:next-route-poc:prepush:built"),
    "docs/assets-only push did not run the selected Browser Mode cases and build in order",
  );
  git(["switch", "main"]);
  git(["merge", "--ff-only", "docs-assets"]);
  const normal = remoteRef("main");
  expect(normal !== initial, "normal push did not update the remote");

  git(["switch", "-c", "feature"]);
  writeFileSync(join(work, "feature.md"), "multiple refs\n");
  git(["add", "feature.md"]);
  git(["commit", "-m", "feature push"]);
  git(["switch", "main"]);
  writeFileSync(join(work, "README.md"), "multiple refs\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "multiple refs"]);
  expectPush(["origin", "main", "feature"], "multiple-ref push failed");
  expect(
    remoteRef("feature") === git(["rev-parse", "feature"]),
    "multiple-ref push missed feature",
  );

  expectPush(["origin", ":feature"], "remote deletion failed");
  let deleted = false;
  try {
    remoteRef("feature");
  } catch {
    deleted = true;
  }
  expect(deleted, "deleted remote ref still resolves");

  writeFileSync(join(work, "README.md"), "failed push\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "failed push"]);
  const beforeFailure = remoteRef("main");
  expectRejectedPush(["origin", "main"], "failing hook did not block push", {
    HOOK_SMOKE_FAIL_GATE: "build",
  });
  expect(remoteRef("main") === beforeFailure, "remote changed despite hook failure");

  writeFileSync(join(work, "README.md"), "full profile\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "full profile"]);
  const fullProfileLogStart = readFileSync(log, "utf8").length;
  expectPush(["origin", "main"], "explicit full profile push failed", {
    PREPUSH_PROFILE: "full",
  });
  const profileLog = readFileSync(log, "utf8").slice(fullProfileLogStart);
  expect(!hasExactCommand(profileLog, "run test:e2e"), "full profile still ran test:e2e");
  expect(
    !hasExactCommand(profileLog, "run test:e2e:clean"),
    "full profile still ran test:e2e:clean",
  );
  const profileGates = profileLog.split(/\r?\n/);
  let previousGateIndex = -1;
  for (const gate of [
    "run lint:fast",
    "run type-check",
    "run test:all",
    "run test:browser:component:all",
    "run build",
    "run test:browser:next-route-poc:built:all",
    "run test:build-parity",
    "run security-check",
  ]) {
    const gateIndex = profileGates.indexOf(gate);
    expect(gateIndex >= 0, `full profile did not execute ${gate}`);
    expect(gateIndex > previousGateIndex, `full profile ran ${gate} out of order`);
    previousGateIndex = gateIndex;
  }

  git(["switch", "-c", "full-browser-failure"]);
  writeFileSync(join(work, "README.md"), "full Browser Mode failure\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "full Browser Mode failure"]);
  const beforeFullBrowserFailure = remoteRef("main");
  const fullBrowserFailureLogStart = readFileSync(log, "utf8").length;
  expectRejectedPush(
    ["origin", "full-browser-failure:main"],
    "full-profile production-route Browser Mode failure did not block push",
    {
      PREPUSH_PROFILE: "full",
      HOOK_SMOKE_FAIL_GATE: "test:browser:next-route-poc:built:all",
    },
  );
  expect(
    remoteRef("main") === beforeFullBrowserFailure,
    "remote changed despite full-profile Browser Mode failure",
  );
  const fullBrowserFailureLog = readFileSync(log, "utf8").slice(fullBrowserFailureLogStart);
  expect(
    hasExactCommand(fullBrowserFailureLog, "run test:browser:component:all"),
    "full profile skipped component Browser Mode",
  );
  expect(
    hasExactCommand(fullBrowserFailureLog, "run test:browser:next-route-poc:built:all"),
    "full profile skipped production-route Browser Mode",
  );
  for (const laterGate of ["run test:build-parity", "run security-check"]) {
    expect(
      !hasExactCommand(fullBrowserFailureLog, laterGate),
      `full profile continued to ${laterGate} after Browser Mode failed`,
    );
  }

  git(["switch", "main"]);
  expect(
    git(["rev-parse", "main"]) === remoteRef("main"),
    "local main and remote main did not remain at the same changed-profile base",
  );
  git(["switch", "-c", "changed"]);
  mkdirSync(join(work, "src"), { recursive: true });
  mkdirSync(join(work, "tests"), { recursive: true });
  writeFileSync(join(work, "src", "hook-smoke-fixture.ts"), "export const fixture = true;\n");
  writeFileSync(
    join(work, "tests", "hook-smoke-fixture.test.ts"),
    "describe('hook smoke', () => {});\n",
  );
  git(["add", "src/hook-smoke-fixture.ts", "tests/hook-smoke-fixture.test.ts"]);
  git(["commit", "-m", "changed profile Browser Mode failure"]);
  const beforeChangedBrowserFailure = remoteRef("main");
  const changedBrowserFailureLogStart = readFileSync(log, "utf8").length;
  let changedPushOutput = "";
  expectRejectedPush(
    ["origin", "changed:main"],
    "changed-profile Browser Mode failure did not block push",
    { PREPUSH_PROFILE: "changed", HOOK_SMOKE_FAIL_GATE: "test:browser:prepush:component" },
    ({ stdout, stderr }) => {
      changedPushOutput = `stdout:\n${stdout}\nstderr:\n${stderr}`;
    },
  );
  expect(
    remoteRef("main") === beforeChangedBrowserFailure,
    "remote changed despite changed-profile Browser Mode failure",
  );
  const changedBrowserFailureLog = readFileSync(log, "utf8").slice(changedBrowserFailureLogStart);
  expect(
    !hasExactCommand(changedBrowserFailureLog, "run test:e2e"),
    "changed profile still ran test:e2e",
  );
  expect(
    !hasExactCommand(changedBrowserFailureLog, "run test:e2e:clean"),
    "changed profile still ran test:e2e:clean",
  );
  expect(
    changedBrowserFailureLog.includes("exec vitest related"),
    `changed profile did not run a related test selection (PREPUSH_PROFILE=changed)\n` +
      `HOOK_SMOKE_LOG:\n${changedBrowserFailureLog}\npush classifier/hook output:\n${changedPushOutput}`,
  );
  expect(
    hasExactCommand(changedBrowserFailureLog, "run test:browser:prepush:component"),
    "changed profile skipped the pre-push component smoke case",
  );
  for (const laterGate of [
    "run test:all",
    "run build",
    "run test:browser:next-route-poc:prepush:built",
    "run test:build-parity",
    "run security-check",
  ]) {
    expect(
      !hasExactCommand(changedBrowserFailureLog, laterGate),
      `changed profile continued to ${laterGate} after Browser Mode failed`,
    );
  }

  git(["switch", "main"]);
  for (const relatedMode of ["invalid", "empty", "indeterminate"]) {
    expect(
      git(["rev-parse", "main"]) === remoteRef("main"),
      `local main and remote main diverged before ${relatedMode} fallback fixture`,
    );
    const branch = `related-${relatedMode}-fallback`;
    git(["switch", "-c", branch]);
    mkdirSync(join(work, "src"), { recursive: true });
    mkdirSync(join(work, "tests"), { recursive: true });
    writeFileSync(
      join(work, "src", `hook-smoke-${relatedMode}.ts`),
      `export const ${relatedMode}Fixture = true;\n`,
    );
    writeFileSync(
      join(work, "tests", `hook-smoke-${relatedMode}.test.ts`),
      `describe('hook smoke ${relatedMode}', () => {});\n`,
    );
    git(["add", `src/hook-smoke-${relatedMode}.ts`, `tests/hook-smoke-${relatedMode}.test.ts`]);
    git(["commit", "-m", `${relatedMode} related-test fallback`]);
    const fallbackLogStart = readFileSync(log, "utf8").length;
    expectPush(["origin", `${branch}:main`], `${relatedMode} related-test fallback push failed`, {
      PREPUSH_PROFILE: "changed",
      HOOK_SMOKE_RELATED_MODE: relatedMode,
    });
    const fallbackLog = readFileSync(log, "utf8").slice(fallbackLogStart);
    expect(
      fallbackLog.includes("exec vitest related"),
      `${relatedMode} selection did not run related tests`,
    );
    expect(
      hasExactCommand(fallbackLog, "run test:all"),
      `${relatedMode} selection did not fall back to the full profile`,
    );
    const browserRuns = fallbackLog
      .split(/\r?\n/)
      .filter(
        (line) =>
          line === "run test:browser:prepush:component" ||
          line === "run test:browser:next-route-poc:prepush:built",
      ).length;
    expect(
      browserRuns === 2,
      `${relatedMode} full fallback ran ${browserRuns} browser selection gates instead of two`,
    );
    const fallbackGates = fallbackLog.split(/\r?\n/);
    let previousFallbackGateIndex = -1;
    for (const gate of [
      "run test:all",
      "run test:browser:prepush:component",
      "run build",
      "run test:browser:next-route-poc:prepush:built",
      "run test:build-parity",
      "run security-check",
    ]) {
      const gateIndex = fallbackGates.indexOf(gate);
      expect(gateIndex >= 0, `${relatedMode} full fallback did not execute ${gate}`);
      expect(
        gateIndex > previousFallbackGateIndex,
        `${relatedMode} full fallback ran ${gate} out of order`,
      );
      previousFallbackGateIndex = gateIndex;
    }
    expect(
      remoteRef("main") === git(["rev-parse", branch]),
      `${relatedMode} full fallback did not update remote main`,
    );
    git(["switch", "main"]);
    git(["merge", "--ff-only", branch]);
  }

  console.log(
    "hook smoke passed: initial, normal, docs-only skip, multi-ref, deletion, failure atomicity, full profile, Browser Mode failure/fallback gates",
  );
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
