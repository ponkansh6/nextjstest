import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  symlink,
  stat,
  utimes,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchStatsData } from "../../../scripts/data-refresh/transport/estat-api.mjs";
import {
  fetchOfficialFile,
  OFFICIAL_ESTAT_FILE_HOSTS,
} from "../../../scripts/data-refresh/transport/file.mjs";
import { validateRegistry } from "../../../scripts/data-refresh/registry/schema.mjs";
import { runRefresh } from "../../../scripts/data-refresh/runner.mjs";
import { acquireExclusiveLock } from "../../../scripts/data-refresh/lib/lock.mjs";
import { publishArtifacts, recoverJournal } from "../../../scripts/data-refresh/lib/journal.mjs";
import { resolveContainedPath } from "../../../scripts/data-refresh/lib/fs-safety.mjs";

const roots = [];
async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "data-refresh-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const page = (records, { nextKey, total = 2, from } = {}) =>
  new Response(
    JSON.stringify({
      GET_STATS_DATA: {
        RESULT: { STATUS: 0, ...(nextKey ? { NEXT_KEY: nextKey } : {}) },
        STATISTICAL_DATA: {
          RESULT_INF: {
            TOTAL_NUMBER: String(total),
            FROM_NUMBER: String(
              from ?? (nextKey ? Number(nextKey) - records.length : total - records.length + 1),
            ),
            TO_NUMBER: String(
              from === undefined
                ? nextKey
                  ? Number(nextKey) - 1
                  : total
                : from + records.length - 1,
            ),
            ...(nextKey ? { NEXT_KEY: nextKey } : {}),
          },
          DATA_INF: { VALUE: records },
        },
      },
    }),
    { headers: { "content-type": "application/json" } },
  );

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const registryFor = (outputs) => ({
  sources: [
    {
      id: "fixture-source",
      identity: { kind: "file", statInfId: "00000001", format: "csv" },
      outputs: [...new Set(outputs)]
        .filter((output) => output !== ".data-refresh/semantic-state.json")
        .sort(),
    },
  ],
});
const sourceAllowlistFor = (outputs) =>
  registryFor(outputs).sources.map(({ id: sourceId, identity, outputs: declared }) => ({
    sourceId,
    identity,
    outputs: declared,
  }));
const journalFor = (id, state, entries, outputs = entries.map((entry) => entry.path)) => ({
  version: 2,
  id,
  state,
  sourceAllowlist: sourceAllowlistFor(outputs),
  entries,
});
const journalEntry = ({
  path: target,
  staged,
  backup,
  targetBytes,
  existed = false,
  intent = false,
  published = false,
}) => ({
  path: target,
  staged,
  backup,
  existed,
  metadata: null,
  backupHash: null,
  targetHash: sha256(targetBytes),
  intent,
  published,
});

