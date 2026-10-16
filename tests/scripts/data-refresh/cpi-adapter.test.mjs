import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cpiAdapter, resolveCpiCandidate } from "../../../scripts/data-refresh/adapters/cpi.mjs";
import { runRefresh } from "../../../scripts/data-refresh/runner.mjs";

const roots = [];
const repo = process.cwd();
async function makeRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "data-refresh-cpi-"));
  roots.push(root);
  await mkdir(path.join(root, "data/source"), { recursive: true });
  for (const file of [
    "cpi_data2025_long.metadata.json",
    "cpi-2025-series-map.csv",
    "cpi-2025-official-series.csv",
    "contribution2025.csv",
  ]) {
    await copyFile(path.join(repo, "data/source", file), path.join(root, "data/source", file));
  }
  const mapText = await readFile(path.join(root, "data/source/cpi-2025-series-map.csv"), "utf8");
  const keys = mapText
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.match(/^"[^"]+","([^"]+)"/)[1]);
  const months = [];
  for (let year = 1970; year <= 2026; year += 1) {
    const lastMonth = year === 2026 ? 7 : 12;
    for (let month = 1; month <= lastMonth; month += 1)
      months.push(`${year}${String(month).padStart(2, "0")}`);
  }
  const canonicalCsv = `${["年月", ...keys].join(",")}\n${months.map((code) => [`${code.slice(0, 4)}年${Number(code.slice(4))}月`, ...keys.map(() => "27.0")].join(",")).join("\n")}\n`;
  await writeFile(path.join(root, "data/source/cpi_data2025_long.csv"), canonicalCsv);
  const metadataPath = path.join(root, "data/source/cpi_data2025_long.metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.csvSha256 = createHash("sha256").update(canonicalCsv).digest("hex");
  metadata.period = { start: "1970年1月", end: "2026年7月", monthlyRows: 679 };
  await writeFile(metadataPath, JSON.stringify(metadata));
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const source = {
  id: "cpi-long",
  identity: { kind: "api", statsDataId: "0004052037" },
  distributionIdentity: { kind: "file", statInfId: "000040482945", format: "csv" },
  candidateQuery: { searchWord: "消費者物価指数", statsField: "2" },
  candidateIdentity: {
    expectedStatsDataId: "0004052037",
    statisticsIncludes: "消費者物価指数",
    titleIncludes: ["消費者物価指数", "2025年基準"],
    cycleIncludes: ["月次", "毎月"],
    surveyYear: "2025",
  },
};

const cpiCandidate = (overrides = {}) => ({
  "@id": "0004052037",
  STAT_NAME: "消費者物価指数",
  TITLE: "消費者物価指数 2025年基準",
  CYCLE: "月次",
  SURVEY_DATE: "2025年",
  OPEN_DATE: "2026年8月",
  UPDATED_DATE: "2026年9月",
  ...overrides,
});
const cpiCatalog = () => ({
  datasets: [
    {
      TITLE: "消費者物価指数 2025年基準 配布データ",
      RELEASE_DATE: "2026-08-21",
      LAST_MODIFIED_DATE: "2026-09-19",
      RESOURCE: {
        "@id": "cpi-distribution-resource-1",
        TITLE: "消費者物価指数 2025年基準 月次 CSV",
        FORMAT: "CSV",
        URL: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=1&statInfId=000040482945",
      },
    },
  ],
});

async function apiFixtures(root, endCode = "202607") {
  const lines = (await readFile(path.join(root, "data/source/cpi-2025-series-map.csv"), "utf8"))
    .trim()
    .split("\n")
    .slice(1);
  const categories = lines.map((line) => {
    const [, code, name] = line.match(/^"([^"]+)","([^"]+)","([^"]+)"/);
    return { "@code": code, "@name": name };
  });
  const times = [];
  const endYear = Number(endCode.slice(0, 4));
  const endMonth = Number(endCode.slice(4));
  for (let year = 1970; year <= endYear; year += 1) {
    const lastMonth = year === endYear ? endMonth : 12;
    for (let month = 1; month <= lastMonth; month += 1) {
      times.push(`${year}${String(month).padStart(2, "0")}`);
    }
  }
  return {
    metadataPayload: {
      GET_META_INFO: {
        RESULT: { STATUS: 0 },
        METADATA_INF: {
          TABLE_INF: {
            "@id": "0004052037",
            TITLE: { $: "消費者物価指数 2025年基準" },
            CLASS_INF: {
              CLASS_OBJ: [
                { "@id": "area", CLASS: { "@code": "00000", "@name": "全国" } },
                { "@id": "tab", CLASS: { "@code": "1", "@name": "指数" } },
                { "@id": "cat01", CLASS: categories },
                {
                  "@id": "time",
                  CLASS: [
                    ...times.map((code) => ({
                      "@code": code,
                      "@name": `${code.slice(0, 4)}年${Number(code.slice(4))}月`,
                    })),
                    { "@code": "2025", "@name": "2025年平均" },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    records: [
      ...categories.flatMap(({ "@code": code }) =>
        times.map((time) => ({
          "@area": "00000",
          "@tab": "1",
          "@cat01": code,
          "@time": time,
          "@unit": "2025年=100",
          $: time.startsWith("2025") ? "100" : "27.0",
        })),
      ),
      { "@area": "00000", "@tab": "1", "@cat01": "0001", "@time": "2025", $: "100.0" },
    ],
  };
}

describe("CPI refresh adapter", () => {
  it("validates table dimensions and builds the canonical CSV from injected fixtures", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const rawPages = [Buffer.from('{"page":1}'), Buffer.from('{"page":2}')];
    const result = await cpiAdapter({
      source,
      root,
      now: () => new Date("2026-10-16T00:00:00.000Z"),
      transportConfig: { appId: "fixture-secret-must-not-be-reported" },
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => metadataPayload,
      fetchApi: async () => ({
        records,
        pageCount: 2,
        declaredTotal: records.length,
        rawFetches: rawPages.map((bytes, index) => ({
          name: `estat-cpi-stats-0004052037-page-${index + 1}`,
          bytes,
        })),
      }),
    });
    expect(result.artifacts.map(({ path }) => path)).toEqual([
      "data/source/cpi_data2025_long.csv",
      "data/source/cpi_data2025_long.metadata.json",
      "data/source/cpi-2025-series-map.csv",
      "data/source/contribution2025.csv",
      "data/source/cpi-2025-official-series.csv",
    ]);
    const csv = result.artifacts[0].bytes.toString("utf8");
    const mappedNames = (
      await readFile(path.join(root, "data/source/cpi-2025-series-map.csv"), "utf8")
    )
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.match(/^"[^"]+","([^"]+)"/)[1]);
    expect(csv.split("\n")[0]).toBe(["年月", ...mappedNames].join(","));
    expect(csv.split("\n")[1]).toBe(["1970年1月", ...mappedNames.map(() => "27.0")].join(","));
    const metadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(metadata.status).toBe("ready");
    expect(metadata.refreshApiRetrievalConditions).toMatchObject({
      cdArea: "00000",
      cdTab: "1",
      cdTimeFrom: "197001",
    });
    expect(metadata.period).toEqual({ start: "1970年1月", end: "2026年7月", monthlyRows: 679 });
    expect(metadata.distributionSourceIdentity.identityMarkers).toEqual({
      table: ["消費者物価指数"],
      category: [],
      period: ["月次"],
      year: ["2025"],
    });
    expect(metadata.revisionSummary.count).toBeGreaterThan(0);
    expect(metadata.revisionSummary.samples.length).toBeGreaterThan(0);
    expect(result.artifacts[2].bytes).toEqual(
      await readFile(path.join(root, "data/source/cpi-2025-series-map.csv")),
    );
    expect(result.artifacts[3].bytes).toEqual(
      await readFile(path.join(root, "data/source/contribution2025.csv")),
    );
    expect(result.artifacts[4].bytes.toString("utf8").split("\n")[0]).toBe("code,name");
    expect(result.semanticValue).toBeDefined();
    expect(result.rawFetches).toEqual(
      rawPages.map((bytes, index) => ({
        name: `estat-cpi-stats-0004052037-page-${index + 1}`,
        bytes,
      })),
    );
    expect(
      result.rawFetches.map(({ bytes }) => createHash("sha256").update(bytes).digest("hex")),
    ).toEqual(rawPages.map((bytes) => createHash("sha256").update(bytes).digest("hex")));
    expect(JSON.stringify(result.rawFetches.map(({ name }) => name))).not.toContain(
      "fixture-secret",
    );

    const registry = {
      requiredAdapters: ["cpi"],
      sources: [
        {
          id: "cpi-long",
          required: true,
          adapterId: "cpi",
          identity: source.identity,
          title: "CPI fixture",
          classifications: ["2025-base categories"],
          frequency: "monthly",
          unit: "index",
          baseline: "2025=100",
          period: { from: "197001", through: "latest-published" },
          revision: "overlap-audit",
          outputs: result.artifacts.map(({ path: output }) => output),
          dependencies: [],
        },
      ],
    };
    await runRefresh({
      root,
      registry,
      adapters: new Map([["cpi", async () => result]]),
      check: true,
      validate: async () => ({ ok: true }),
      preflightChanges: async () => false,
    });
    const reportFiles = (await readdir(path.join(root, ".data-refresh"))).filter((name) =>
      name.endsWith(".json"),
    );
    const report = JSON.parse(
      await readFile(path.join(root, ".data-refresh", reportFiles[0]), "utf8"),
    );
    expect(report.sources[0].rawFetches).toEqual(
      rawPages.map((bytes, index) => ({
        name: `estat-cpi-stats-0004052037-page-${index + 1}`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.byteLength,
      })),
    );
    expect(JSON.stringify(report)).not.toContain("fixture-secret");
    expect(JSON.stringify(report)).not.toContain("page1");
    expect(JSON.stringify(report)).not.toContain("page2");
    expect(report.sources[0].sourceCandidate).toMatchObject({
      candidateCount: 1,
      selectedSourceId: "0004052037",
      apiStatsDataId: "0004052037",
      fileStatInfId: "000040482945",
      fileCandidateCount: 1,
      fileFormat: "CSV",
      coverageStart: "197001",
      coverageEnd: "202607",
      validationResult: "passed",
    });
    expect(report.sources[0].sourceCandidate.outputHashes).toHaveLength(5);
    expect(JSON.stringify(report.sources[0].sourceCandidate)).not.toContain("fixture-secret");
  });

  it("fails closed when the API response cannot be cloned for raw hash evidence", async () => {
    const root = await makeRoot();
    const { metadataPayload } = await apiFixtures(root);
    const failure = await cpiAdapter({
      source,
      root,
      transportConfig: { appId: "fixture-secret" },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => metadataPayload,
      }),
    }).catch((error) => error);
    expect(failure).toMatchObject({ code: "cpi-api-raw-capture-unavailable" });
    expect(failure.message).not.toContain("fixture-secret");
    expect(failure.message).not.toContain("api.e-stat.go.jp");
  });

  it("captures and reports the metadata, every paged response, and retry response by hash only", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const expectedResponses = [];
    const pageSize = Math.ceil(records.length / 2);
    let retriedFirstPage = false;
    const fetchImpl = async (input) => {
      const requestUrl = new URL(input);
      if (requestUrl.pathname.endsWith("/getStatsList")) {
        const bytes = Buffer.from(
          JSON.stringify({
            GET_STATS_LIST: {
              RESULT: { STATUS: "0" },
              DATALIST_INF: {
                RESULT_INF: { TOTAL_NUMBER: "1", FROM_NUMBER: "1", TO_NUMBER: "1" },
                TABLE_INF: cpiCandidate(),
              },
            },
          }),
        );
        expectedResponses.push({ name: "estat-cpi-list-candidates-page-1", bytes });
        return new Response(bytes, { headers: { "content-type": "application/json" } });
      }
      if (requestUrl.pathname.endsWith("/getDataCatalog")) {
        const bytes = Buffer.from(
          JSON.stringify({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: "0" },
              DATA_CATALOG: {
                RESULT_INF: { TOTAL_NUMBER: "1", FROM_NUMBER: "1", TO_NUMBER: "1" },
                DATASET: cpiCatalog().datasets[0],
              },
            },
          }),
        );
        expectedResponses.push({ name: "estat-cpi-catalog-candidates-page-1", bytes });
        return new Response(bytes, { headers: { "content-type": "application/json" } });
      }
      if (requestUrl.pathname.endsWith("/getMetaInfo")) {
        const bytes = Buffer.from(JSON.stringify(metadataPayload));
        expectedResponses.push({ name: "estat-cpi-meta-0004052037-page-1", bytes });
        return new Response(bytes, { headers: { "content-type": "application/json" } });
      }
      const start = Number(requestUrl.searchParams.get("startPosition"));
      if (start === 1 && !retriedFirstPage) {
        retriedFirstPage = true;
        const bytes = Buffer.from("temporary retry response");
        expectedResponses.push({ name: "estat-cpi-stats-0004052037-page-1", bytes });
        return new Response(bytes, { status: 429 });
      }
      const page = records.slice(start - 1, start - 1 + pageSize);
      const end = start + page.length - 1;
      const payload = {
        GET_STATS_DATA: {
          RESULT: { STATUS: 0 },
          STATISTICAL_DATA: {
            RESULT_INF: {
              TOTAL_NUMBER: records.length,
              FROM_NUMBER: start,
              TO_NUMBER: end,
              ...(end < records.length ? { NEXT_KEY: String(end + 1) } : {}),
            },
            DATA_INF: { VALUE: page },
          },
        },
      };
      const bytes = Buffer.from(JSON.stringify(payload));
      const pageNumber = start === 1 ? 1 : 2;
      expectedResponses.push({ name: `estat-cpi-stats-0004052037-page-${pageNumber}`, bytes });
      return new Response(bytes, { headers: { "content-type": "application/json" } });
    };
    const result = await cpiAdapter({
      source,
      root,
      transportConfig: { appId: "fixture-secret" },
      fetchImpl,
      apiLimit: pageSize,
      now: () => new Date("2026-10-16T00:00:00.000Z"),
    });
    expect(result.rawFetches.map(({ name }) => name)).toEqual(
      expectedResponses.map(({ name }) => name),
    );
    expect(
      result.rawFetches.map(({ bytes }) => createHash("sha256").update(bytes).digest("hex")),
    ).toEqual(
      expectedResponses.map(({ bytes }) => createHash("sha256").update(bytes).digest("hex")),
    );

    const registry = {
      requiredAdapters: ["cpi"],
      sources: [
        {
          id: "cpi-long",
          required: true,
          adapterId: "cpi",
          identity: source.identity,
          title: "CPI fixture",
          classifications: ["2025-base categories"],
          frequency: "monthly",
          unit: "index",
          baseline: "2025=100",
          period: { from: "197001", through: "latest-published" },
          revision: "overlap-audit",
          outputs: result.artifacts.map(({ path: output }) => output),
          dependencies: [],
        },
      ],
    };
    await runRefresh({
      root,
      registry,
      adapters: new Map([["cpi", async () => result]]),
      check: true,
      validate: async () => ({ ok: true }),
      preflightChanges: async () => false,
    });
    const reportName = (await readdir(path.join(root, ".data-refresh"))).find((name) =>
      name.endsWith(".json"),
    );
    const reportText = await readFile(path.join(root, ".data-refresh", reportName), "utf8");
    const report = JSON.parse(reportText);
    expect(report.sources[0].rawFetches).toEqual(
      expectedResponses.map(({ name, bytes }) => ({
        name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.byteLength,
      })),
    );
    expect(reportText).not.toContain("fixture-secret");
    expect(reportText).not.toContain("temporary retry response");
    expect(reportText).not.toContain('"@area"');
  });

  it("rejects unproven baseline metadata before fetching observations", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    let dataCalls = 0;
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => ({
          ...metadataPayload,
          GET_META_INFO: {
            ...metadataPayload.GET_META_INFO,
            METADATA_INF: {
              ...metadataPayload.GET_META_INFO.METADATA_INF,
              TABLE_INF: {
                ...metadataPayload.GET_META_INFO.METADATA_INF.TABLE_INF,
                TITLE: { $: "Consumer prices" },
              },
            },
          },
        }),
        fetchApi: async () => {
          dataCalls += 1;
          return records;
        },
      }),
    ).rejects.toMatchObject({ code: "cpi-meta-baseline-unproven" });
    expect(dataCalls).toBe(0);
  });

  it("selects the unique latest CPI identity and fails closed for zero, ties, or invalid dates", () => {
    expect(
      resolveCpiCandidate(
        [
          cpiCandidate({
            "@id": "0004052036",
            TITLE: "消費者物価指数 2020年基準",
            SURVEY_DATE: "2020年",
          }),
          cpiCandidate(),
        ],
        source,
      ),
    ).toMatchObject({ id: "0004052037", updatedDate: "2026年9月" });
    expect(() => resolveCpiCandidate([], source)).toThrow(
      expect.objectContaining({ code: "cpi-candidate-not-found" }),
    );
    expect(() =>
      resolveCpiCandidate([cpiCandidate(), cpiCandidate({ "@id": "0004052038" })], source),
    ).toThrow(expect.objectContaining({ code: "cpi-candidate-ambiguous" }));
    expect(
      resolveCpiCandidate(
        [cpiCandidate({ "@id": "0004052999", UPDATED_DATE: "2026年10月" })],
        source,
      ),
    ).toMatchObject({ id: "0004052999", candidateCount: 1 });
    expect(() => resolveCpiCandidate([cpiCandidate({ UPDATED_DATE: "未確認" })], source)).toThrow(
      expect.objectContaining({ code: "cpi-candidate-date-invalid" }),
    );
  });

  it("uses a newer changed statsDataId for metadata and data, preserving prior canonical IDs as lineage", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const selectedId = "0004052999";
    metadataPayload.GET_META_INFO.METADATA_INF.TABLE_INF["@id"] = selectedId;
    let metadataId;
    let dataId;
    const result = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({
        candidates: [
          cpiCandidate({ UPDATED_DATE: "2026年9月" }),
          cpiCandidate({ "@id": selectedId, UPDATED_DATE: "2026年10月" }),
        ],
      }),
      getDataCatalog: async () => ({
        datasets: [
          {
            ...cpiCatalog().datasets[0],
            RELEASE_DATE: "2026-08-21",
            LAST_MODIFIED_DATE: "2026-09-19",
          },
          {
            ...cpiCatalog().datasets[0],
            RELEASE_DATE: "2026-10-01",
            LAST_MODIFIED_DATE: "2026-10-03",
            RESOURCE: {
              ...cpiCatalog().datasets[0].RESOURCE,
              "@id": "cpi-distribution-resource-v2",
              URL: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=1&statInfId=000040489999",
            },
          },
        ],
      }),
      getMetaInfo: async (id) => {
        metadataId = id;
        return metadataPayload;
      },
      fetchApi: async (id) => {
        dataId = id;
        return records;
      },
    });
    const metadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(metadataId).toBe(selectedId);
    expect(dataId).toBe(selectedId);
    expect(metadata.statsDataId).toBe(selectedId);
    expect(metadata.statInfId).toBe("000040482945");
    expect(metadata.sourceLineage).toMatchObject({
      previousStatsDataId: "0004052037",
      previousStatInfId: "000040482945",
    });
    expect(metadata.selectedApiSourceIdentity).toMatchObject({
      statsDataId: selectedId,
      title: "消費者物価指数 2025年基準",
      unit: "2025年=100",
      classification: "nationwide index; tab 1; 78 cat01 series",
    });
    expect(metadata.distributionSourceIdentity).toMatchObject({
      catalogResourceId: "cpi-distribution-resource-v2",
      legacyStatInfId: "000040489999",
    });
  });

  it("rejects changed pinned inputs and duplicate API observations without staging artifacts", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const metadataPath = path.join(root, "data/source/cpi_data2025_long.metadata.json");
    const originalMetadata = await readFile(metadataPath, "utf8");
    const unavailableMetadata = JSON.parse(originalMetadata);
    unavailableMetadata.status = "pending";
    await writeFile(metadataPath, JSON.stringify(unavailableMetadata));
    await expect(cpiAdapter({ source, root })).rejects.toMatchObject({
      code: "cpi-metadata-identity-mismatch",
    });
    await writeFile(metadataPath, originalMetadata);
    const canonicalPath = path.join(root, "data/source/cpi_data2025_long.csv");
    const canonicalBytes = await readFile(canonicalPath);
    await writeFile(canonicalPath, Buffer.concat([canonicalBytes, Buffer.from("tampered")]));
    await expect(cpiAdapter({ source, root })).rejects.toMatchObject({
      code: "cpi-canonical-csv-modified",
    });
    await writeFile(canonicalPath, canonicalBytes);
    const contribution = path.join(root, "data/source/contribution2025.csv");
    await writeFile(contribution, "changed");
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
      }),
    ).rejects.toMatchObject({ code: "cpi-contribution-modified" });
    await writeFile(
      contribution,
      await readFile(path.join(repo, "data/source/contribution2025.csv")),
    );
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
        fetchApi: async () => [...records, records[0]],
      }),
    ).rejects.toMatchObject({ code: "cpi-api-duplicate" });
    expect(await readdir(path.join(root, "data/source"))).toContain("cpi_data2025_long.csv");
    expect(await readFile(canonicalPath)).toEqual(canonicalBytes);
  });

  it("accepts a newer published month and rejects generic index units", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root, "202608");
    const result = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => metadataPayload,
      fetchApi: async () => records,
    });
    const output = result.artifacts[0].bytes.toString("utf8").trimEnd().split("\n");
    expect(output.at(-1).startsWith("2026年8月,")).toBe(true);
    expect(JSON.parse(result.artifacts[1].bytes.toString("utf8")).period.monthlyRows).toBe(680);

    const badUnit = records.map((record, index) =>
      index === 0 ? { ...record, "@unit": "指数" } : record,
    );
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
        fetchApi: async () => badUnit,
      }),
    ).rejects.toMatchObject({ code: "cpi-api-unit-unproven" });
  });

  it("refuses a source period that drops the pinned latest month", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root, "202606");
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
        fetchApi: async () => records,
      }),
    ).rejects.toMatchObject({ code: "cpi-period-regression" });
  });
});
