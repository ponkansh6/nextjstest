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

function expectPush(args, message, extraEnv = {}) {
  try {
    run(["push", ...args], work, extraEnv);
  } catch (error) {
    throw new Error(`${message}: ${error.stderr?.toString() ?? error.message}`);
  }
}

function expectRejectedPush(args, message, extraEnv = {}) {
  try {
    run(["push", ...args], work, extraEnv);
  } catch {
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
  chmodSync(join(work, ".git", "hooks", "pre-push"), 0o755);
  chmodSync(join(work, ".git", "hooks", "pre-push.bash"), 0o755);
  chmodSync(join(work, ".git", "hooks", "check-detached-leftover.sh"), 0o755);

  writeFileSync(join(work, "README.md"), "hook smoke initial\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "initial"]);
  expectPush(["origin", "main"], "initial push failed");
  const initial = remoteRef("main");
  expect(
    readFileSync(log, "utf8").includes("run lint:fast"),
    "initial push did not execute the hook profile",
  );

  writeFileSync(join(work, "README.md"), "hook smoke normal\n");
  git(["add", "README.md"]);
  git(["commit", "-m", "normal push"]);
  expectPush(["origin", "main"], "normal push failed");
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
  expectPush(["origin", "main"], "explicit full profile push failed", { PREPUSH_PROFILE: "full" });
  const profileLog = readFileSync(log, "utf8");
  for (const gate of [
    "lint:fast",
    "type-check",
    "test:all",
    "build",
    "test:build-parity",
    "security-check",
    "run test:e2e:clean",
    "run test:e2e",
  ]) {
    expect(profileLog.includes(gate), `full profile did not execute ${gate}`);
  }

  console.log(
    "hook smoke passed: initial, normal, multi-ref, deletion, failure atomicity, and full profile",
  );
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
