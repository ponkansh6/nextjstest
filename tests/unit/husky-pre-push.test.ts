import { describe, it, expect } from "vitest";
import { execFileSync, execSync } from "node:child_process";
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

  it("d. normal branch: wrapper using sh (subprocess) continues after check script returns 0", () => {
    const repo = setupRepo();
    execSync("git checkout -b feature-branch", { cwd: repo, stdio: "ignore" });
    execSync('git commit --allow-empty -m "feature commit"', { cwd: repo, stdio: "ignore" });

    // Create wrapper script that calls check-script via subprocess (sh) and adds marker
    const wrapperPath = path.join(repo, "wrapper.sh");
    const wrapperContent = `#!/bin/sh
sh "${scriptPath}"
if [ $? -ne 0 ]; then
  exit 1
fi
echo "FULL_SEQUENCE_MARKER"
`;
    fs.writeFileSync(wrapperPath, wrapperContent);
    fs.chmodSync(wrapperPath, 0o755);

    let output = "";
    let exitCode = 0;
    try {
      output = execSync(`sh "${wrapperPath}"`, { cwd: repo, encoding: "utf8" });
    } catch (err: any) {
      exitCode = err.status;
      output = err.stdout || "";
    }

    expect(exitCode).toBe(0);
    expect(output).toContain("FULL_SEQUENCE_MARKER");
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("e. detached HEAD with leftover: wrapper blocks before marker (subprocess exit propagates)", () => {
    const repo = setupRepo();
    execSync("git checkout --detach", { cwd: repo, stdio: "ignore" });
    execSync('git commit --allow-empty -m "leftover commit"', { cwd: repo, stdio: "ignore" });

    // Create wrapper script that calls check-script via subprocess (sh) and adds marker
    const wrapperPath = path.join(repo, "wrapper.sh");
    const wrapperContent = `#!/bin/sh
sh "${scriptPath}"
if [ $? -ne 0 ]; then
  exit 1
fi
echo "FULL_SEQUENCE_MARKER"
`;
    fs.writeFileSync(wrapperPath, wrapperContent);
    fs.chmodSync(wrapperPath, 0o755);

    let output = "";
    let exitCode = 0;
    try {
      output = execSync(`sh "${wrapperPath}"`, { cwd: repo, encoding: "utf8" });
    } catch (err: any) {
      exitCode = err.status;
      output = err.stdout || "";
    }

    expect(exitCode).toBe(1);
    expect(output).not.toContain("FULL_SEQUENCE_MARKER");
    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe("husky pre-push profile normalization", () => {
  const profileScriptPath = path.resolve(process.cwd(), ".husky/lib/prepush-profile.sh");

  function normalizedProfile(profile?: string): string {
    const env = { ...process.env };
    if (profile === undefined) {
      delete env.PREPUSH_PROFILE;
    } else {
      env.PREPUSH_PROFILE = profile;
    }
    const result = execSync(
      `source ${JSON.stringify(profileScriptPath)}; push_profile_normalize_env`,
      {
        env,
        shell: "/bin/bash",
        encoding: "utf8",
      },
    );
    return result.trim();
  }

  it("keeps the known profiles and defaults an unset variable to changed", () => {
    expect(normalizedProfile()).toBe("changed");
    expect(normalizedProfile("changed")).toBe("changed");
    expect(normalizedProfile("full")).toBe("full");
  });

  it.each(["", " full ", "FULL", "changed ", "unknown"])(
    "falls back to full for an invalid PREPUSH_PROFILE (%j)",
    (profile) => {
      expect(normalizedProfile(profile)).toBe("full");
    },
  );
});

describe("husky pre-push impact classification", () => {
  const impactScriptPath = path.resolve(process.cwd(), ".husky/lib/push-impact.sh");

  function collectImpact(repo: string, stdin: string): string {
    return execFileSync(
      "bash",
      [
        "-c",
        `source "$1"
HOOK_COMMON_LOGS=()
push_impact_collect
printf 'full=%s related=%s paths=%s candidates=%s\\n' "$PUSH_IMPACT_FULL" "$PUSH_IMPACT_HAS_RELATED_INPUT" "\${PUSH_IMPACT_PATHS[*]}" "\${PUSH_IMPACT_RELATED_PATHS[*]}"
printf 'reasons=%s\\n' "\${PUSH_IMPACT_REASONS[*]-}"`,
        "impact-fixture",
        impactScriptPath,
      ],
      { cwd: repo, input: stdin, encoding: "utf8" },
    );
  }

  function setupImpactRepo(): string {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "git-push-impact-test-"));
    execSync("git init -b main", { cwd: repo, stdio: "ignore" });
    execSync('git config user.name "Test User"', { cwd: repo, stdio: "ignore" });
    execSync('git config user.email "test@example.com"', { cwd: repo, stdio: "ignore" });
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src/base.ts"), "export const base = 1;\n");
    execSync("git add . && git commit -m base", { cwd: repo, stdio: "ignore" });
    return repo;
  }

  it("passes only source/server/test paths to related while retaining all impact paths", () => {
    const repo = setupImpactRepo();
    const remoteOid = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    fs.mkdirSync(path.join(repo, "tests"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src/feature.ts"), "export const feature = 1;\n");
    fs.writeFileSync(path.join(repo, "tests/feature.test.ts"), "test('fixture', () => {});\n");
    fs.writeFileSync(path.join(repo, "README.md"), "fixture\n");
    execSync("git add . && git commit -m impact", { cwd: repo, stdio: "ignore" });
    const localOid = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();

    const output = collectImpact(
      repo,
      `refs/heads/main ${localOid} refs/remotes/origin/main ${remoteOid}\n`,
    );
    expect(output).toContain("full=0 related=1");
    expect(output).toContain("src/feature.ts");
    expect(output).toContain("tests/feature.test.ts");
    expect(output).toContain("README.md");
    expect(output).toContain("candidates=src/feature.ts tests/feature.test.ts");
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it.each([
    ["initial push", `${"0".repeat(40)}`],
    ["OID resolution", "not-an-oid"],
  ])("falls back to full for %s", (label, localOid) => {
    const repo = setupImpactRepo();
    const output = collectImpact(
      repo,
      `refs/heads/main ${localOid} refs/remotes/origin/main ${"1".repeat(40)}\n`,
    );
    expect(output).toContain("full=1");
    expect(output).toContain("reasons=");
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("unions multiple refs and treats an empty diff as a fallback", () => {
    const repo = setupImpactRepo();
    const base = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    execSync("git checkout -b feature", { cwd: repo, stdio: "ignore" });
    fs.writeFileSync(path.join(repo, "src/feature.ts"), "export const feature = 1;\n");
    execSync("git add . && git commit -m feature", { cwd: repo, stdio: "ignore" });
    const feature = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    execSync("git checkout main", { cwd: repo, stdio: "ignore" });
    fs.mkdirSync(path.join(repo, "tests"), { recursive: true });
    fs.writeFileSync(path.join(repo, "tests/main.test.ts"), "test('fixture', () => {});\n");
    execSync("git add . && git commit -m test", { cwd: repo, stdio: "ignore" });
    const main = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();

    const output = collectImpact(
      repo,
      `refs/heads/feature ${feature} refs/remotes/origin/feature ${base}\nrefs/heads/main ${main} refs/remotes/origin/main ${base}\n`,
    );
    expect(output).toContain("full=0 related=1");
    expect(output).toContain("candidates=src/feature.ts tests/main.test.ts");

    const emptyOutput = collectImpact(
      repo,
      `refs/heads/main ${main} refs/remotes/origin/main ${main}\n`,
    );
    expect(emptyOutput).toContain("full=1");
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("connects the hook to the filtered candidates and keeps unsafe diff classes conservative", () => {
    const hook = fs.readFileSync(path.resolve(process.cwd(), ".husky/pre-push.bash"), "utf8");
    expect(hook).toContain('"${PUSH_IMPACT_RELATED_PATHS[@]}"');
    expect(hook).not.toContain('"${PUSH_IMPACT_PATHS[@]}"');
    expect(hook).toContain("run_full_profile");

    const repo = setupImpactRepo();
    const base = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    fs.renameSync(path.join(repo, "src/base.ts"), path.join(repo, "src/renamed.ts"));
    execSync("git add -A && git commit -m rename", { cwd: repo, stdio: "ignore" });
    const renamed = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    const renameOutput = collectImpact(
      repo,
      `refs/heads/main ${renamed} refs/remotes/origin/main ${base}\n`,
    );
    expect(renameOutput).toContain("full=1");

    fs.rmSync(path.join(repo, "src/renamed.ts"));
    execSync("git add -A && git commit -m delete", { cwd: repo, stdio: "ignore" });
    const deleted = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf8" }).trim();
    const deleteOutput = collectImpact(
      repo,
      `refs/heads/main ${deleted} refs/remotes/origin/main ${renamed}\n`,
    );
    expect(deleteOutput).toContain("full=1");

    const malformedOutput = collectImpact(repo, "refs/heads/main malformed\n");
    expect(malformedOutput).toContain("full=1");
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
