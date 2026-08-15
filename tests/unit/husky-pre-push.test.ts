import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("husky pre-push detached HEAD leftover check", () => {
  const scriptPath = path.resolve(process.cwd(), ".husky/check-detached-leftover.sh");

  function setupRepo(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-detached-test-"));
    execSync("git init -b main", { cwd: tmpDir, stdio: "ignore" });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: "ignore" });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: "ignore" });
    execSync('git commit --allow-empty -m "initial commit"', { cwd: tmpDir, stdio: "ignore" });
    return tmpDir;
  }

  it("a. detached HEAD with un-pouched/un-branched leftover commit returns exit code 1 (blocks)", () => {
    const repo = setupRepo();
    // Create an un-branched commit on detached HEAD
    execSync("git checkout --detach", { cwd: repo, stdio: "ignore" });
    execSync('git commit --allow-empty -m "leftover commit"', { cwd: repo, stdio: "ignore" });

    let exitCode = 0;
    try {
      execSync(`sh "${scriptPath}"`, { cwd: repo, stdio: "pipe" });
    } catch (err: any) {
      exitCode = err.status;
    }

    expect(exitCode).toBe(1);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("b. detached HEAD where commit is reachable from main branch returns exit code 0 (does not block)", () => {
    const repo = setupRepo();
    // Detach HEAD to main (which is reachable from main branch)
    execSync("git checkout main", { cwd: repo, stdio: "ignore" });
    execSync("git checkout --detach HEAD", { cwd: repo, stdio: "ignore" });

    let exitCode = 0;
    try {
      execSync(`sh "${scriptPath}"`, { cwd: repo, stdio: "pipe" });
    } catch (err: any) {
      exitCode = err.status;
    }

    expect(exitCode).toBe(0);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("c. normal branch state returns exit code 0 (no impact)", () => {
    const repo = setupRepo();
    // Create a new branch and commit on it
    execSync("git checkout -b feature-branch", { cwd: repo, stdio: "ignore" });
    execSync('git commit --allow-empty -m "feature commit"', { cwd: repo, stdio: "ignore" });

    let exitCode = 0;
    try {
      execSync(`sh "${scriptPath}"`, { cwd: repo, stdio: "pipe" });
    } catch (err: any) {
      exitCode = err.status;
    }

    expect(exitCode).toBe(0);
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
