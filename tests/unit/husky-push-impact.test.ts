import { describe, expect, it } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const impactScript = path.resolve(process.cwd(), ".husky/lib/push-impact.sh");
const hookWrapper = path.resolve(process.cwd(), ".husky/pre-push");

function initRepo(prefix: string): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  execSync("git init -b main", { cwd: repo, stdio: "ignore" });
  execSync('git config user.name "Fixture User"', { cwd: repo, stdio: "ignore" });
  execSync('git config user.email "fixture@example.test"', { cwd: repo, stdio: "ignore" });
  fs.writeFileSync(path.join(repo, "base.ts"), "export const base = 1;\n");
  execSync("git add . && git commit -m base", { cwd: repo, stdio: "ignore" });
  return repo;
}

function oid(repo: string, revision = "HEAD"): string {
  return execSync(`git rev-parse ${revision}`, { cwd: repo, encoding: "utf8" }).trim();
}

function collect(repo: string, stdin: string, gitStub = ""): string {
  return execFileSync(
    "bash",
    [
      "-c",
      `${gitStub}
source "$1"
HOOK_COMMON_LOGS=()
push_impact_collect
printf 'full=%s\\n' "$PUSH_IMPACT_FULL"
printf 'categories=%s\\n' "\${PUSH_IMPACT_CATEGORIES[*]-}"
printf 'paths=%s\\n' "\${PUSH_IMPACT_PATHS[*]-}"
printf 'related=%s\\n' "\${PUSH_IMPACT_RELATED_PATHS[*]-}"
printf 'reasons=%s\\n' "\${PUSH_IMPACT_REASONS[*]-}"`,
      "push-impact-fixture",
      impactScript,
    ],
    { cwd: repo, input: stdin, encoding: "utf8" },
  );
}

