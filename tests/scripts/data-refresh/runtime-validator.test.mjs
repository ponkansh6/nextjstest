import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
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
  PINNED_PROJECT_FILES,
  PINNED_RUNTIME_INPUTS,
  REQUIRED_RUNTIME_REFRESH_OUTPUTS,
  RUNTIME_QUALITY_TESTS,
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
        const script = `const fs=require('node:fs'); (async()=>{ for(const p of ${JSON.stringify([unlistedData, path.join(f.root, "server/lib/dataIo.ts")])}) { if(fs.existsSync(p)) process.exit(4); try { fs.readFileSync(p); process.exit(5); } catch(e) { if(e.code !== 'ESTAGEONLY') process.exit(6); } try { await fs.promises.readFile(p); process.exit(7); } catch(e) { if(e.code !== 'ESTAGEONLY') process.exit(8); } } })().catch(()=>process.exit(9));`;
        execFileSync(process.execPath, ["-r", input.preloadPath, "-e", script], {
          env: { PATH: process.env.PATH, DATA_REFRESH_CANONICAL_ROOT: f.root },
        });
      },
    });
    expect(suiteInput.testFiles).toEqual([...RUNTIME_QUALITY_TESTS]);
    expect(await readFile(path.join(f.root, REQUIRED_RUNTIME_REFRESH_OUTPUTS[0]), "utf8")).toBe(
      "canonical-before",
    );
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
    await expect(
      validateStagedRuntimeData({
        ...f,
        runSuites: async () => {
          throw Object.assign(new Error("fixture suite failure"), {
            code: "runtime-quality-suite-failed",
          });
        },
      }),
    ).rejects.toMatchObject({ code: "runtime-quality-suite-failed" });
    expect(await readFile(path.join(f.root, REQUIRED_RUNTIME_REFRESH_OUTPUTS[0]), "utf8")).toBe(
      "canonical-before",
    );
  });
});
