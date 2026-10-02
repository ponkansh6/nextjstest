import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const commonScriptPath = path.resolve(process.cwd(), ".husky/lib/hook-common.sh");

describe("Husky POSIX launcher contract", () => {
  it.each([
    ["pre-commit", "pre-commit.bash"],
    ["pre-push", "pre-push.bash"],
  ])("launches %s through its bash implementation", (hook, implementation) => {
    const wrapper = fs.readFileSync(path.resolve(process.cwd(), `.husky/${hook}`), "utf8");
    expect(wrapper).toBe(`#!/bin/sh\nexec bash -e "$(dirname "$0")/${implementation}" "$@"\n`);
  });
});

function setupRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "git-hook-common-test-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repo });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "README.md"), "base\n");
  execFileSync("git", ["add", "."], { cwd: repo });
  execFileSync("git", ["commit", "-m", "base"], { cwd: repo, stdio: "ignore" });
  return repo;
}

function stagedDecision(repo: string, file: string): boolean {
  const target = path.join(repo, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "change\n");
  execFileSync("git", ["add", "--", file], { cwd: repo });
  const script = `source "$1"
HOOK_COMMON_LOGS=()
if staged_typecheck_required; then exit 0; else exit 1; fi`;
  try {
    execFileSync("bash", ["-c", script, "typecheck-decision", commonScriptPath], {
      cwd: repo,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

describe("hook-common staged typecheck contract", () => {
  it.each([
    "src/feature.ts",
    "src/feature.tsx",
    "tsconfig.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "next.config.mjs",
    "vitest.config.ts",
    "playwright.config.ts",
    "src/shared/value.js",
    "src/generated/value.js",
    "src/value.d.ts",
  ])("requires typecheck for %s", (file) => {
    const repo = setupRepo();
    expect(stagedDecision(repo, file)).toBe(true);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it.each(["README.md", "docs/testing.md", "public/icon.svg", "src/styles.css"])(
    "skips typecheck for docs/assets/non-type changes: %s",
    (file) => {
      const repo = setupRepo();
      expect(stagedDecision(repo, file)).toBe(false);
      fs.rmSync(repo, { recursive: true, force: true });
    },
  );

  it("requires typecheck for staged deletion and rename", () => {
    const repo = setupRepo();
    fs.mkdirSync(path.join(repo, "src"));
    fs.writeFileSync(path.join(repo, "src/value.ts"), "export const value = 1;\n");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "typed file"], { cwd: repo, stdio: "ignore" });

    fs.rmSync(path.join(repo, "src/value.ts"));
    execFileSync("git", ["add", "-A"], { cwd: repo });
    expect(stagedDecisionResult(repo)).toBe(true);

    fs.writeFileSync(path.join(repo, "src/old.ts"), "export const oldValue = 1;\n");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-m", "restore typed file"], { cwd: repo, stdio: "ignore" });
    fs.renameSync(path.join(repo, "src/old.ts"), path.join(repo, "src/new.ts"));
    execFileSync("git", ["add", "-A"], { cwd: repo });
    expect(stagedDecisionResult(repo)).toBe(true);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("requires typecheck when the staged decision is unavailable", () => {
    expect(() =>
      execFileSync(
        "bash",
        ["-c", `source "$1"; staged_typecheck_required`, "unavailable", commonScriptPath],
        { cwd: os.tmpdir(), stdio: "ignore" },
      ),
    ).not.toThrow();
  });
});

function stagedDecisionResult(repo: string): boolean {
  try {
    execFileSync(
      "bash",
      ["-c", `source "$1"; staged_typecheck_required`, "decision", commonScriptPath],
      { cwd: repo, stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

describe("hook-common gate and cleanup contract", () => {
  it("propagates a gate failure and runs EXIT cleanup for owned logs", () => {
    const marker = fs.mkdtempSync(path.join(os.tmpdir(), "hook-cleanup-test-"));
    const ownedLog = path.join(marker, "owned.log");
    fs.writeFileSync(ownedLog, "owned\n");
    const script = `source "$1"
HOOK_COMMON_LOGS+=("$2")
hook_gate failing-gate bash -c 'exit 23'`;
    let error: unknown;
    try {
      execFileSync("bash", ["-c", script, "gate", commonScriptPath, ownedLog], { stdio: "pipe" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeTruthy();
    expect((error as { status?: number }).status).toBe(23);
    expect(fs.existsSync(ownedLog)).toBe(false);
    fs.rmSync(marker, { recursive: true, force: true });
  });
});

describe("lint-staged related contract", () => {
  it("clears inherited outer-repository Git variables for lint-staged only", () => {
    const hook = fs.readFileSync(path.resolve(process.cwd(), ".husky/pre-commit.bash"), "utf8");
    const gateCommand = hook.match(
      /^\s*hook_gate "lint-staged \(commit related; zero tests pass\)" ([\s\S]*?pnpm exec lint-staged)$/m,
    )?.[1];
    expect(gateCommand).toBeDefined();

    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "git-pre-commit-test-env-"));
    const binDir = path.join(repo, "bin");
    fs.mkdirSync(binDir);
    const outputPath = path.join(repo, "child-env.txt");
    const pnpmStub = path.join(binDir, "pnpm");
    fs.writeFileSync(
      pnpmStub,
      '#!/bin/sh\nprintf "%s\\n" "${GIT_DIR-unset}" "${GIT_WORK_TREE-unset}" "${GIT_INDEX_FILE-unset}" "${GIT_PREFIX-unset}" "${GIT_COMMON_DIR-unset}" "${GIT_OBJECT_DIRECTORY-unset}" "${GIT_ALTERNATE_OBJECT_DIRECTORIES-unset}" "$PRESERVED_MARKER" > "$CHILD_ENV_OUTPUT"\n',
    );
    fs.chmodSync(pnpmStub, 0o755);

    const env = {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
      GIT_DIR: "/outer/.git",
      GIT_WORK_TREE: "/outer",
      GIT_INDEX_FILE: "/outer/.git/index",
      GIT_PREFIX: "nested/",
      GIT_COMMON_DIR: "/outer/.git",
      GIT_OBJECT_DIRECTORY: "/outer/.git/objects",
      GIT_ALTERNATE_OBJECT_DIRECTORIES: "/outer/alternate-objects",
      PRESERVED_MARKER: "kept",
      CHILD_ENV_OUTPUT: outputPath,
    };
    execFileSync("bash", ["-c", gateCommand!], { cwd: repo, env, stdio: "ignore" });

    expect(fs.readFileSync(outputPath, "utf8").trim().split("\n")).toEqual([
      "unset",
      "unset",
      "unset",
      "unset",
      "unset",
      "unset",
      "unset",
      "kept",
    ]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("keeps related zero-test success scoped to the commit config", () => {
    const config = fs.readFileSync(path.resolve(process.cwd(), "lint-staged.config.js"), "utf8");
    expect(config).toContain('"*.{ts,tsx}": ["oxfmt --write", "vitest related --passWithNoTests"]');
    expect(config).toContain("commit-only contract");
    expect(config).toContain("pre-push never treats unknown/empty diffs as");
    expect(config).toContain("success and does not call lint-staged");
  });
});