function commitFiles(repo: string, files: Record<string, string>, message: string): string {
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(repo, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  execSync("git add -A && git commit -m change", { cwd: repo, stdio: "ignore" });
  return oid(repo);
}

describe("push-impact isolated contract", () => {
  it("classifies every supported category and preserves special path names", () => {
    const repo = initRepo("push-impact-categories-");
    try {
      const base = oid(repo);
      const local = commitFiles(
        repo,
        {
          "src/component.ts": "export const component = 1;\n",
          "src/app/api/route.ts": "export const GET = () => Response.json({});\n",
          "server/load.ts": "export const load = 1;\n",
          "tests/unit/fixture.test.ts": "test('fixture', () => {});\n",
          "tests/e2e/home.e2e.spec.ts": "test('e2e', () => {});\n",
          "package.json": "{}\n",
          "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
          "src/output.generated.ts": "export {};\n",
          ".next/cache/index": "generated\n",
          "playwright.config.ts": "export default {};\n",
          "openspec/specs/fixture.md": "fixture\n",
          "README.md": "fixture\n",
          "unknown/[special] name.bin": "fixture\n",
        },
        "categories",
      );

      const output = collect(repo, `refs/heads/main ${local} refs/remotes/origin/main ${base}\n`);
      expect(output).toContain("full=1");
      for (const category of [
        "source",
        "server",
        "tests",
        "config/dependency",
        "generated",
        "build",
        "e2e",
        "playwright",
        "openspec",
        "docs/assets",
        "unknown",
      ]) {
        expect(output).toContain(category);
      }
      expect(output).toContain("unknown/[special] name.bin");
      expect(output).toContain("src/component.ts");
      expect(output).toContain("tests/unit/fixture.test.ts");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("falls back for shallow repositories and a failed diff command", () => {
    const source = initRepo("push-impact-source-");
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), "push-impact-shallow-"));
    try {
      execSync(`git clone --depth=1 file://${source} ${clone}`, { stdio: "ignore" });
      execSync(
        'git config user.name "Fixture User" && git config user.email "fixture@example.test"',
        {
          cwd: clone,
          stdio: "ignore",
        },
      );
      const base = oid(clone);
      const local = commitFiles(
        clone,
        { "src/shallow.ts": "export const shallow = true;\n" },
        "shallow",
      );
      const shallowOutput = collect(
        clone,
        `refs/heads/main ${local} refs/remotes/origin/main ${base}\n`,
      );
      expect(shallowOutput).toContain("full=1");
      expect(shallowOutput).toContain("shallow clone");

      const normalRepo = initRepo("push-impact-diff-failure-");
      try {
        const normalBase = oid(normalRepo);
        const normalLocal = commitFiles(
          normalRepo,
          { "src/diff-failure.ts": "export const failure = true;\n" },
          "diff failure",
        );
        const output = collect(
          normalRepo,
          `refs/heads/main ${normalLocal} refs/remotes/origin/main ${normalBase}\n`,
          'git() { [[ "$1" == diff ]] && return 42; command git "$@"; }',
        );
        expect(output).toContain("full=1");
        expect(output).toContain("push diff inspection failed");
      } finally {
        fs.rmSync(normalRepo, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
      fs.rmSync(clone, { recursive: true, force: true });
    }
  });

  it("unions multiple refs and treats initial, deletion, and unresolved refs as unsafe", () => {
    const repo = initRepo("push-impact-refs-");
    try {
      const base = oid(repo);
      const first = commitFiles(repo, { "src/first.ts": "export const first = 1;\n" }, "first");
      execSync("git checkout -b second", { cwd: repo, stdio: "ignore" });
      const second = commitFiles(
        repo,
        { "tests/second.test.ts": "test('second', () => {});\n" },
        "second",
      );
      const output = collect(
        repo,
        [
          `refs/heads/main ${first} refs/remotes/origin/main ${base}`,
          `refs/heads/second ${second} refs/remotes/origin/second ${base}`,
        ].join("\n") + "\n",
      );
      expect(output).toContain("src/first.ts");
      expect(output).toContain("tests/second.test.ts");

      const initial = collect(
        repo,
        `refs/heads/second ${"0".repeat(40)} refs/remotes/origin/second ${base}\n`,
      );
      expect(initial).toContain("initial push or remote deletion");
      expect(initial).toContain("full=1");

      const deletion = collect(
        repo,
        `refs/heads/second ${second} refs/remotes/origin/second ${"0".repeat(40)}\n`,
      );
      expect(deletion).toContain("initial push or remote deletion");
      expect(deletion).toContain("full=1");

      const unresolved = collect(
        repo,
        `refs/heads/missing ${second} refs/remotes/origin/missing ${base}\n`,
      );
      expect(unresolved).toContain("local ref could not be resolved");
      expect(unresolved).toContain("full=1");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("pre-push isolated gate harness", () => {
  it("keeps a POSIX wrapper that forwards arguments to the bash implementation", () => {
    const wrapper = fs.readFileSync(hookWrapper, "utf8");
    expect(wrapper).toContain("#!/bin/sh");
    expect(wrapper).toContain('exec bash -e "$(dirname "$0")/pre-push.bash" "$@"');
  });

  function setupHookFixture(): { repo: string; input: string; bin: string; log: string } {
    const repo = initRepo("pre-push-hook-");
    const base = oid(repo);
    const local = commitFiles(repo, { "src/hook.ts": "export const hook = true;\n" }, "hook");
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), "pre-push-bin-"));
    const log = path.join(bin, "calls.log");
    fs.writeFileSync(
      path.join(bin, "pnpm"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$MOCK_LOG"
if [ "$1" = exec ] && [ "$2" = vitest ]; then
  result=""
  for arg in "$@"; do case "$arg" in --outputFile=*) result="\${arg#*=}";; esac; done
  case "\${MOCK_RELATED_MODE:-valid}" in
    valid) printf '%s' '{"testResults":[{"name":"fixture"}]}' > "$result" ;;
    zero) printf '%s' '{"testResults":[]}' > "$result" ;;
    invalid) printf '%s' '{"notTestResults":[]}' > "$result" ;;
    missing) : ;;
    fail) exit 19 ;;
  esac
  exit 0
fi
if [ "$1" = run ] && [ "\${MOCK_FAIL_GATE:-}" = "$2" ]; then exit 23; fi
exit 0
`,
    );
    fs.chmodSync(path.join(bin, "pnpm"), 0o755);
    return { repo, input: `refs/heads/main ${local} refs/remotes/origin/main ${base}\n`, bin, log };
  }

  function runHook(
    fixture: ReturnType<typeof setupHookFixture>,
    extraEnv: Record<string, string> = {},
  ) {
    const env = {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH ?? ""}`,
      MOCK_LOG: fixture.log,
      ...extraEnv,
    };
    try {
      return {
        status: 0,
        output: execFileSync("sh", [hookWrapper], {
          cwd: fixture.repo,
          env,
          input: fixture.input,
          encoding: "utf8",
        }),
      };
    } catch (error) {
      const result = error as { status?: number; stdout?: string; stderr?: string };
      return { status: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
    }
  }

  it("runs related with the actual candidate array, then build and E2E", () => {
    const fixture = setupHookFixture();
    try {
      const result = runHook(fixture);
      const calls = fs.readFileSync(fixture.log, "utf8").trim().split("\n");
      expect(result.status).toBe(0);
      expect(
        calls.some(
          (call) => call.startsWith("exec vitest related") && call.includes("src/hook.ts"),
        ),
      ).toBe(true);
      expect(calls).toContain("run build");
      expect(calls).toContain("run test:e2e:clean");
      expect(calls).toContain("run test:e2e");
      expect(calls).not.toContain("run lint:fast");
    } finally {
      fs.rmSync(fixture.repo, { recursive: true, force: true });
      fs.rmSync(fixture.bin, { recursive: true, force: true });
    }
  });

  it.each(["zero", "invalid", "missing", "fail"])(
    "runs the full fallback exactly once for related %s",
    (mode) => {
      const fixture = setupHookFixture();
      try {
        const result = runHook(fixture, { MOCK_RELATED_MODE: mode });
        const calls = fs.readFileSync(fixture.log, "utf8").trim().split("\n");
        expect(result.status).toBe(0);
        expect(result.output).toContain("fallback profile: full");
        expect(calls.filter((call) => call === "run lint:fast")).toHaveLength(1);
        expect(calls.filter((call) => call === "run build")).toHaveLength(1);
        expect(calls.filter((call) => call === "run test:e2e")).toHaveLength(1);
      } finally {
        fs.rmSync(fixture.repo, { recursive: true, force: true });
        fs.rmSync(fixture.bin, { recursive: true, force: true });
      }
    },
  );

  it("honors explicit full and stops before later gates on a gate failure", () => {
    const fixture = setupHookFixture();
    try {
      const full = runHook(fixture, { PREPUSH_PROFILE: "full" });
      expect(full.status).toBe(0);
      expect(full.output).toContain("explicit full profile requested");
      const fullCalls = fs.readFileSync(fixture.log, "utf8");
      expect(fullCalls).not.toContain("exec vitest related");
      expect(fullCalls.indexOf("run build")).toBeGreaterThan(fullCalls.indexOf("run test:all"));

      fs.writeFileSync(fixture.log, "");
      const failed = runHook(fixture, { MOCK_FAIL_GATE: "build" });
      expect(failed.status).toBe(23);
      expect(failed.output).toContain("gate failed: build");
      expect(fs.readFileSync(fixture.log, "utf8")).not.toContain("run test:e2e");
    } finally {
      fs.rmSync(fixture.repo, { recursive: true, force: true });
      fs.rmSync(fixture.bin, { recursive: true, force: true });
    }
  });
});