describe("e-Stat transport", () => {
  it("follows API paging tokens through the final page", async () => {
    const requests = [];
    const responses = [
      page([{ id: 1 }, { id: 2 }], { nextKey: "3", total: 3 }),
      page([{ id: 3 }], { total: 3 }),
    ];
    const result = await fetchStatsData({
      statsDataId: "0004052037",
      appId: "fixture-secret",
      limit: 2,
      fetchImpl: async (url) => {
        requests.push(new URL(url).searchParams);
        return responses.shift();
      },
    });
    expect(result.records).toHaveLength(3);
    expect(requests.map((params) => params.get("startPosition"))).toEqual(["1", "3"]);
  });

  it("retries 429 only to the finite retry bound", async () => {
    let calls = 0;
    await expect(
      fetchStatsData({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        maxRetries: 2,
        retryBaseMs: 0,
        fetchImpl: async () => {
          calls += 1;
          return new Response("busy", { status: 429 });
        },
      }),
    ).rejects.toMatchObject({ code: "api-http-error" });
    expect(calls).toBe(3);
  });

  it("rejects HTTP 200 HTML without exposing the API key", async () => {
    const failure = await fetchStatsData({
      statsDataId: "0004052037",
      appId: "fixture-secret",
      fetchImpl: async () =>
        new Response("<html>no</html>", { headers: { "content-type": "text/html" } }),
    }).catch((error) => error);
    expect(failure.message).toMatch(/non-JSON/);
    expect(failure.message).not.toContain("fixture-secret");
  });

  it("rejects repeated paging tokens without exposing the API key", async () => {
    const responses = [
      page([{ id: 1 }], { nextKey: "2", total: 2 }),
      page([{ id: 2 }], { nextKey: "2", total: 2, from: 2 }),
    ];
    await expect(
      fetchStatsData({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        fetchImpl: async () => responses.shift(),
      }),
    ).rejects.toMatchObject({ code: "api-paging-loop" });
  });

  it("rejects business status failures and non-JSON files", async () => {
    await expect(
      fetchStatsData({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        fetchImpl: async () =>
          new Response(JSON.stringify({ GET_STATS_DATA: { RESULT: { STATUS: 100 } } }), {
            headers: { "content-type": "application/json" },
          }),
      }),
    ).rejects.toMatchObject({ code: "api-business-error" });
    await expect(
      fetchOfficialFile({
        url: "https://example.invalid/file",
        allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
        fetchImpl: async () => new Response("<html>login</html>"),
      }),
    ).rejects.toMatchObject({ code: "file-host-not-allowlisted" });
  });

  it("requires an explicit host allowlist and refuses redirects without following them", async () => {
    let calls = 0;
    const fetchImpl = async (_url, init) => {
      calls += 1;
      expect(init.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/file" },
      });
    };
    await expect(
      fetchOfficialFile({ url: "https://www.e-stat.go.jp/file", fetchImpl }),
    ).rejects.toMatchObject({ code: "file-host-allowlist-required" });
    await expect(
      fetchOfficialFile({
        url: "https://www.e-stat.go.jp/file",
        allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "file-http-error" });
    expect(calls).toBe(1);
  });

  it("retries only 429/5xx and transient network failures with bounded Retry-After", async () => {
    let calls = 0;
    const responses = [
      new Response("busy", { status: 429, headers: { "retry-after": "120" } }),
      new Response("temporary", { status: 503 }),
      new Response("ok"),
    ];
    const result = await fetchOfficialFile({
      url: "https://www.e-stat.go.jp/file",
      allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
      maxRetries: 2,
      retryBaseMs: 0,
      maxRetryAfterMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return responses.shift();
      },
    });
    expect(Buffer.from(result.bytes).toString()).toBe("ok");
    expect(calls).toBe(3);

    calls = 0;
    await expect(
      fetchOfficialFile({
        url: "https://www.e-stat.go.jp/file",
        allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
        maxRetries: 3,
        retryBaseMs: 0,
        maxRetryAfterMs: 0,
        fetchImpl: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      }),
    ).rejects.toMatchObject({ code: "file-http-error" });
    expect(calls).toBe(1);

    calls = 0;
    const recovered = await fetchOfficialFile({
      url: "https://www.e-stat.go.jp/file",
      allowedHosts: OFFICIAL_ESTAT_FILE_HOSTS,
      maxRetries: 1,
      retryBaseMs: 0,
      maxRetryAfterMs: 0,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("network private details");
        return new Response("ok");
      },
    });
    expect(Buffer.from(recovered.bytes).toString()).toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("refresh core", () => {
  function makeRegistry() {
    return validateRegistry({
      requiredAdapters: ["fixture"],
      sources: [
        {
          id: "fixture-source",
          required: true,
          adapterId: "fixture",
          identity: { kind: "file", statInfId: "000040499070", format: "xlsx" },
          title: "fixture table",
          classifications: ["all"],
          frequency: "monthly",
          unit: "index",
          baseline: "2020",
          period: { from: "2020-01", through: "latest-published" },
          revision: "full-history",
          outputs: ["canonical/data.csv", "canonical/data.raw", "canonical/data.metadata.json"],
          dependencies: [],
        },
      ],
    });
  }

  const makeAdapter =
    (semanticValue, data = "normalized-v1", raw = "raw-v1") =>
    async () => ({
      semanticValue,
      artifacts: [
        { path: "canonical/data.csv", bytes: Buffer.from(data) },
        { path: "canonical/data.raw", bytes: Buffer.from(raw) },
        {
          path: "canonical/data.metadata.json",
          bytes: Buffer.from(JSON.stringify({ fetchedAt: "volatile", raw })),
        },
      ],
      rawFetches: [{ name: "fixture-raw", bytes: Buffer.from(raw) }],
      coverage: { periods: 2 },
      validationSummary: { passed: true },
    });
  const fixtureQualityValidator = async () => ({ fixture: true });

  it("uses the typed identity variants and rejects cross-kind IDs", () => {
    expect(() =>
      validateRegistry({
        requiredAdapters: [],
        sources: [
          {
            id: "bad-source",
            required: true,
            identity: { kind: "api", statsDataId: "0004052037", statInfId: "000040482945" },
            title: "bad",
            classifications: ["all"],
            frequency: "monthly",
            unit: "index",
            baseline: "2020",
            period: { from: "a", through: "b" },
            revision: "latest",
            outputs: ["data.csv"],
            dependencies: [],
          },
        ],
      }),
    ).toThrow(/cannot use file identity fields/);
  });

  it("locks exclusively and allows safe relative paths only", async () => {
    const root = await temporaryRoot();
    const lock = path.join(root, "run.lock");
    const release = await acquireExclusiveLock(lock);
    await expect(acquireExclusiveLock(lock)).rejects.toMatchObject({ code: "refresh-locked" });
    await release();
    await expect(resolveContainedPath(root, "../outside")).rejects.toMatchObject({
      code: "path-not-allowlisted",
    });
    await symlink(os.tmpdir(), path.join(root, "link"));
    await expect(resolveContainedPath(root, "link/file.csv")).rejects.toMatchObject({
      code: "symlink-path",
    });
  });

  it("fails closed before source work if a required adapter is missing", async () => {
    const root = await temporaryRoot();
    await expect(
      runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map(),
        validate: fixtureQualityValidator,
        preflightChanges: async () => false,
      }),
    ).rejects.toMatchObject({
      code: "source-preflight-blocked",
      sources: [{ sourceId: "fixture-source", reason: "adapter-not-registered" }],
    });
    await expect(readFile(path.join(root, "canonical/data.csv"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports only safe reason codes for blocked sources before lock or adapter execution", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/data.csv"), "canonical-before");
    const registry = makeRegistry();
    registry.sources[0].blockedReason =
      "fixture-mapping-unverified: raw source contains PRIVATE-TOKEN";
    let fetchCalls = 0;
    let publishCalls = 0;
    const adapters = new Map([
      [
        "fixture",
        async () => {
          fetchCalls += 1;
          throw new Error("must not fetch");
        },
      ],
    ]);
    const failure = await runRefresh({
      root,
      registry,
      adapters,
      validate: fixtureQualityValidator,
      publish: async () => {
        publishCalls += 1;
      },
    }).catch((error) => error);
    expect(failure).toMatchObject({
      code: "source-preflight-blocked",
      sources: [{ sourceId: "fixture-source", reason: "fixture-mapping-unverified" }],
    });
    expect(failure.message).not.toContain("PRIVATE-TOKEN");
    expect(fetchCalls).toBe(0);
    expect(publishCalls).toBe(0);
    await expect(readFile(path.join(root, ".data-refresh/refresh.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(failure.reportPath).toMatch(/^\.data-refresh\/reports\/[A-Za-z0-9._-]+\.json$/);
    const reportText = await readFile(path.join(root, failure.reportPath), "utf8");
    const report = JSON.parse(reportText);
    expect(report).toMatchObject({
      plan: "shared-plan-52",
      planState: "blocked-before-fetch",
      status: "source-preflight-blocked",
      sources: [{ sourceId: "fixture-source", reason: "fixture-mapping-unverified" }],
    });
    expect(report.generatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(reportText).not.toContain("PRIVATE-TOKEN");
    expect(reportText).not.toContain("raw source");
    expect(await readFile(path.join(root, "canonical/data.csv"), "utf8")).toBe("canonical-before");
  });

  it("writes a per-source pending candidate report when adapter resolution fails", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const pending = Object.assign(new Error("candidate unavailable: PRIVATE-TOKEN"), {
      candidateResolutionPending: true,
      sourceId: "fixture-source",
      code: "candidate-resolution-pending",
    });
    const failure = await runRefresh({
      root,
      registry,
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw pending;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    expect(failure).toBe(pending);
    const reportText = await readFile(path.join(root, failure.reportPath), "utf8");
    expect(JSON.parse(reportText).sources).toEqual([
      {
        sourceId: "fixture-source",
        result: "blocked",
        sourceCandidate: { status: "pending", reasonCode: "candidate-resolution-pending" },
      },
    ]);
    expect(reportText).not.toContain("PRIVATE-TOKEN");
  });

  it("writes every source worker failure as a sanitized pending report", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const failure = Object.assign(new Error("SECRET and https://private.example/data"), {
      code: "bad code SECRET",
    });
    const thrown = await runRefresh({
      root,
      registry,
      adapters: new Map([
        [
          "fixture",
          async () => {
            throw failure;
          },
        ],
      ]),
      validate: fixtureQualityValidator,
    }).catch((error) => error);
    expect(thrown).toBe(failure);
    const reportText = await readFile(path.join(root, thrown.reportPath), "utf8");
    expect(JSON.parse(reportText)).toMatchObject({
      errorCode: "source-worker-failed",
      sources: [
        {
          sourceId: "fixture-source",
          result: "blocked",
          sourceCandidate: { status: "pending", reasonCode: "source-worker-failed" },
        },
      ],
    });
    expect(reportText).not.toContain("SECRET");
    expect(reportText).not.toContain("private.example");
  });

  it("keeps allowlisted CTI file candidate summaries and bounded output diff hashes", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const adapter = makeAdapter({ rows: 1 }, "data", "raw");
    const wrapped = async (input) => ({
      ...(await adapter(input)),
      reportSummary: {
        fileCandidates: [
          {
            identityStatInfId: "000040499070",
            catalogResourceId: "resource-1",
            legacyStatInfId: "000040499099",
            title: "世帯消費動向指数 基本系列",
            resourceTitle: "世帯消費動向指数 XLSX",
            format: "XLSX",
            releaseDate: "2026-09-01",
            lastModifiedDate: "2026-10-01",
            candidateCount: 2,
          },
        ],
        coverage: { start: "2002-01", end: "2026年7月", monthCount: 295, seriesCount: 66 },
        revisionCount: 1,
        revisionHash: "a".repeat(64),
        validationResult: "passed",
        outputHashes: [
          { path: "data/source/example.csv", oldSha256: "b".repeat(64), newSha256: "c".repeat(64) },
        ],
        unsafeUrl: "https://www.e-stat.go.jp/private",
      },
    });
    await runRefresh({
      root,
      registry,
      adapters: new Map([["fixture", wrapped]]),
      check: true,
      validate: fixtureQualityValidator,
    });
    const reportFiles = (await readdir(path.join(root, ".data-refresh"))).filter((name) =>
      name.endsWith(".json"),
    );
    const reportText = await readFile(path.join(root, ".data-refresh", reportFiles[0]), "utf8");
    const candidate = JSON.parse(reportText).sources[0].sourceCandidate;
    expect(candidate.fileCandidates).toMatchObject([
      { identityStatInfId: "000040499070", catalogResourceId: "resource-1", candidateCount: 2 },
    ]);
    expect(candidate).toMatchObject({
      revisionCount: 1,
      revisionHash: "a".repeat(64),
      validationResult: "passed",
    });
    expect(candidate.outputHashes).toEqual([
      { path: "data/source/example.csv", oldSha256: "b".repeat(64), newSha256: "c".repeat(64) },
    ]);
    expect(reportText).not.toContain("unsafeUrl");
    expect(reportText).not.toContain("private");
  });

  it("fails closed without writing a blocked report through a symlinked report directory", async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await mkdir(path.join(root, ".data-refresh"), { recursive: true });
    await symlink(outside, path.join(root, ".data-refresh/reports"));
    const registry = makeRegistry();
    registry.sources[0].blockedReason = "fixture-identity-unverified";
    let fetchCalls = 0;
    const adapters = new Map([
      [
        "fixture",
        async () => {
          fetchCalls += 1;
          return {};
        },
      ],
    ]);
    await expect(
      runRefresh({ root, registry, adapters, validate: fixtureQualityValidator }),
    ).rejects.toMatchObject({ code: "symlink-path" });
    expect(fetchCalls).toBe(0);
    expect(await readFile(path.join(outside, "refresh-report.json")).catch(() => null)).toBeNull();
    await expect(readFile(path.join(root, ".data-refresh/refresh.lock"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("requires an explicit quality validator and runs it against all staged source results", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const adapters = new Map([["fixture", makeAdapter({ values: [1, 2] })]]);
    await expect(
      runRefresh({ root, registry, adapters, preflightChanges: async () => false }),
    ).rejects.toMatchObject({ code: "quality-validator-required" });
    let validationInput;
    const report = await runRefresh({
      root,
      registry,
      adapters,
      validate: async (input) => {
        validationInput = input;
        return {
          fixture:
            input.sourceResults.length === 1 &&
            input.sourceResults[0].result.artifacts.length === 3,
        };
      },
      preflightChanges: async () => false,
    });
    expect(validationInput.stageRoot).toBeTruthy();
    expect(report.quality).toEqual({ fixture: true });
  });

  it("reports only allowlisted CTI revision counts, samples, and hashes", async () => {
    const root = await temporaryRoot();
    const result = await runRefresh({
      root,
      registry: makeRegistry(),
      adapters: new Map([
        [
          "fixture",
          async () => ({
            semanticValue: { revision: true },
            artifacts: [
              { path: "canonical/data.csv", bytes: Buffer.from("data") },
              { path: "canonical/data.raw", bytes: Buffer.from("raw") },
              { path: "canonical/data.metadata.json", bytes: Buffer.from("{}") },
            ],
            revisionAudit: {
              source_1: {
                overlapCount: 3,
                changedObservationCount: 1,
                changedValueCount: 2,
                sha256: "a".repeat(64),
                previousSha256: "b".repeat(64),
                sourceSha256: "c".repeat(64),
                changedSample: [
                  {
                    seriesIndex: 4,
                    month: "2025-01",
                    previousValue: "secret-old",
                    sourceValue: "secret-new",
                  },
                ],
                rawBytes: "secret-bytes",
              },
            },
          }),
        ],
      ]),
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    });
    expect(result.sources[0].revisionAudit).toEqual([
      {
        sourceId: "source_1",
        overlapCount: 3,
        changedObservationCount: 1,
        changedValueCount: 2,
        sha256: "a".repeat(64),
        previousSha256: "b".repeat(64),
        sourceSha256: "c".repeat(64),
        changedSample: [{ seriesIndex: 4, month: "2025-01" }],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("does not publish staged outputs when the quality validator fails", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/data.csv"), "canonical-before");
    await expect(
      runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([["fixture", makeAdapter({ values: [9] }, "staged-after")]]),
        validate: async () => {
          throw Object.assign(new Error("suite failed"), { code: "runtime-quality-suite-failed" });
        },
        preflightChanges: async () => false,
      }),
    ).rejects.toMatchObject({ code: "runtime-quality-suite-failed" });
    expect(await readFile(path.join(root, "canonical/data.csv"), "utf8")).toBe("canonical-before");
  });

  it("preserves canonical raw and metadata on semantic no-op and check mode never publishes", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const adapters = new Map([["fixture", makeAdapter({ values: [1, 2] })]]);
    const common = {
      root,
      registry,
      adapters,
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    };
    await runRefresh(common);
    const initialRaw = await readFile(path.join(root, "canonical/data.raw"), "utf8");
    const initialMetadata = await readFile(path.join(root, "canonical/data.metadata.json"), "utf8");
    const fixedTime = new Date("2024-01-02T03:04:05.000Z");
    await utimes(path.join(root, "canonical/data.raw"), fixedTime, fixedTime);
    await utimes(path.join(root, "canonical/data.metadata.json"), fixedTime, fixedTime);
    const rawMtime = (await stat(path.join(root, "canonical/data.raw"))).mtimeMs;
    const metadataMtime = (await stat(path.join(root, "canonical/data.metadata.json"))).mtimeMs;
    const unchanged = await runRefresh({
      ...common,
      adapters: new Map([
        ["fixture", makeAdapter({ values: [1, 2] }, "normalized-v1", "raw-repacked")],
      ]),
    });
    expect(unchanged.status).toBe("unchanged");
    expect(await readFile(path.join(root, "canonical/data.raw"), "utf8")).toBe(initialRaw);
    expect(await readFile(path.join(root, "canonical/data.metadata.json"), "utf8")).toBe(
      initialMetadata,
    );
    expect((await stat(path.join(root, "canonical/data.raw"))).mtimeMs).toBe(rawMtime);
    expect((await stat(path.join(root, "canonical/data.metadata.json"))).mtimeMs).toBe(
      metadataMtime,
    );

    const check = await runRefresh({
      ...common,
      check: true,
      adapters: new Map([
        ["fixture", makeAdapter({ values: [1, 2, 3] }, "new-canonical", "new-raw")],
      ]),
    });
    expect(check.mode).toBe("check");
    expect(check.status).toBe("validated");
    expect(await readFile(path.join(root, "canonical/data.csv"), "utf8")).toBe("normalized-v1");
  });

  it("fails closed when an unchanged source has a missing or modified canonical output", async () => {
    const root = await temporaryRoot();
    const registry = makeRegistry();
    const common = {
      root,
      registry,
      adapters: new Map([["fixture", makeAdapter({ values: [1, 2] })]]),
      validate: fixtureQualityValidator,
      preflightChanges: async () => false,
    };
    await runRefresh(common);
    await rm(path.join(root, "canonical/data.raw"));
    await expect(runRefresh(common)).rejects.toMatchObject({ code: "canonical-output-missing" });
    await writeFile(path.join(root, "canonical/data.raw"), "restored");
    await expect(runRefresh(common)).rejects.toMatchObject({ code: "canonical-output-modified" });
  });

  it("refuses check mode when an unfinished journal exists without changing canonical files", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, ".data-refresh"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/data.csv"), "old");
    await writeFile(
      path.join(root, ".data-refresh/publish-journal.json"),
      JSON.stringify({ version: 1, state: "publishing", entries: [] }),
    );
    await expect(
      runRefresh({
        root,
        registry: makeRegistry(),
        adapters: new Map([["fixture", makeAdapter({ values: [] })]]),
        validate: fixtureQualityValidator,
        check: true,
        preflightChanges: async () => false,
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(root, "canonical/data.csv"), "utf8")).toBe("old");
  });

  it("rolls back all earlier renames if publish fails partway through", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, ".data-refresh/staging"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await mkdir(path.join(root, ".data-refresh/backups"), { recursive: true });
    await writeFile(path.join(root, "canonical/a.csv"), "old-a");
    await writeFile(path.join(root, "canonical/b.csv"), "old-b");
    await writeFile(path.join(root, ".data-refresh/staging/a.new"), "new-a");
    await writeFile(path.join(root, ".data-refresh/staging/b.new"), "new-b");
    await expect(
      publishArtifacts({
        root,
        workDir: path.join(root, ".data-refresh/staging"),
        journalPath: path.join(root, ".data-refresh/publish-journal.json"),
        backupRoot: path.join(root, ".data-refresh/backups"),
        registry: registryFor(["canonical/a.csv", "canonical/b.csv"]),
        artifacts: [
          { path: "canonical/a.csv", stagedPath: ".data-refresh/staging/a.new" },
          { path: "canonical/b.csv", stagedPath: ".data-refresh/staging/b.new" },
        ],
        onRename: async (index) => {
          if (index === 0) throw new Error("fixture interruption");
        },
      }),
    ).rejects.toMatchObject({ code: "publish-failed" });
    expect(await readFile(path.join(root, "canonical/a.csv"), "utf8")).toBe("old-a");
    expect(await readFile(path.join(root, "canonical/b.csv"), "utf8")).toBe("old-b");
    expect(
      await recoverJournal({
        root,
        journalPath: path.join(root, ".data-refresh/publish-journal.json"),
        backupRoot: path.join(root, ".data-refresh/backups"),
      }),
    ).toBe(false);
  });

  it("does not remove a target for a journal entry that was never published", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    await mkdir(path.join(work, "staging"), { recursive: true });
    await mkdir(path.join(work, "backups"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/untouched.csv"), "keep");
    await writeFile(path.join(work, "staging/untouched.new"), "new");
    const journalPath = path.join(work, "publish-journal.json");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, `backups/${id}`), { recursive: true });
    const entries = [
      journalEntry({
        path: "canonical/untouched.csv",
        staged: ".data-refresh/staging/untouched.new",
        backup: `.data-refresh/backups/${id}/0.bak`,
        targetBytes: "new",
      }),
    ];
    await writeFile(journalPath, JSON.stringify(journalFor(id, "publishing", entries)));
    await recoverJournal({
      root,
      journalPath,
      backupRoot: path.join(work, "backups"),
      registry: registryFor(["canonical/untouched.csv"]),
    });
    expect(await readFile(path.join(root, "canonical/untouched.csv"), "utf8")).toBe("keep");
  });

  it("recovers an atomic rename whose published marker was not persisted", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    await mkdir(path.join(work, "staging"), { recursive: true });
    await mkdir(path.join(work, "backups"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/new.csv"), "published");
    const journalPath = path.join(work, "publish-journal.json");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, `backups/${id}`), { recursive: true });
    const entries = [
      journalEntry({
        path: "canonical/new.csv",
        staged: ".data-refresh/staging/new.tmp",
        backup: `.data-refresh/backups/${id}/0.bak`,
        targetBytes: "published",
        intent: true,
      }),
    ];
    await writeFile(journalPath, JSON.stringify(journalFor(id, "publishing", entries)));
    await recoverJournal({
      root,
      journalPath,
      backupRoot: path.join(work, "backups"),
      registry: registryFor(["canonical/new.csv"]),
    });
    await expect(readFile(path.join(root, "canonical/new.csv"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      await recoverJournal({ root, journalPath, backupRoot: path.join(work, "backups") }),
    ).toBe(false);
  });

  it("keeps committed journal and backups untouched when a target hash is invalid", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, `backups/${id}`), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/item.csv"), "tampered");
    await writeFile(path.join(work, `backups/${id}/0.bak`), "old");
    const journalPath = path.join(work, "publish-journal.json");
    const entry = journalEntry({
      path: "canonical/item.csv",
      staged: ".data-refresh/staging/item.new",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "published",
      existed: true,
      intent: true,
      published: true,
    });
    const backupInfo = await stat(path.join(work, `backups/${id}/0.bak`));
    entry.metadata = {
      mode: backupInfo.mode & 0o7777,
      uid: backupInfo.uid,
      gid: backupInfo.gid,
      atimeMs: Math.trunc(backupInfo.atimeMs),
      mtimeMs: Math.trunc(backupInfo.mtimeMs),
    };
    entry.backupHash = sha256("old");
    await writeFile(journalPath, JSON.stringify(journalFor(id, "committed", [entry])));
    await expect(
      recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/item.csv"]),
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(root, "canonical/item.csv"), "utf8")).toBe("tampered");
    expect(await readFile(path.join(work, `backups/${id}/0.bak`), "utf8")).toBe("old");
    expect(await readFile(journalPath, "utf8")).toContain("committed");
  });

  it("restores original mode, ownership, and access and modification times when rolling back", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    await mkdir(path.join(work, "staging"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    const target = path.join(root, "canonical/item.csv");
    await writeFile(target, "old");
    await chmod(target, 0o640);
    await utimes(target, 1_704_164_645.123456, 1_704_164_645.654321);
    const original = await stat(target);
    await writeFile(path.join(work, "staging/item.new"), "new");
    await expect(
      publishArtifacts({
        root,
        workDir: path.join(work, "staging"),
        journalPath: path.join(work, "publish-journal.json"),
        backupRoot: path.join(work, "backups"),
        artifacts: [{ path: "canonical/item.csv", stagedPath: ".data-refresh/staging/item.new" }],
        registry: registryFor(["canonical/item.csv"]),
        onRename: async () => {
          throw new Error("interrupt");
        },
      }),
    ).rejects.toMatchObject({ code: "publish-failed" });
    const restored = await stat(target);
    expect(restored.mode & 0o777).toBe(0o640);
    expect(restored.uid).toBe(original.uid);
    expect(restored.gid).toBe(original.gid);
    expect(restored.atimeMs).toBeCloseTo(original.atimeMs, 2);
    expect(restored.mtimeMs).toBeCloseTo(original.mtimeMs, 2);
  });

  it("rejects a publishing journal whose published entries are not a prefix", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups", id), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/b.csv"), "published");
    const journalPath = path.join(work, "publish-journal.json");
    const first = journalEntry({
      path: "canonical/a.csv",
      staged: ".data-refresh/staging/a.new",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "new-a",
    });
    const second = journalEntry({
      path: "canonical/b.csv",
      staged: ".data-refresh/staging/b.new",
      backup: `.data-refresh/backups/${id}/1.bak`,
      targetBytes: "published",
      intent: true,
      published: true,
    });
    await writeFile(journalPath, JSON.stringify(journalFor(id, "publishing", [first, second])));
    await expect(
      recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/a.csv", "canonical/b.csv"]),
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(root, "canonical/b.csv"), "utf8")).toBe("published");
    expect(await readFile(journalPath, "utf8")).toContain("publishing");
  });

  it("fails closed when an uncommitted journal is missing an original backup", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups", id), { recursive: true });
    await mkdir(path.join(work, "staging"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/item.csv"), "original");
    await writeFile(path.join(work, "staging/item.new"), "staged");
    const backupPath = path.join(work, "backups", id, "0.bak");
    const originalInfo = await stat(path.join(root, "canonical/item.csv"));
    const entry = journalEntry({
      path: "canonical/item.csv",
      staged: ".data-refresh/staging/item.new",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "staged",
      existed: true,
    });
    entry.metadata = {
      mode: originalInfo.mode & 0o7777,
      uid: originalInfo.uid,
      gid: originalInfo.gid,
      atimeMs: originalInfo.atimeMs,
      mtimeMs: originalInfo.mtimeMs,
    };
    entry.backupHash = sha256("original");
    const journalPath = path.join(work, "publish-journal.json");
    await writeFile(journalPath, JSON.stringify(journalFor(id, "publishing", [entry])));
    await expect(
      recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/item.csv"]),
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(root, "canonical/item.csv"), "utf8")).toBe("original");
    expect(await readFile(journalPath, "utf8")).toContain("publishing");
    await expect(readFile(backupPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("resumes committed cleanup when some backups were already removed", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const backupDirectory = path.join(work, "backups", id);
    await mkdir(backupDirectory, { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    const entries = [];
    for (const [index, name] of ["a.csv", "b.csv"].entries()) {
      const original = path.join(backupDirectory, `${index}.bak`);
      await writeFile(original, `old-${name}`);
      const info = await stat(original);
      const entry = journalEntry({
        path: `canonical/${name}`,
        staged: `.data-refresh/staging/${name}.new`,
        backup: `.data-refresh/backups/${id}/${index}.bak`,
        targetBytes: `new-${name}`,
        existed: true,
        intent: true,
        published: true,
      });
      entry.metadata = {
        mode: info.mode & 0o7777,
        uid: info.uid,
        gid: info.gid,
        atimeMs: info.atimeMs,
        mtimeMs: info.mtimeMs,
      };
      entry.backupHash = sha256(`old-${name}`);
      entries.push(entry);
      await writeFile(path.join(root, entry.path), `new-${name}`);
    }
    await rm(path.join(backupDirectory, "0.bak"));
    const journalPath = path.join(work, "publish-journal.json");
    await writeFile(journalPath, JSON.stringify(journalFor(id, "committed", entries)));
    expect(
      await recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(entries.map((entry) => entry.path)),
      }),
    ).toBe(true);
    await expect(readFile(journalPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(backupDirectory, "1.bak"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(path.join(root, "canonical/a.csv"), "utf8")).toBe("new-a.csv");
    expect(await readFile(path.join(root, "canonical/b.csv"), "utf8")).toBe("new-b.csv");
  });

  it("resumes committed cleanup when the transaction backup directory is already gone", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups"), { recursive: true });
    await mkdir(path.join(root, "canonical"), { recursive: true });
    await writeFile(path.join(root, "canonical/item.csv"), "published");
    const entry = journalEntry({
      path: "canonical/item.csv",
      staged: ".data-refresh/staging/item.new",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "published",
      intent: true,
      published: true,
    });
    const journalPath = path.join(work, "publish-journal.json");
    await writeFile(journalPath, JSON.stringify(journalFor(id, "committed", [entry])));
    expect(
      await recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/item.csv"]),
      }),
    ).toBe(true);
    await expect(readFile(journalPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(root, "canonical/item.csv"), "utf8")).toBe("published");
  });

  it("leaves malformed path-escape journals and backups untouched", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups"), { recursive: true });
    await writeFile(path.join(work, "backups/marker"), "keep");
    const journalPath = path.join(work, "publish-journal.json");
    const entry = journalEntry({
      path: "../outside",
      staged: ".data-refresh/staging/x",
      backup: `.data-refresh/backups/${id}/0.bak`,
      targetBytes: "x",
    });
    await writeFile(
      journalPath,
      JSON.stringify(journalFor(id, "publishing", [entry], ["canonical/item.csv"])),
    );
    await expect(
      recoverJournal({
        root,
        journalPath,
        backupRoot: path.join(work, "backups"),
        registry: registryFor(["canonical/item.csv"]),
      }),
    ).rejects.toMatchObject({ code: "recovery-required" });
    expect(await readFile(path.join(work, "backups/marker"), "utf8")).toBe("keep");
    expect(await readFile(journalPath, "utf8")).toContain("../outside");
  });

  it("limits publication to the exact registry outputs, including ordinary data and metadata paths", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, ".data-refresh/staging"), { recursive: true });
    await writeFile(path.join(root, ".data-refresh/staging/new"), "payload");
    for (const target of ["data/source/cpi-2025-series-map.csv", "data/unmanaged.csv"]) {
      await expect(
        publishArtifacts({
          root,
          workDir: path.join(root, ".data-refresh/staging"),
          journalPath: path.join(root, ".data-refresh/publish-journal.json"),
          backupRoot: path.join(root, ".data-refresh/backups"),
          registry: registryFor(["canonical/allowed.csv"]),
          artifacts: [{ path: target, stagedPath: ".data-refresh/staging/new" }],
        }),
      ).rejects.toMatchObject({ code: "path-not-allowlisted" });
    }
  });

  it("rejects forged, duplicate, metadata, and undeclared data targets during recovery", async () => {
    const root = await temporaryRoot();
    const work = path.join(root, ".data-refresh");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    await mkdir(path.join(work, "backups", id), { recursive: true });
    const journalPath = path.join(work, "publish-journal.json");
    const cases = [
      { label: "forged target", paths: ["data/unmanaged.csv"], current: ["canonical/allowed.csv"] },
      {
        label: "forged identity",
        paths: ["canonical/allowed.csv"],
        current: ["canonical/allowed.csv"],
        forgedIdentity: true,
      },
      {
        label: "metadata target",
        paths: ["data/source/cpi_data2025_long.metadata.json"],
        current: ["canonical/allowed.csv"],
      },
      {
        label: "ordinary data target",
        paths: ["data/source/unmanaged.csv"],
        current: ["canonical/allowed.csv"],
      },
      {
        label: "duplicate target",
        paths: ["canonical/allowed.csv", "canonical/allowed.csv"],
        current: ["canonical/allowed.csv"],
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const entries = testCase.paths.map((target, entryIndex) =>
        journalEntry({
          path: target,
          staged: `.data-refresh/staging/${index}-${entryIndex}.new`,
          backup: `.data-refresh/backups/${id}/${entryIndex}.bak`,
          targetBytes: "payload",
        }),
      );
      const declared =
        testCase.label === "forged target" ? ["data/unmanaged.csv"] : ["canonical/allowed.csv"];
      const journal = journalFor(id, "publishing", entries, declared);
      if (testCase.forgedIdentity) journal.sourceAllowlist[0].identity.statInfId = "00000002";
      await writeFile(journalPath, JSON.stringify(journal));
      await expect(
        recoverJournal({
          root,
          journalPath,
          backupRoot: path.join(work, "backups"),
          registry: registryFor(testCase.current),
        }),
      ).rejects.toMatchObject({ code: "recovery-required" });
      await rm(journalPath);
    }
  });
});
