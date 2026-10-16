import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  copyFile,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertContainedRuntimePath,
  auditQualitySuiteInventory,
  auditRuntimeQualityCoverage,
  extractRuntimeFailureDiagnostics,
  extractRuntimeStartupError,
  PINNED_PROJECT_FILES,
  PINNED_RUNTIME_INPUTS,
  REQUIRED_RUNTIME_REFRESH_OUTPUTS,
  RUNTIME_QUALITY_TESTS,
  runRuntimeQualitySuites,
  validateStagedRuntimeData,
} from "../../../scripts/data-refresh/runtime-validator.mjs";
import { registry } from "../../../scripts/data-refresh/registry/index.mjs";

const roots = [];
async function fixture() {
  const canonicalFixtureRoot = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), "runtime-validator-"));
  roots.push(root);
  for (const relative of [
    ...Object.keys(PINNED_PROJECT_FILES),
    ...Object.keys(PINNED_RUNTIME_INPUTS),
  ]) {
    const source = path.join(canonicalFixtureRoot, relative);
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  await symlink(
    path.join(canonicalFixtureRoot, "node_modules"),
    path.join(root, "node_modules"),
    "dir",
  );
  const stageRoot = path.join(root, ".data-refresh/staging/run");
  await mkdir(stageRoot, { recursive: true });
  const registry = {
    sources: [{ id: "fixture", required: true, outputs: [...REQUIRED_RUNTIME_REFRESH_OUTPUTS] }],
  };
  const sourceResults = [
    {
      source: registry.sources[0],
      result: {
        artifacts: REQUIRED_RUNTIME_REFRESH_OUTPUTS.map((output) => ({
          path: output,
          bytes: Buffer.from(`staged:${output}`),
        })),
      },
    },
  ];
  await writeFile(path.join(root, REQUIRED_RUNTIME_REFRESH_OUTPUTS[0]), "canonical-before");
  return { root, stageRoot, registry, sourceResults };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("staged runtime quality validator", () => {
  it("extracts failed assertion titles from structured JSON and ignores raw failure fields", () => {
    const allowed = RUNTIME_QUALITY_TESTS[0];
    const runtimeRoot = "/runtime-root";
    const report = Buffer.from(
      JSON.stringify({
        testResults: [
          {
            name: path.join(runtimeRoot, allowed),
            status: "failed",
            message: "raw file level message with private source",
            assertionResults: [
              { status: "passed", title: "passing title" },
              {
                status: "failed",
                title: "stable test title",
                failureMessages: ["raw assertion diff with API_KEY=hidden"],
              },
            ],
            failureMessages: ["raw stack with password=hidden"],
          },
        ],
      }),
    );
    const diagnostics = extractRuntimeFailureDiagnostics({
      exitCode: 1,
      report,
      runtimeRoot,
    });
    expect(diagnostics).toEqual({
      exitCode: 1,
      reportStatus: "report-failures-found",
      reportBytes: report.byteLength,
      testResultCount: 1,
      failedAssertionCount: 1,
      failedTestSamples: [{ file: allowed, title: "stable test title" }],
    });
    expect(JSON.stringify(diagnostics)).not.toMatch(/private|hidden|password|API_KEY|diff/);
  });

  it("redacts URLs and secret assignments in assertion titles", () => {
    const runtimeRoot = "/runtime-root";
    const allowed = RUNTIME_QUALITY_TESTS[0];
    const report = Buffer.from(
      JSON.stringify({
        testResults: [
          {
            name: path.join(runtimeRoot, allowed),
            status: "failed",
            assertionResults: [
              {
                status: "failed",
                title: "see https://example.test/private?token=hidden API_KEY=also-hidden",
              },
            ],
          },
        ],
      }),
    );
    const redacted = extractRuntimeFailureDiagnostics({
      exitCode: 1,
      report,
      runtimeRoot,
    });
    expect(redacted.failedTestSamples).toEqual([
      {
        file: allowed,
        title: "see [url] [redacted]",
      },
    ]);
    expect(JSON.stringify(redacted)).not.toMatch(/example\.test|hidden|API_KEY/);
  });

  it("rejects unknown and outside files and invalid reports", () => {
    const runtimeRoot = "/runtime-root";
    const result = (name) =>
      Buffer.from(
        JSON.stringify({
          testResults: [
            {
              name,
              status: "failed",
              assertionResults: [{ status: "failed", title: "secret title" }],
            },
          ],
        }),
      );
    expect(
      extractRuntimeFailureDiagnostics({
        exitCode: 1,
        report: result(path.join(runtimeRoot, "tests/private.test.ts")),
        runtimeRoot,
      }),
    ).toMatchObject({ reportStatus: "report-no-allowlisted-failures" });
    expect(
      extractRuntimeFailureDiagnostics({
        exitCode: 1,
        report: result("/tmp/private.test.ts"),
        runtimeRoot,
      }),
    ).toMatchObject({ reportStatus: "report-no-allowlisted-failures" });
    expect(
      extractRuntimeFailureDiagnostics({
        exitCode: 1,
        report: Buffer.from("{"),
        runtimeRoot,
      }),
    ).toMatchObject({ reportStatus: "report-invalid-json" });
    expect(
      extractRuntimeFailureDiagnostics({
        exitCode: 1,
        report: Buffer.alloc(10 * 1024 * 1024 + 1),
        runtimeRoot,
      }),
    ).toMatchObject({ reportStatus: "report-oversize", reportBytes: 10 * 1024 * 1024 });
    expect(
      extractRuntimeFailureDiagnostics({
        exitCode: 1,
        report: result(path.join(runtimeRoot, RUNTIME_QUALITY_TESTS[0])),
        runtimeRoot,
        testFiles: ["tests/private.test.ts"],
      }),
    ).toBeUndefined();
  });

  it("reports bounded extraction status for missing, oversized, invalid, and failure-free reports", () => {
    const runtimeRoot = "/runtime-root";
    const diagnostics = (options) =>
      extractRuntimeFailureDiagnostics({
        exitCode: 1,
        runtimeRoot,
        ...options,
      });
    expect(diagnostics({ reportStatus: "report-missing" })).toEqual({
      exitCode: 1,
      reportStatus: "report-missing",
      reportBytes: 0,
      failedTestSamples: [],
    });
    expect(diagnostics({ reportStatus: "report-oversize", reportBytes: 20 * 1024 * 1024 })).toEqual(
      {
        exitCode: 1,
        reportStatus: "report-oversize",
        reportBytes: 10 * 1024 * 1024,
        failedTestSamples: [],
      },
    );
    expect(diagnostics({ report: Buffer.from("{") })).toMatchObject({
      reportStatus: "report-invalid-json",
      reportBytes: 1,
      failedTestSamples: [],
    });
    const noFailureReport = Buffer.from(
      JSON.stringify({
        testResults: [
          {
            name: path.join(runtimeRoot, RUNTIME_QUALITY_TESTS[0]),
            status: "passed",
            assertionResults: [{ status: "passed", title: "private arbitrary value" }],
            stdout: "private stdout",
          },
        ],
        arbitraryKey: "private arbitrary value",
      }),
    );
    const noFailure = diagnostics({ report: noFailureReport });
    expect(noFailure).toEqual({
      exitCode: 1,
      reportStatus: "report-no-allowlisted-failures",
      reportBytes: noFailureReport.byteLength,
      testResultCount: 1,
      failedAssertionCount: 0,
      failedTestSamples: [],
    });
    expect(JSON.stringify(noFailure)).not.toContain("private");
  });

  it("keeps one redacted startup line only when the JSON report is unavailable", () => {
    const startupError = extractRuntimeStartupError(
      "noise\n\u001b[31mError: Cannot load /home/private/app/config.mjs https://host.test/x?token=secret API_KEY=hidden\u001b[0m\nFailed later",
    );
    expect(startupError).toBe("Error: Cannot load [path] [url] [redacted]");
    const missing = extractRuntimeFailureDiagnostics({
      exitCode: 1,
      reportStatus: "report-missing",
      startupError,
    });
    expect(missing.startupError).toBe(startupError);
    const failedReport = extractRuntimeFailureDiagnostics({
      exitCode: 1,
      report: Buffer.from(
        JSON.stringify({
          testResults: [
            {
              name: path.join("/runtime-root", RUNTIME_QUALITY_TESTS[0]),
              status: "failed",
              assertionResults: [{ status: "failed", title: "safe failure" }],
            },
          ],
        }),
      ),
      runtimeRoot: "/runtime-root",
      startupError: "Error: raw startup output",
    });
    expect(failedReport.reportStatus).toBe("report-failures-found");
    expect(failedReport).not.toHaveProperty("startupError");
    expect(
      extractRuntimeStartupError("routine log with /private/path and token=secret"),
    ).toBeUndefined();
    expect(extractRuntimeStartupError(`Error: ${"x".repeat(1000)}`)).toHaveLength(240);
    expect(
      extractRuntimeStartupError(
        "Error: canonical project and runtime data fallback is forbidden (target=canonical-data, operation=realpathSync.native)",
      ),
    ).toBe(
      "Error: canonical project and runtime data fallback is forbidden (target=canonical-data, operation=realpathSync.native)",
    );
    for (const target of [
      "canonical-server",
      "canonical-tests",
      "canonical-scripts",
      "canonical-package-manifest",
      "canonical-tsconfig",
      "canonical-vitest-config",
      "canonical-dependency",
      "canonical-other",
    ]) {
      const line = `Error: canonical project and runtime data fallback is forbidden (target=${target}, operation=readFileSync)`;
      expect(extractRuntimeStartupError(line)).toBe(line);
    }
    expect(
      extractRuntimeStartupError(
        "Error: canonical project and runtime data fallback is forbidden (target=/private/data, operation=readFileSync)",
      ),
    ).toBeUndefined();
    expect(
      extractRuntimeStartupError(
        "Error: canonical project and runtime data fallback is forbidden (target=canonical-data, operation=realpathSync) /private/secret.csv",
      ),
    ).toBeUndefined();
  });

  it("prefers a specific startup cause over Vitest's generic config wrapper", () => {
    expect(
      extractRuntimeStartupError(
        "failed to load config from /private/project/vitest.config.mjs\nTypeError: /private/project/plugin.mjs is not defined",
      ),
    ).toBe("TypeError: [path] is not defined");
    expect(
      extractRuntimeStartupError("failed to load config from /private/project/vitest.config.mjs"),
    ).toBe("failed to load config from [path]");
  });

  it("prefers a redacted esbuild cause over its generic build wrapper", () => {
    expect(
      extractRuntimeStartupError(
        'Error: Build failed with 1 error:\n✘ [ERROR] Could not resolve "/home/private/project/node_modules/missing-entry.mjs"',
      ),
    ).toBe('✘ [ERROR] Could not resolve "[path]"');
  });

  it("fully redacts quoted absolute paths containing spaces", () => {
    expect(
      extractRuntimeStartupError(
        `Error: Cannot load "/tmp/private dir/config.mjs", 'C:\\Users\\private dir\\config.mjs', and "\\\\private server\\share name\\config.mjs"`,
      ),
    ).toBe(`Error: Cannot load "[path]", '[path]', and "[path]"`);

    const runtimeRoot = "/runtime-root";
    const diagnostics = extractRuntimeFailureDiagnostics({
      exitCode: 1,
      report: Buffer.from(
        JSON.stringify({
          testResults: [
            {
              name: path.join(runtimeRoot, RUNTIME_QUALITY_TESTS[0]),
              status: "failed",
              assertionResults: [
                { status: "failed", title: `could not open "/tmp/private dir/config.mjs".` },
              ],
            },
          ],
        }),
      ),
      runtimeRoot,
    });
    expect(diagnostics.failedTestSamples[0].title).toBe('could not open "[path]".');
    expect(JSON.stringify(diagnostics)).not.toMatch(/private dir|private server|share name/);
  });

  it("redacts local absolute paths from failed assertion titles", () => {
    const runtimeRoot = "/runtime-root";
    const title =
      "failed (/tmp/a) and (/home/private/project/data.csv), C:\\Users\\private\\data.csv, and \\\\private-server\\share\\secret.csv";
    const diagnostics = extractRuntimeFailureDiagnostics({
      exitCode: 1,
      report: Buffer.from(
        JSON.stringify({
          testResults: [
            {
              name: path.join(runtimeRoot, RUNTIME_QUALITY_TESTS[0]),
              status: "failed",
              assertionResults: [{ status: "failed", title }],
            },
          ],
        }),
      ),
      runtimeRoot,
    });
    expect(diagnostics.failedTestSamples).toEqual([
      {
        file: RUNTIME_QUALITY_TESTS[0],
        title: "failed ([path]) and ([path]), [path], and [path]",
      },
    ]);
    expect(JSON.stringify(diagnostics)).not.toMatch(
      /\/home\/private|C:\\\\Users|\\\\private-server/,
    );
  });

  it("keeps six failed samples, caps larger reports at twelve, and bounds title length", () => {
    const runtimeRoot = "/runtime-root";
    const testResults = RUNTIME_QUALITY_TESTS.slice(0, 6).map((file) => ({
      name: path.join(runtimeRoot, file),
      status: "failed",
      assertionResults: [{ status: "failed", title: "x".repeat(300) }],
    }));
    testResults[0].assertionResults[0].title = "";
    const diagnostics = extractRuntimeFailureDiagnostics({
      exitCode: 1,
      report: Buffer.from(JSON.stringify({ testResults })),
      runtimeRoot,
    });
    expect(diagnostics.failedTestSamples).toHaveLength(6);
    expect(diagnostics.failedTestSamples[0]).toEqual({ file: RUNTIME_QUALITY_TESTS[0] });
    expect(diagnostics.failedTestSamples[1].title).toHaveLength(240);

    const largerTestResults = RUNTIME_QUALITY_TESTS.map((file) => ({
      name: path.join(runtimeRoot, file),
      status: "failed",
      assertionResults: [{ status: "failed", title: `safe failure ${file}` }],
    }));
    largerTestResults[0].assertionResults.push({ status: "failed", title: "safe extra failure" });
    for (let index = 0; index < 4; index += 1) {
      largerTestResults[1].assertionResults.push({
        status: "failed",
        title: `safe additional ${index}`,
      });
    }
    const bounded = extractRuntimeFailureDiagnostics({
      exitCode: 1,
      report: Buffer.from(JSON.stringify({ testResults: largerTestResults })),
      runtimeRoot,
    });
    expect(bounded.failedTestSamples).toHaveLength(12);
    expect(bounded.failedAssertionCount).toBe(13);
    expect(JSON.stringify(bounded)).not.toMatch(/failureMessages|raw|password|token/);
  });

  it("audits exact refresh-output coverage and the pinned suite inventory", async () => {
    expect(REQUIRED_RUNTIME_REFRESH_OUTPUTS).toHaveLength(46);
    expect(auditRuntimeQualityCoverage(registry)).toMatchObject({
      missingRefreshOutputs: [],
      unexpectedRefreshOutputs: [],
      duplicateRefreshOutputs: [],
    });
    const outputs = [...REQUIRED_RUNTIME_REFRESH_OUTPUTS];
    const duplicate = auditRuntimeQualityCoverage({
      sources: [{ outputs: [...outputs, outputs[0]] }],
    });
    expect(duplicate.duplicateRefreshOutputs).toEqual([outputs[0]]);
    const missing = auditRuntimeQualityCoverage({ sources: [{ outputs: outputs.slice(1) }] });
    expect(missing.missingRefreshOutputs).toEqual([outputs[0]]);
    const extra = auditRuntimeQualityCoverage({
      sources: [{ outputs: [...outputs, "data/source/unexpected.csv"] }],
    });
    expect(extra.unexpectedRefreshOutputs).toEqual(["data/source/unexpected.csv"]);
    const f = await fixture();
    expect(await auditQualitySuiteInventory(f.root)).toEqual({
      testFiles: [...RUNTIME_QUALITY_TESTS],
    });
    await writeFile(path.join(f.root, "tests/data-quality/uncovered-new.test.ts"), "");
    await expect(auditQualitySuiteInventory(f.root)).rejects.toMatchObject({
      code: "quality-validator-incomplete",
    });
  });

  it("pins adjusted CTI readers to the staged runtime root", async () => {
    const f = await fixture();
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    let childOptions;
    const run = runRuntimeQualitySuites({
      root: f.root,
      runtimeRoot: f.root,
      stageRoot: f.root,
      testFiles: [RUNTIME_QUALITY_TESTS[0]],
      preloadPath: path.join(f.root, "preload.cjs"),
      configPath: path.join(f.root, "vitest.config.mjs"),
      spawnProcess: (_command, _args, options) => {
        childOptions = options;
        queueMicrotask(() => child.emit("close", 0));
        return child;
      },
    });

    await run;
    expect(childOptions.env.CTI_ADJUSTED_ARTIFACT_ROOT).toBe(
      path.join(f.root, "data/source/cti-adjusted"),
    );
    expect(childOptions.env.CTI_ADJUSTED_ANALYSIS_ROOT).toBe(path.join(f.root, "results/plan39"));
  });

  it("runs suites from a project clone containing only pinned project files and staged data", async () => {
    const f = await fixture();
    const unlistedData = path.join(f.root, "data/source/unlisted.csv");
    await writeFile(unlistedData, "must-not-be-copied");
    let suiteInput;
    await validateStagedRuntimeData({
      ...f,
      runSuites: async (input) => {
        suiteInput = input;
        expect(
          await readFile(path.join(input.runtimeRoot, REQUIRED_RUNTIME_REFRESH_OUTPUTS[0]), "utf8"),
        ).toBe(`staged:${REQUIRED_RUNTIME_REFRESH_OUTPUTS[0]}`);
        expect(
          await readFile(path.join(input.runtimeRoot, Object.keys(PINNED_RUNTIME_INPUTS)[0])),
        ).toEqual(await readFile(path.join(f.root, Object.keys(PINNED_RUNTIME_INPUTS)[0])));
        await expect(
          lstat(path.join(input.runtimeRoot, "data/source/unlisted.csv")),
        ).rejects.toMatchObject({ code: "ENOENT" });
        expect(await readFile(path.join(input.runtimeRoot, "server/lib/dataIo.ts"))).toEqual(
          await readFile(path.join(f.root, "server/lib/dataIo.ts")),
        );
        const allowedStagePath = path.join(input.runtimeRoot, REQUIRED_RUNTIME_REFRESH_OUTPUTS[0]);
        const canonicalDataSymlink = path.join(input.runtimeRoot, "canonical-data-link.csv");
        await symlink(unlistedData, canonicalDataSymlink, "file");
        const forbiddenPaths = [unlistedData, path.join(f.root, "server/lib/dataIo.ts")];
        const script = `const fs=require('node:fs'); (async()=>{ if(typeof fs.realpathSync.native!=='function') process.exit(10); if(fs.realpathSync(${JSON.stringify(allowedStagePath)})!==${JSON.stringify(allowedStagePath)}||fs.realpathSync.native(${JSON.stringify(allowedStagePath)})!==${JSON.stringify(allowedStagePath)}) process.exit(11); if(!fs.realpathSync(${JSON.stringify(path.join(input.runtimeRoot, "node_modules"))}).endsWith('/node_modules')) process.exit(21); for(const p of ${JSON.stringify(forbiddenPaths)}) { if(fs.existsSync(p)) process.exit(4); try { fs.readFileSync(p); process.exit(5); } catch(e) { if(e.code !== 'ESTAGEONLY') process.exit(6); } try { await fs.promises.readFile(p); process.exit(7); } catch(e) { if(e.code !== 'ESTAGEONLY') process.exit(8); } try { fs.realpathSync(p); process.exit(17); } catch(e) { if(e.code !== 'ESTAGEONLY') process.exit(18); } try { fs.realpathSync.native(p); process.exit(12); } catch(e) { if(e.code !== 'ESTAGEONLY') process.exit(13); } } for(const realpath of [fs.realpathSync, fs.realpathSync.native]) { try { realpath(${JSON.stringify(canonicalDataSymlink)}); process.exit(22); } catch(e) { if(e.code !== 'ESTAGEONLY') process.exit(23); } } })().catch(()=>process.exit(9));`;
        execFileSync(process.execPath, ["-r", input.preloadPath, "-e", script], {
          env: { PATH: process.env.PATH, DATA_REFRESH_CANONICAL_ROOT: f.root },
        });
        const cjsDiagnosticsScript = `const fs=require('node:fs'); const expected=(target,operation)=>'canonical project and runtime data fallback is forbidden (target='+target+', operation='+operation+')'; const denied=(fn,target,operation)=>{try{fn();return false}catch(e){return e.code==='ESTAGEONLY'&&e.message===expected(target,operation)}}; (async()=>{ const areas=[['canonical-data',${JSON.stringify(unlistedData)}],['canonical-server',${JSON.stringify(path.join(f.root, "server/lib/dataIo.ts"))}],['canonical-tests',${JSON.stringify(path.join(f.root, "tests/does-not-need-to-exist.ts"))}],['canonical-scripts',${JSON.stringify(path.join(f.root, "scripts/does-not-need-to-exist.mjs"))}],['canonical-package-manifest',${JSON.stringify(path.join(f.root, "package.json"))}],['canonical-tsconfig',${JSON.stringify(path.join(f.root, "tsconfig.json"))}],['canonical-vitest-config',${JSON.stringify(path.join(f.root, "vitest.config.ts"))}],['canonical-dependency',${JSON.stringify(path.join(f.root, "pnpm-lock.yaml"))}],['canonical-other',${JSON.stringify(path.join(f.root, "public/does-not-need-to-exist.txt"))}]]; for(const [target,file] of areas) if(!denied(()=>fs.readFileSync(file),target,'readFileSync')) process.exit(31); if(!denied(()=>fs.statSync(${JSON.stringify(path.join(f.root, "server/lib/dataIo.ts"))}),'canonical-server','statSync')) process.exit(32); if(!denied(()=>fs.realpathSync(${JSON.stringify(canonicalDataSymlink)}),'canonical-data','realpathSync')) process.exit(33); if(!denied(()=>fs.realpathSync.native(${JSON.stringify(canonicalDataSymlink)}),'canonical-data','realpathSync.native')) process.exit(34); try { await fs.promises.stat(${JSON.stringify(path.join(f.root, "server/lib/dataIo.ts"))}); process.exit(35); } catch(e) { if(e.code!=='ESTAGEONLY'||e.message!==expected('canonical-server','promises.stat')) process.exit(36); } })().catch(()=>process.exit(37));`;
        execFileSync(process.execPath, ["-r", input.preloadPath, "-e", cjsDiagnosticsScript], {
          env: { PATH: process.env.PATH, DATA_REFRESH_CANONICAL_ROOT: f.root },
        });
        const esmScript = `import { readFileSync, realpathSync } from 'node:fs'; const expected=(operation)=>'canonical project and runtime data fallback is forbidden (target=canonical-data, operation='+operation+')'; const denied=(fn,operation)=>{try{fn();return false}catch(e){return e.code==='ESTAGEONLY'&&e.message===expected(operation)}}; const allowed=${JSON.stringify(allowedStagePath)}; if(typeof realpathSync.native!=='function'||realpathSync(allowed)!==allowed||realpathSync.native(allowed)!==allowed||!realpathSync(${JSON.stringify(path.join(input.runtimeRoot, "node_modules"))}).endsWith('/node_modules')) process.exit(14); if(!denied(()=>readFileSync(${JSON.stringify(unlistedData)}),'readFileSync')) process.exit(26); if(!denied(()=>realpathSync(${JSON.stringify(canonicalDataSymlink)}),'realpathSync')) process.exit(27); if(!denied(()=>realpathSync.native(${JSON.stringify(canonicalDataSymlink)}),'realpathSync.native')) process.exit(28);`;
        execFileSync(
          process.execPath,
          ["-r", input.preloadPath, "--input-type=module", "-e", esmScript],
          {
            env: { PATH: process.env.PATH, DATA_REFRESH_CANONICAL_ROOT: f.root },
          },
        );
      },
    });
    expect(suiteInput.testFiles).toEqual([...RUNTIME_QUALITY_TESTS]);
    expect(path.relative(f.root, suiteInput.runtimeRoot).startsWith("..")).toBe(true);
    expect(path.relative(suiteInput.runtimeRoot, f.root).startsWith("..")).toBe(true);
    await expect(lstat(suiteInput.runtimeRoot)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(f.root, REQUIRED_RUNTIME_REFRESH_OUTPUTS[0]), "utf8")).toBe(
      "canonical-before",
    );
  });

  it("copies the pinned Plan39 PI2+ dependency closure and rejects changed inputs", async () => {
    const f = await fixture();
    const manifestPath = "data/source/cti-size-composition/production-pi2plus-manifest.json";
    const manifest = JSON.parse(await readFile(path.join(f.root, manifestPath), "utf8"));
    const manifestDeclaredPaths = [
      manifestPath,
      path.posix.join(path.posix.dirname(manifestPath), manifest.artifact.path),
      ...Object.values(manifest.inputs).map(({ path: inputPath }) => inputPath),
      ...Object.values(manifest.sourceRawFiles).map(({ path: inputPath }) => inputPath),
    ];
    expect(manifestDeclaredPaths).toHaveLength(15);
    expect(new Set(manifestDeclaredPaths).size).toBe(15);
    expect(
      manifestDeclaredPaths.every((relative) => Object.hasOwn(PINNED_RUNTIME_INPUTS, relative)),
    ).toBe(true);

    let runtimeRoot;
    await validateStagedRuntimeData({
      ...f,
      runSuites: async (input) => {
        runtimeRoot = input.runtimeRoot;
        for (const relative of manifestDeclaredPaths) {
          expect(await readFile(path.join(runtimeRoot, relative))).toEqual(
            await readFile(path.join(f.root, relative)),
          );
        }
      },
    });
    expect(runtimeRoot).toBeTruthy();

    const changedFixture = await fixture();
    const changedInput = manifest.inputs.weights.path;
    await writeFile(path.join(changedFixture.root, changedInput), "PRIVATE-PI2PLUS-RAW");
    await expect(
      validateStagedRuntimeData({
        ...changedFixture,
        runSuites: async () => {
          throw new Error("must not run");
        },
      }),
    ).rejects.toMatchObject({
      code: "runtime-quality-underlay-hash-mismatch",
      message: expect.not.stringContaining("PRIVATE-PI2PLUS-RAW"),
    });
  });

  it("rejects escaped runtime paths", () => {
    expect(() => assertContainedRuntimePath("/tmp/staged-project", "../escape.csv")).toThrow(
      /escaped its root/,
    );
  });

  it("fails closed when pinned canonical input hash mismatches", async () => {
    const f = await fixture();
    await writeFile(
      path.join(f.root, Object.keys(PINNED_RUNTIME_INPUTS)[0]),
      "changed-after-review",
    );
    await expect(
      validateStagedRuntimeData({
        ...f,
        runSuites: async () => {
          throw new Error("must not run");
        },
      }),
    ).rejects.toMatchObject({ code: "runtime-quality-underlay-hash-mismatch" });
  });

  it("keeps dynamic refresh outputs separate from fixed hash-pinned underlays", () => {
    expect(
      REQUIRED_RUNTIME_REFRESH_OUTPUTS.filter((output) =>
        Object.hasOwn(PINNED_RUNTIME_INPUTS, output),
      ),
    ).toEqual([]);
    expect(
      registry.sources
        .flatMap((source) => source.outputs)
        .filter((output) => Object.hasOwn(PINNED_RUNTIME_INPUTS, output)),
    ).toEqual([]);
  });

  it("requires the part-time worker ratio artifacts in the exact output contract", () => {
    expect(REQUIRED_RUNTIME_REFRESH_OUTPUTS).toContain("data/source/part_time_worker_ratio.csv");
    expect(REQUIRED_RUNTIME_REFRESH_OUTPUTS).toContain(
      "data/source/part_time_worker_ratio.metadata.json",
    );
    expect(auditRuntimeQualityCoverage(registry)).toMatchObject({
      missingRefreshOutputs: [],
      unexpectedRefreshOutputs: [],
      duplicateRefreshOutputs: [],
    });
  });

  it("rejects symlinked pinned project or data files", async () => {
    const f = await fixture();
    const pinnedPath = Object.keys(PINNED_RUNTIME_INPUTS)[0];
    await rm(path.join(f.root, pinnedPath));
    await symlink(
      path.join(f.root, Object.keys(PINNED_RUNTIME_INPUTS)[1]),
      path.join(f.root, pinnedPath),
    );
    await expect(
      validateStagedRuntimeData({
        ...f,
        runSuites: async () => {
          throw new Error("must not run");
        },
      }),
    ).rejects.toMatchObject({ code: "runtime-quality-underlay-invalid" });
  });

  it("fails closed when a required data-quality suite fails", async () => {
    const f = await fixture();
    let runtimeRoot;
    await expect(
      validateStagedRuntimeData({
        ...f,
        runSuites: async (input) => {
          runtimeRoot = input.runtimeRoot;
          throw Object.assign(new Error("fixture suite failure"), {
            code: "runtime-quality-suite-failed",
          });
        },
      }),
    ).rejects.toMatchObject({ code: "runtime-quality-suite-failed" });
    expect(runtimeRoot).toBeTruthy();
    expect(path.relative(f.root, runtimeRoot).startsWith("..")).toBe(true);
    await expect(lstat(runtimeRoot)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(f.root, REQUIRED_RUNTIME_REFRESH_OUTPUTS[0]), "utf8")).toBe(
      "canonical-before",
    );
  });
});
