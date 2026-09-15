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
  it("keeps related zero-test success scoped to the commit config", () => {
    const config = fs.readFileSync(path.resolve(process.cwd(), "lint-staged.config.js"), "utf8");
    expect(config).toContain('"*.{ts,tsx}": ["oxfmt --write", "vitest related --passWithNoTests"]');
    expect(config).toContain("commit-only contract");
    expect(config).toContain("pre-push never treats unknown/empty diffs as");
    expect(config).toContain("success and does not call lint-staged");
  });
});
