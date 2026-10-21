import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import iconv from "iconv-lite";
import {
  cpiAdapter as runCpiAdapter,
  resolveCpiCandidate,
} from "../../../scripts/data-refresh/adapters/cpi.mjs";
import { registry as refreshRegistry } from "../../../scripts/data-refresh/registry/index.mjs";
import {
  summarizeRuntimeQualityDiagnostics,
  validateStagedRuntimeData,
} from "../../../scripts/data-refresh/runtime-validator.mjs";
import { runRefresh } from "../../../scripts/data-refresh/runner.mjs";

const roots = [];
const repo = process.cwd();

async function cpiAdapter(options = {}) {
  let metadataPayload;
  let records;
  const originalFetchImpl = options.fetchImpl ?? fetch;
  const fetchImpl = async (input, init) => {
    const response = await originalFetchImpl(input, init);
    const requestUrl = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (
      response.ok &&
      (requestUrl.pathname.endsWith("/getMetaInfo") ||
        requestUrl.pathname.endsWith("/getStatsData"))
    ) {
      const payload = await response.clone().json();
      if (requestUrl.pathname.endsWith("/getMetaInfo")) {
        metadataPayload = payload.GET_META_INFO?.METADATA_INF ?? payload;
      } else {
        let pageRecords = payload.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE;
        if (!Array.isArray(pageRecords) && pageRecords && typeof pageRecords === "object") {
          pageRecords = [pageRecords];
        }
        records = [...(records ?? []), ...(pageRecords ?? [])];
      }
    }
    return response;
  };
  const getMetaInfo = options.getMetaInfo
    ? async (...args) => {
        metadataPayload = await options.getMetaInfo(...args);
        return metadataPayload;
      }
    : undefined;
  const fetchApi = options.fetchApi
    ? async (...args) => {
        const result = await options.fetchApi(...args);
        records = Array.isArray(result) ? result : result?.records;
        return result;
      }
    : undefined;
  const fetchFile =
    options.fetchFile ??
    (async ({ url, allowedHosts }) => {
      expect(new URL(url).hostname).toBe("www.e-stat.go.jp");
      expect(allowedHosts).toContain("www.e-stat.go.jp");
      const bytes = await makeDistributionFixture(options.root ?? repo, metadataPayload, records);
      return { bytes };
    });
  return runCpiAdapter({ ...options, fetchImpl, getMetaInfo, fetchApi, fetchFile });
}

async function makeDistributionFixture(root, metadata, observations, options = {}) {
  const mapText = await readFile(path.join(root, "data/source/cpi-2025-series-map.csv"), "utf8");
  const series = mapText
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [, code] = line.match(/^"([^"]+)"/);
      return code;
    });
  const codes = [...series, ...(options.extraCodes ?? [])];
  const metadataRoot = metadata?.GET_META_INFO?.METADATA_INF ?? metadata;
  const classObjects = metadataRoot?.CLASS_INF?.CLASS_OBJ;
  const timeClasses = Array.isArray(classObjects)
    ? classObjects.find((item) => item["@id"] === "time")?.CLASS
    : undefined;
  const timeRows = Array.isArray(timeClasses) ? timeClasses : [timeClasses].filter(Boolean);
  const periodByCode = new Map();
  for (const row of timeRows) {
    const label = String(row["@name"] ?? row.name ?? "");
    const match = /^(\d{4})年(\d{1,2})月$/.exec(label);
    if (match)
      periodByCode.set(String(row["@code"] ?? row.code), `${match[1]}${match[2].padStart(2, "0")}`);
  }
  let latestMonth;
  for (const record of observations ?? []) {
    const period = periodByCode.get(String(record["@time"] ?? record.time));
    if (!period) continue;
    if (!latestMonth || period > latestMonth) latestMonth = period;
  }
  const periods = [...new Set([...periodByCode.values()])]
    .filter((period) => period <= latestMonth)
    .sort();
  const observationValueByPeriodAndCode = new Map(
    (observations ?? []).map((record) => {
      const period = periodByCode.get(String(record["@time"] ?? record.time));
      return [`${period}\0${String(record["@cat01"] ?? record.cat01)}`, record.$ ?? record.value];
    }),
  );
  const rows = [
    ["e-Stat CPI distribution fixture"],
    ["2025 base CPI"],
    ["類・品目符号(Group/Item code)", ...codes],
    ["年月", ...codes.map(() => "指数")],
    ["ウエイト(Weight)", ...codes.map(() => "non-period metadata")],
    ["ウエイト１万分比(Weight per 10000)", ...codes.map(() => "non-period metadata")],
    ...periods.map((period) => [
      period,
      ...codes.map((code) => {
        const leadingBlankCount = options.leadingBlankCounts?.get(code) ?? 0;
        const offset = Number(period.slice(0, 4)) * 12 + Number(period.slice(4)) - (1970 * 12 + 1);
        if (offset < leadingBlankCount) return "";
        const override = options.valueOverrides?.get(`${period}\0${code}`);
        const apiValue = observationValueByPeriodAndCode.get(`${period}\0${code}`);
        return override ?? apiValue ?? (period.startsWith("2025") ? "100.0" : "27.0");
      }),
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(","),
    )
    .join("\r\n");
  return iconv.encode(csv, "windows-31j");
}

async function rejectionCode(promise) {
  try {
    await promise;
    return "resolved";
  } catch (error) {
    return error?.code ?? "unknown-error";
  }
}

async function makeRoot({ qualityCompatible = false } = {}) {
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
  // In qualityCompatible mode, keep full history in-band for the first 2005 rolling 12-month window.
  const canonicalRows = months.map((code) => {
    const year = Number(code.slice(0, 4));
    const fixtureValue = qualityCompatible || year === 2025 ? "100" : "27.0";
    return [`${year}年${Number(code.slice(4))}月`, ...keys.map(() => fixtureValue)].join(",");
  });
  const canonicalCsv = `${["年月", ...keys].join(",")}\n${canonicalRows.join("\n")}\n`;
  await writeFile(path.join(root, "data/source/cpi_data2025_long.csv"), canonicalCsv);
  const metadataPath = path.join(root, "data/source/cpi_data2025_long.metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.csvSha256 = createHash("sha256").update(canonicalCsv).digest("hex");
  metadata.period = { start: "1970年1月", end: "2026年7月", monthlyRows: 679 };
  metadata.approvedPeriod = { from: "202607", through: "202608" };
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
  candidateQuery: { searchWord: "消費者物価指数", statsField: "0703" },
  distributionCandidateQuery: {
    statsCode: "00200573",
    searchWord: "消費者物価指数",
    dataType: "CSV",
  },
  distributionCandidateIdentity: {
    titleIncludes: ["消費者物価指数", "2025年基準"],
    format: "CSV",
    datasetIncludes: ["2025年基準消費者物価指数"],
    resourceIncludes: ["品目別価格指数"],
    tableIncludes: ["品目別価格指数（1970年1月～最新月）"],
    categoryIncludes: ["品目別価格指数"],
    periodIncludes: ["月次"],
    yearIncludes: ["2025"],
  },
  candidateIdentity: {
    expectedStatsDataId: "0004052037",
    expectedTitle: "消費者物価指数（2025年基準）",
    expectedStatisticsName: "消費者物価指数",
    titleIncludes: ["消費者物価指数", "2025年基準"],
    cycleIncludes: ["月次", "毎月"],
    surveyYear: "2025",
    fileStatInfId: "000040482945",
  },
  period: { from: "197001", through: "latest-published" },
  approvedPeriod: { from: "202607", through: "202608" },
};

const cpiCandidate = (overrides = {}) => ({
  "@id": "0004052037",
  STAT_NAME: "消費者物価指数",
  TITLE: "消費者物価指数（2025年基準）",
  CYCLE: "月次",
  SURVEY_DATE: "2025年",
  OPEN_DATE: "2026年8月",
  UPDATED_DATE: "2026年9月",
  ...overrides,
});
const cpiCatalog = () => ({
  datasets: [
    {
      TITLE: {
        NAME: { $: "2025年基準消費者物価指数 長期時系列データ 品目別価格指数 全国 月次" },
      },
      RELEASE_DATE: "2026-08-21",
      LAST_MODIFIED_DATE: "2026-09-19",
      RESOURCE: {
        "@id": "cpi-distribution-resource-1",
        TITLE: {
          NAME: { $: "品目別価格指数（1970年1月～最新月）" },
          TABLE_NAME: { $: "品目別価格指数（1970年1月～最新月）" },
        },
        FORMAT: "CSV",
        URL: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=1&statInfId=000040482945",
      },
    },
  ],
});

async function apiFixtures(root, endCode = "202607", options = {}) {
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
  const officialTimeCode = (period) => (period === "197001" ? "1970000101" : period);
  return {
    metadataPayload: {
      GET_META_INFO: {
        RESULT: { STATUS: 0 },
        METADATA_INF: {
          TABLE_INF: {
            "@id": "0004052037",
            TITLE: { $: "消費者物価指数（2025年基準）" },
            STAT_NAME: { $: "消費者物価指数" },
          },
          CLASS_INF: {
            CLASS_OBJ: [
              { "@id": "area", CLASS: { "@code": "00000", "@name": "全国" } },
              {
                "@id": "tab",
                CLASS: { "@code": "1", "@name": "指数" },
              },
              { "@id": "cat01", CLASS: categories },
              {
                "@id": "time",
                CLASS: [
                  ...times.map((code) => ({
                    "@code": officialTimeCode(code),
                    "@name": `${code.slice(0, 4)}年${Number(code.slice(4))}月`,
                  })),
                  { "@code": "2025000000", "@name": "2025年平均" },
                ],
              },
            ],
          },
        },
      },
    },
    records: [
      // In qualityCompatible mode, match canonical history for overlap and rolling checks.
      ...categories.flatMap(({ "@code": code }) =>
        times.map((time) => ({
          "@area": "00000",
          "@tab": "1",
          "@cat01": code,
          "@time": officialTimeCode(time),
          "@unit": "２０２５年 ＝ １００",
          $: options.qualityCompatible || time.startsWith("2025") ? "100" : "27.0",
        })),
      ),
      {
        "@area": "00000",
        "@tab": "1",
        "@cat01": "0001",
        "@time": "2025000000",
        "@unit": "2025年=100",
        $: "100.0",
      },
    ],
  };
}

describe("CPI refresh adapter", () => {
  it("keeps discovery separate from the reviewed CPI vintage in registry and metadata", async () => {
    const registrySource = refreshRegistry.sources.find(({ id }) => id === "cpi-long");
    const metadata = JSON.parse(
      await readFile(path.join(repo, "data/source/cpi_data2025_long.metadata.json"), "utf8"),
    );

    expect(registrySource.period).toEqual({ from: "197001", through: "latest-published" });
    expect(registrySource.approvedPeriod).toEqual({ from: "202607", through: "202608" });
    expect(metadata.approvedPeriod).toMatchObject({ from: "202607", through: "202608" });
  });

  it("validates table dimensions and builds the canonical CSV from injected fixtures", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    expect(
      metadataPayload.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ[1].CLASS["@unit"],
    ).toBeUndefined();
    expect(records[0]["@unit"]).toBe("２０２５年 ＝ １００");
    const mapLines = (
      await readFile(path.join(root, "data/source/cpi-2025-series-map.csv"), "utf8")
    )
      .trim()
      .split("\n");
    const mapEntries = mapLines.slice(1).map((line) => line.match(/^"([^"]+)","([^"]+)"/));
    const mappedCodes = mapEntries.map((match) => match[1]);
    const mappedNames = mapEntries.map((match) => match[2]);
    let requestedFilters;
    const rawPages = [Buffer.from('{"page":1}'), Buffer.from('{"page":2}')];
    const result = await cpiAdapter({
      source,
      root,
      now: () => new Date("2026-10-16T00:00:00.000Z"),
      transportConfig: { appId: "fixture-secret-must-not-be-reported" },
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => metadataPayload,
      fetchApi: async (_statsDataId, filters) => {
        requestedFilters = filters;
        return {
          records,
          pageCount: 2,
          declaredTotal: records.length,
          rawFetches: rawPages.map((bytes, index) => ({
            name: `estat-cpi-stats-0004052037-page-${index + 1}`,
            bytes,
          })),
        };
      },
    });
    expect(result.artifacts.map(({ path }) => path)).toEqual([
      "data/source/cpi_data2025_long.csv",
      "data/source/cpi_data2025_long.metadata.json",
      "data/source/cpi-2025-series-map.csv",
      "data/source/contribution2025.csv",
      "data/source/cpi-2025-official-series.csv",
    ]);
    const csv = result.artifacts[0].bytes.toString("utf8");
    expect(csv.split("\n")[0]).toBe(["年月", ...mappedNames].join(","));
    expect(csv.split("\n")[1]).toBe(["1970年1月", ...mappedNames.map(() => "27.0")].join(","));
    const metadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(metadata.status).toBe("ready");
    expect(metadata.refreshApiRetrievalConditions).toMatchObject({
      cdArea: "00000",
      cdTab: "1",
      cdTimeFrom: "1970000101",
      cdCat01: mappedCodes.join(","),
    });
    expect(requestedFilters).toEqual({
      cdArea: "00000",
      cdTab: "1",
      cdTimeFrom: "1970000101",
      cdCat01: mappedCodes.join(","),
    });
    expect(metadata.period).toEqual({ start: "1970年1月", end: "2026年7月", monthlyRows: 679 });
    expect(metadata.distributionSourceIdentity.identityMarkers).toEqual({
      table: ["品目別価格指数（1970年1月～最新月）"],
      category: ["品目別価格指数"],
      period: ["月次"],
      year: ["2025"],
    });
    expect(metadata.revisionSummary.count).toBe(0);
    expect(metadata.revisionSummary.samples).toEqual([]);
    expect(result.artifacts[2].bytes).toEqual(
      await readFile(path.join(root, "data/source/cpi-2025-series-map.csv")),
    );
    expect(result.artifacts[3].bytes).toEqual(
      await readFile(path.join(root, "data/source/contribution2025.csv")),
    );
    expect(result.artifacts[4].bytes.toString("utf8").split("\n")[0]).toBe("code,name");
    expect(result.semanticValue).toBeDefined();
    const apiRawFetches = result.rawFetches.filter((item) =>
      item.name.startsWith("estat-cpi-stats-"),
    );
    const fileRawFetch = result.rawFetches.find(
      (item) => item.name === "estat-cpi-file-000040482945",
    );
    expect(apiRawFetches).toEqual(
      rawPages.map((bytes, index) => ({
        name: `estat-cpi-stats-0004052037-page-${index + 1}`,
        bytes,
      })),
    );
    expect(fileRawFetch.bytes.byteLength).toBeGreaterThan(0);
    expect(
      apiRawFetches.map(({ bytes }) => createHash("sha256").update(bytes).digest("hex")),
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
          approvedPeriod: { from: "202607", through: "202608" },
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
    expect(
      report.sources[0].rawFetches.filter((item) => item.name.startsWith("estat-cpi-stats-")),
    ).toEqual(
      rawPages.map((bytes, index) => ({
        name: `estat-cpi-stats-0004052037-page-${index + 1}`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.byteLength,
      })),
    );
    expect(report.sources[0].rawFetches).toContainEqual({
      name: fileRawFetch.name,
      sha256: createHash("sha256").update(fileRawFetch.bytes).digest("hex"),
      byteLength: fileRawFetch.bytes.byteLength,
    });
    expect(JSON.stringify(report)).not.toContain("fixture-secret");
    expect(JSON.stringify(report)).not.toContain("page1");
    expect(JSON.stringify(report)).not.toContain("page2");
    expect(report.sources[0].sourceCandidate).toMatchObject({
      candidateCount: 1,
      discoveryPeriod: "latest-published",
      approvedPeriod: { from: "202607", through: "202608" },
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

  it("maps opaque official time codes through exact monthly and annual labels", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const officialMetadata = structuredClone(metadataPayload);
    const timeClass = officialMetadata.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "time",
    ).CLASS;
    const codeMap = new Map();
    timeClass.forEach((row, index) => {
      const original = row["@code"];
      const opaque = `opaque-time-${index + 1}`;
      codeMap.set(original, opaque);
      row["@code"] = opaque;
    });
    const officialRecords = records.map((record) => ({
      ...record,
      "@time": codeMap.get(record["@time"]) || record["@time"],
    }));
    const runWith = (payload, observations) =>
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => payload,
        fetchApi: async () => observations,
      });

    const result = await runWith(officialMetadata, officialRecords);
    const output = result.artifacts[0].bytes.toString("utf8");
    expect(output.split("\n").at(-2).startsWith("2026年7月,")).toBe(true);
    expect(output.split("\n")).toHaveLength(681);
    expect(output).not.toContain("2025年平均,");

    const unknownTimeRows = officialRecords.map((record, index) =>
      index === 0 ? { ...record, "@time": "unknown-time-id" } : record,
    );
    await expect(runWith(officialMetadata, unknownTimeRows)).rejects.toMatchObject({
      code: "cpi-api-record-invalid",
    });

    const duplicateObservationRows = [...officialRecords, { ...officialRecords[0] }];
    await expect(runWith(officialMetadata, duplicateObservationRows)).rejects.toMatchObject({
      code: "cpi-api-duplicate",
    });

    const februaryCode = codeMap.get("197002");
    const missingMonthRows = officialRecords.filter((record) => record["@time"] !== februaryCode);
    await expect(runWith(officialMetadata, missingMonthRows)).rejects.toMatchObject({
      code: "cpi-api-time-coverage",
    });

    const duplicateMetadataCode = structuredClone(officialMetadata);
    const duplicateClasses =
      duplicateMetadataCode.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
        (item) => item["@id"] === "time",
      ).CLASS;
    duplicateClasses[1]["@code"] = duplicateClasses[0]["@code"];
    await expect(runWith(duplicateMetadataCode, officialRecords)).rejects.toMatchObject({
      code: "cpi-meta-time-unproven",
      cpiMetadataTimeDiagnostics: { duplicateCodeCount: 1 },
    });

    const duplicateMetadataPeriod = structuredClone(officialMetadata);
    const duplicatePeriodClasses =
      duplicateMetadataPeriod.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
        (item) => item["@id"] === "time",
      ).CLASS;
    duplicatePeriodClasses[1]["@name"] = duplicatePeriodClasses[0]["@name"];
    await expect(runWith(duplicateMetadataPeriod, officialRecords)).rejects.toMatchObject({
      code: "cpi-meta-time-unproven",
      cpiMetadataTimeDiagnostics: { duplicatePeriodCount: 1 },
    });

    const malformedMetadataLabel = structuredClone(officialMetadata);
    const malformedClasses =
      malformedMetadataLabel.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
        (item) => item["@id"] === "time",
      ).CLASS;
    malformedClasses[1]["@name"] = "PRIVATE TIME LABEL";
    const malformedFailure = await runWith(malformedMetadataLabel, officialRecords).catch(
      (error) => error,
    );
    expect(malformedFailure).toMatchObject({
      code: "cpi-meta-time-unproven",
      cpiMetadataTimeDiagnostics: { malformedLabelCount: 1 },
    });
    expect(JSON.stringify(malformedFailure.cpiMetadataTimeDiagnostics)).not.toContain("PRIVATE");

    const duplicateAnnualRows = [
      ...officialRecords,
      ...officialRecords.filter((record) => record["@time"] === codeMap.get("2025000000")),
    ];
    await expect(runWith(officialMetadata, duplicateAnnualRows)).rejects.toMatchObject({
      code: "cpi-api-duplicate",
    });
  });

  it("maps fiscal-year labels as annual observations and still rejects unknown labels", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const fiscalMetadata = structuredClone(metadataPayload);
    const timeClasses = fiscalMetadata.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "time",
    ).CLASS;
    timeClasses.push({ "@code": "opaque-fiscal-year-2025", "@name": "2025年度" });
    const fiscalRecords = [
      ...records,
      ...records
        .filter((record) => record["@time"] === "2025000000")
        .map((record) => ({ ...record, "@time": "opaque-fiscal-year-2025" })),
    ];
    const runWith = (payload, observations) =>
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => payload,
        fetchApi: async () => observations,
      });

    const result = await runWith(fiscalMetadata, fiscalRecords);
    expect(result.artifacts[0].bytes.toString("utf8")).not.toContain("2025年度,");
    expect(result.validationSummary.metadataTimeAnnualPeriodCount).toBe(2);

    const unknownMetadata = structuredClone(fiscalMetadata);
    const unknownClasses = unknownMetadata.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "time",
    ).CLASS;
    unknownClasses.at(-1)["@name"] = "2025年度その他";
    await expect(runWith(unknownMetadata, fiscalRecords)).rejects.toMatchObject({
      code: "cpi-meta-time-unproven",
      cpiMetadataTimeDiagnostics: { malformedLabelCount: 1 },
    });
  });

  it("uses the official start code and preserves category-specific leading gaps", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root, "202608");
    const mapLines = (
      await readFile(path.join(root, "data/source/cpi-2025-series-map.csv"), "utf8")
    )
      .trim()
      .split("\n");
    const series = mapLines.slice(1).map((line) => {
      const [, officialCode, existingKey] = line.match(/^"([^\"]+)","([^\"]+)"/);
      return { officialCode, existingKey };
    });
    const missingLeadingMonths = new Map([
      [series[0].officialCode, 420],
      [series[1].officialCode, 420],
      [series[2].officialCode, 12],
    ]);
    const canonicalPath = path.join(root, "data/source/cpi_data2025_long.csv");
    const canonicalLines = (await readFile(canonicalPath, "utf8")).trimEnd().split("\n");
    const header = canonicalLines[0].split(",");
    const canonicalRows = canonicalLines.slice(1).map((line) => line.split(","));
    for (const [officialCode, missingCount] of missingLeadingMonths) {
      const key = series.find((item) => item.officialCode === officialCode).existingKey;
      const column = header.indexOf(key);
      for (let row = 0; row < missingCount; row += 1) canonicalRows[row][column] = "";
    }
    const canonicalCsv = `${[header, ...canonicalRows].map((row) => row.join(",")).join("\n")}\n`;
    await writeFile(canonicalPath, canonicalCsv);
    const canonicalMetadataPath = path.join(root, "data/source/cpi_data2025_long.metadata.json");
    const canonicalMetadata = JSON.parse(await readFile(canonicalMetadataPath, "utf8"));
    canonicalMetadata.csvSha256 = createHash("sha256").update(canonicalCsv).digest("hex");
    await writeFile(canonicalMetadataPath, JSON.stringify(canonicalMetadata));

    const timeClasses = metadataPayload.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "time",
    ).CLASS;
    timeClasses.push({ "@code": "opaque-future-202609", "@name": "2026年9月" });
    const periodCode = new Map(
      timeClasses
        .filter((row) => /^\d{4}年\d{1,2}月$/.test(row["@name"]))
        .map((row) => [row["@name"], row["@code"]]),
    );
    const periodIndexByCode = new Map([...periodCode.values()].map((code, index) => [code, index]));
    const monthlyRecords = records.filter((record) => record["@time"] !== "2025000000");
    const filteredRecords = monthlyRecords.filter((record) => {
      const code = record["@cat01"];
      const missingCount = missingLeadingMonths.get(code) || 0;
      const offset = periodIndexByCode.get(record["@time"]);
      return offset >= missingCount;
    });
    const annualRecord = records.find((record) => record["@time"] === "2025000000");
    const allRecords = [...filteredRecords, annualRecord];
    let requestedFilters;
    const result = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => metadataPayload,
      fetchApi: async (_id, filters) => {
        requestedFilters = filters;
        return allRecords;
      },
      fetchFile: async () => ({
        bytes: await makeDistributionFixture(root, metadataPayload, allRecords, {
          leadingBlankCounts: missingLeadingMonths,
        }),
      }),
    });
    expect(requestedFilters.cdTimeFrom).toBe("1970000101");
    const outputRows = result.artifacts[0].bytes.toString("utf8").trimEnd().split("\n");
    expect(outputRows).toHaveLength(681);
    expect(outputRows.at(-1).startsWith("2026年8月,")).toBe(true);
    expect(outputRows.some((row) => row.startsWith("2026年9月,"))).toBe(false);
    expect(outputRows[1].split(",").slice(1, 3)).toEqual(["", ""]);
    expect(result.coverage.endMonth).toBe("202608");
    const outputMetadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(outputMetadata.extraction.monthlyObservationCount).toBe(52_188);
    expect(
      outputRows.slice(1).reduce(
        (count, row) =>
          count +
          row
            .split(",")
            .slice(1)
            .filter((value) => value === "").length,
        0,
      ),
    ).toBe(852);

    const internalGap = allRecords.filter(
      (record) =>
        !(
          record["@cat01"] === series[0].officialCode &&
          record["@time"] === periodCode.get("2005年6月")
        ),
    );
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
        fetchApi: async () => internalGap,
      }),
    ).rejects.toMatchObject({ code: "cpi-api-time-coverage" });

    const missingLatest = allRecords.filter(
      (record) => !(record["@cat01"] === series[0].officialCode && record["@time"] === "202608"),
    );
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
        fetchApi: async () => missingLatest,
      }),
    ).rejects.toMatchObject({ code: "cpi-api-time-coverage" });
  });

  it("reports only fixed CPI metadata area predicates when code and name do not share a class", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const mismatchedArea = structuredClone(metadataPayload);
    mismatchedArea.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ[0].CLASS = [
      { "@code": "00000", "@name": "東京都" },
      { "@code": "99999", "@name": "全国" },
    ];
    const failure = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => mismatchedArea,
      fetchApi: async () => records,
    }).catch((error) => error);
    expect(failure).toMatchObject({
      code: "cpi-meta-area-unproven",
      cpiMetadataAreaDiagnostics: {
        areaDimensionFound: true,
        nationalCode00000Found: true,
        nationalNameNationalFound: true,
        nationalCodeAndNameSameClass: false,
      },
    });
    expect(JSON.stringify(failure.cpiMetadataAreaDiagnostics)).not.toContain("東京都");
    expect(JSON.stringify(failure.cpiMetadataAreaDiagnostics)).not.toContain("全国");

    const missingArea = structuredClone(metadataPayload);
    missingArea.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.shift();
    const missingFailure = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => missingArea,
      fetchApi: async () => records,
    }).catch((error) => error);
    expect(missingFailure).toMatchObject({
      code: "cpi-meta-area-unproven",
      cpiMetadataAreaDiagnostics: {
        areaDimensionFound: false,
        nationalCode00000Found: false,
        nationalNameNationalFound: false,
        nationalCodeAndNameSameClass: false,
      },
    });
  });

  it("requires continuous metadata month labels before reading VALUE observations", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const missingStart = structuredClone(metadataPayload);
    const timeDimension = missingStart.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "time",
    );
    timeDimension.CLASS = timeDimension.CLASS.filter((row) => row["@code"] !== "1970000101");

    let valueFetchCount = 0;
    const failure = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => missingStart,
      fetchApi: async () => {
        valueFetchCount += 1;
        return records;
      },
    }).catch((error) => error);
    expect(failure).toMatchObject({
      code: "cpi-meta-time-unproven",
      cpiMetadataTimeDiagnostics: {
        timeDimensionFound: true,
        rowCount: 679,
        monthlyPeriodCount: 678,
        annualPeriodCount: 1,
        requiredStartMonthFound: false,
        monthlyContinuity: false,
      },
    });
    expect(valueFetchCount).toBe(0);
  });

  it("reports only fixed time label pattern counts for unclassified labels", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const malformedPayload = structuredClone(metadataPayload);
    const timeRows = malformedPayload.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "time",
    ).CLASS;
    timeRows[1]["@name"] = "2020年";
    timeRows[2]["@name"] = "2021年度";
    timeRows[3]["@name"] = "2022年度平均";
    timeRows[4]["@name"] = "";
    timeRows[5]["@name"] = "PRIVATE LABEL";

    const failure = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => malformedPayload,
      fetchApi: async () => records,
    }).catch((error) => error);
    expect(failure).toMatchObject({
      code: "cpi-meta-time-unproven",
      cpiMetadataTimeDiagnostics: {
        malformedLabelCount: 3,
        monthLabelPatternCount: 674,
        calendarYearLabelPatternCount: 1,
        fiscalYearLabelPatternCount: 1,
        annualAverageLabelPatternCount: 2,
        blankLabelCount: 1,
        otherLabelPatternCount: 1,
        malformedUniqueCodeCount: 3,
      },
    });
    expect(JSON.stringify(failure.cpiMetadataTimeDiagnostics)).not.toContain("PRIVATE LABEL");
  });

  it("rejects missing months and duplicates while accepting audited canonical revisions", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const officialDistribution = await makeDistributionFixture(root, metadataPayload, records);
    const runWith = (observations, distributionBytes) =>
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
        fetchApi: async () => observations,
        ...(distributionBytes ? { fetchFile: async () => ({ bytes: distributionBytes }) } : {}),
      });

    const missingStart = records.filter((record) => record["@time"] !== "1970000101");
    await expect(rejectionCode(runWith(missingStart, officialDistribution))).resolves.toBe(
      "cpi-distribution-api-mismatch",
    );

    await expect(rejectionCode(runWith([...records, { ...records[0] }]))).resolves.toBe(
      "cpi-api-duplicate",
    );

    const changedOverlap = records.map((record, index) =>
      index === 0 ? { ...record, $: "28.0" } : record,
    );
    const revisedDistribution = await makeDistributionFixture(root, metadataPayload, records, {
      valueOverrides: new Map([["197001" + "\0" + "0001", "28.0"]]),
    });
    const revised = await runWith(changedOverlap, revisedDistribution);
    const revisionMeta = JSON.parse(revised.artifacts[1].bytes.toString("utf8"));
    expect(revisionMeta.revisionSummary).toMatchObject({
      count: 1,
      comparedValueCount: 679 * 78,
      startMonth: "197001",
      endMonth: "202607",
      revisionStartMonth: "197001",
      revisionEndMonth: "197001",
    });
    expect(revisionMeta.revisionSummary.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(revisionMeta.revisionSummary.samples[0]).toMatchObject({
      month: "197001",
      code: "0001",
    });
  });

  it("requires the resolved CP932 distribution file to match API values and identity", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const originalBytes = await makeDistributionFixture(root, metadataPayload, records, {
      extraCodes: Array.from({ length: 673 }, (_, index) => `S${String(index).padStart(4, "0")}`),
    });
    const rowsFromBytes = (bytes) =>
      iconv
        .decode(bytes, "windows-31j")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.split(","));
    const toBytes = (rows) =>
      iconv.encode(rows.map((row) => row.join(",")).join("\r\n"), "windows-31j");
    const makeAdapter = (bytes) =>
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
        fetchApi: async () => records,
        fetchFile: async () => ({ bytes }),
      });

    const result = await makeAdapter(originalBytes);
    const metadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(metadata.distributionApiIdentity).toMatchObject({
      startMonth: "197001",
      endMonth: "202607",
      periodCount: 679,
      seriesCount: 78,
      comparedValueCount: 679 * 78,
      mismatchCount: 0,
    });
    expect(metadata.distributionFileSha256).toBe(
      createHash("sha256").update(originalBytes).digest("hex"),
    );
    expect(metadata.distributionFileByteLength).toBe(originalBytes.byteLength);

    const missingLatestPeriodRows = rowsFromBytes(originalBytes).slice(0, -1);
    const missingLatestPeriodBytes = toBytes(missingLatestPeriodRows);
    const periodMismatch = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => metadataPayload,
      fetchApi: async () => records,
      fetchFile: async () => ({ bytes: missingLatestPeriodBytes }),
    }).catch((error) => error);
    expect(periodMismatch).toMatchObject({
      code: "cpi-distribution-api-period-mismatch",
      cpiDistributionPeriodDiagnostics: {
        apiPeriodCount: 679,
        apiStartMonth: "197001",
        apiEndMonth: "202607",
        distributionPeriodCount: 678,
        distributionStartMonth: "197001",
        distributionEndMonth: "202606",
        distributionFileByteLength: missingLatestPeriodBytes.byteLength,
        distributionFileSha256: createHash("sha256").update(missingLatestPeriodBytes).digest("hex"),
        positionalMismatchCount: 0,
        firstMismatchIndex: null,
        firstMismatchApiMonth: null,
        firstMismatchDistributionMonth: null,
        missingApiPeriodCount: 1,
      },
    });

    const changedValueRows = rowsFromBytes(originalBytes);
    changedValueRows[6][1] = "999";
    await expect(rejectionCode(makeAdapter(toBytes(changedValueRows)))).resolves.toBe(
      "cpi-distribution-api-mismatch",
    );

    const changedCodeRows = rowsFromBytes(originalBytes);
    changedCodeRows[2][1] = "9999";
    await expect(rejectionCode(makeAdapter(toBytes(changedCodeRows)))).resolves.toBe(
      "cpi-distribution-series-invalid",
    );

    const duplicateCodeRows = rowsFromBytes(originalBytes);
    duplicateCodeRows[2][2] = duplicateCodeRows[2][1];
    await expect(rejectionCode(makeAdapter(toBytes(duplicateCodeRows)))).resolves.toBe(
      "cpi-distribution-series-invalid",
    );

    const emptyCodeRows = rowsFromBytes(originalBytes);
    emptyCodeRows[2][1] = "";
    await expect(rejectionCode(makeAdapter(toBytes(emptyCodeRows)))).resolves.toBe(
      "cpi-distribution-series-invalid",
    );

    const changedPeriodRows = rowsFromBytes(originalBytes);
    changedPeriodRows[6][0] = "197000";
    await expect(rejectionCode(makeAdapter(toBytes(changedPeriodRows)))).resolves.toBe(
      "cpi-distribution-period-invalid",
    );

    const unknownNonPeriodRows = rowsFromBytes(originalBytes);
    unknownNonPeriodRows[6][0] = "PRIVATE NONPERIOD LABEL";
    await expect(rejectionCode(makeAdapter(toBytes(unknownNonPeriodRows)))).resolves.toBe(
      "cpi-distribution-period-invalid",
    );

    const duplicateWeightRows = rowsFromBytes(originalBytes);
    duplicateWeightRows.splice(6, 0, [...duplicateWeightRows[4]]);
    await expect(rejectionCode(makeAdapter(toBytes(duplicateWeightRows)))).resolves.toBe(
      "cpi-distribution-schema-invalid",
    );

    const lateWeightRows = rowsFromBytes(originalBytes);
    lateWeightRows[6][0] = "ウエイト(Weight)";
    await expect(rejectionCode(makeAdapter(toBytes(lateWeightRows)))).resolves.toBe(
      "cpi-distribution-schema-invalid",
    );

    const reversedWeightRows = rowsFromBytes(originalBytes);
    [reversedWeightRows[4], reversedWeightRows[5]] = [reversedWeightRows[5], reversedWeightRows[4]];
    await expect(rejectionCode(makeAdapter(toBytes(reversedWeightRows)))).resolves.toBe(
      "cpi-distribution-schema-invalid",
    );

    const missingWeightRows = rowsFromBytes(originalBytes);
    missingWeightRows.splice(5, 1);
    await expect(rejectionCode(makeAdapter(toBytes(missingWeightRows)))).resolves.toBe(
      "cpi-distribution-schema-invalid",
    );
  }, 30_000);

  it("reports only aggregate CPI VALUE category and time shape diagnostics", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const invalidRows = [
      { ...records[0], "@cat01": "PRIVATE_CATEGORY" },
      { ...records[1], "@time": "2025" },
      { ...records[2], "@cat01": "PRIVATE_CATEGORY", "@time": "PRIVATE_TIME" },
    ];
    const failure = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => metadataPayload,
      fetchApi: async () => invalidRows,
    }).catch((error) => error);
    expect(failure).toMatchObject({
      code: "cpi-api-record-invalid",
      cpiApiRecordDiagnostics: {
        totalRows: 3,
        unknownCategoryCount: 2,
        unrecognizedTimeCount: 2,
        bothInvalidCount: 1,
      },
    });
    expect(JSON.stringify(failure.cpiApiRecordDiagnostics)).not.toContain("PRIVATE_CATEGORY");
    expect(JSON.stringify(failure.cpiApiRecordDiagnostics)).not.toContain("PRIVATE_TIME");
  });

  it("requires canonical code/name identities in a classification superset", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const categoryObject = metadataPayload.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "cat01",
    );
    const expectedRows = categoryObject.CLASS;
    const extraRows = Array.from({ length: 719 }, (_, index) => ({
      "@code": String(900001 + index),
      "@name": `supplemental-${index}`,
    }));
    const supersetRows = [
      ...expectedRows.map((row, index) =>
        index === 0 ? { ...row, "@name": "総 合" } : { ...row },
      ),
      ...extraRows,
    ];
    const runWithRows = (categoryRows, apiRecords = records) => {
      const payload = structuredClone(metadataPayload);
      payload.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
        (item) => item["@id"] === "cat01",
      ).CLASS = categoryRows;
      return cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => payload,
        fetchApi: async () => apiRecords,
      });
    };

    const result = await runWithRows(supersetRows);
    expect(result.artifacts[0].bytes.toString("utf8").split("\n", 1)[0]).toBe(
      ["年月", ...expectedRows.map((row) => row["@name"])].join(","),
    );

    const prefixedRows = [
      ...expectedRows.map((row) => ({
        ...row,
        "@name": `${row["@code"]}　${row["@name"]}`,
      })),
      ...extraRows,
    ];
    await expect(rejectionCode(runWithRows(prefixedRows))).resolves.toBe("resolved");

    const wrongNameRows = supersetRows.map((row) =>
      row["@code"] === expectedRows[1]["@code"] ? { ...row, "@name": "別の系列名" } : row,
    );
    await expect(rejectionCode(runWithRows(wrongNameRows))).resolves.toBe(
      "cpi-meta-series-mismatch",
    );

    const wrongCodePrefixRows = supersetRows.map((row) =>
      row["@code"] === expectedRows[1]["@code"]
        ? { ...row, "@name": `9999 ${expectedRows[1]["@name"]}` }
        : row,
    );
    const wrongCodePrefixFailure = await runWithRows(wrongCodePrefixRows).catch((error) => error);
    expect(wrongCodePrefixFailure).toMatchObject({
      code: "cpi-meta-series-mismatch",
      cpiMetadataCategoryDiagnostics: { normalizedNameMatchCount: 77 },
    });

    const arbitraryNumericPrefixRows = supersetRows.map((row) =>
      row["@code"] === expectedRows[1]["@code"]
        ? { ...row, "@name": `1 ${expectedRows[1]["@name"]}` }
        : row,
    );
    await expect(rejectionCode(runWithRows(arbitraryNumericPrefixRows))).resolves.toBe(
      "cpi-meta-series-mismatch",
    );

    const missingCodeFailure = await runWithRows(
      supersetRows.filter((row) => row["@code"] !== expectedRows[0]["@code"]),
    ).catch((error) => error);
    expect(missingCodeFailure).toMatchObject({
      code: "cpi-meta-series-mismatch",
      cpiMetadataCategoryDiagnostics: {
        categoryClassObjFound: true,
        rowCount: 796,
        uniqueCodeCount: 796,
        expectedCodeMatchCount: 77,
      },
    });

    const duplicateCodeFailure = await runWithRows([...supersetRows, expectedRows[0]]).catch(
      (error) => error,
    );
    expect(duplicateCodeFailure).toMatchObject({
      code: "cpi-meta-series-mismatch",
      cpiMetadataCategoryDiagnostics: {
        categoryClassObjFound: true,
        rowCount: 798,
        uniqueCodeCount: 797,
        expectedCodeMatchCount: 79,
      },
    });

    const unknownCategoryRecords = records.map((record, index) =>
      index === 0 ? { ...record, "@cat01": extraRows[0]["@code"] } : record,
    );
    await expect(runWithRows(supersetRows, unknownCategoryRecords)).rejects.toMatchObject({
      code: "cpi-api-record-invalid",
    });
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
    const catalogRequests = [];
    const statsRequests = [];
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
                NUMBER: "1",
                RESULT_INF: { FROM_NUMBER: "1", TO_NUMBER: "1" },
                TABLE_INF: cpiCandidate(),
              },
            },
          }),
        );
        expectedResponses.push({ name: "estat-cpi-list-candidates-page-1", bytes });
        return new Response(bytes, { headers: { "content-type": "application/json" } });
      }
      if (requestUrl.pathname.endsWith("/getDataCatalog")) {
        catalogRequests.push(requestUrl);
        const { RESOURCE, ...dataset } = cpiCatalog().datasets[0];
        const bytes = Buffer.from(
          JSON.stringify({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: "0" },
              DATA_CATALOG_LIST_INF: {
                NUMBER: "1",
                RESULT_INF: { FROM_NUMBER: "1", TO_NUMBER: "1" },
                DATA_CATALOG_INF: {
                  DATASET: dataset,
                  RESOURCES: { RESOURCE },
                },
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
      statsRequests.push(requestUrl);
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
    const apiFetches = result.rawFetches.filter(
      ({ name }) => name.startsWith("estat-cpi-") && !name.startsWith("estat-cpi-file-"),
    );
    expect(apiFetches.map(({ name }) => name)).toEqual(expectedResponses.map(({ name }) => name));
    expect(apiFetches.map(({ bytes }) => createHash("sha256").update(bytes).digest("hex"))).toEqual(
      expectedResponses.map(({ bytes }) => createHash("sha256").update(bytes).digest("hex")),
    );
    const distributionFetch = result.rawFetches.find(
      ({ name }) => name === "estat-cpi-file-000040482945",
    );
    expect(distributionFetch.bytes.byteLength).toBeGreaterThan(0);

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
          approvedPeriod: { from: "202607", through: "202608" },
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
    expect(
      report.sources[0].rawFetches.filter(
        (item) => item.name.startsWith("estat-cpi-") && !item.name.startsWith("estat-cpi-file-"),
      ),
    ).toEqual(
      expectedResponses.map(({ name, bytes }) => ({
        name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.byteLength,
      })),
    );
    expect(report.sources[0].rawFetches).toContainEqual({
      name: distributionFetch.name,
      sha256: createHash("sha256").update(distributionFetch.bytes).digest("hex"),
      byteLength: distributionFetch.bytes.byteLength,
    });
    expect(reportText).not.toContain("fixture-secret");
    expect(reportText).not.toContain("temporary retry response");
    expect(reportText).not.toContain('"@area"');
    expect(catalogRequests).toHaveLength(1);
    expect(catalogRequests[0].searchParams.get("statsCode")).toBe("00200573");
    const expectedCategoryIds = (
      await readFile(path.join(root, "data/source/cpi-2025-series-map.csv"), "utf8")
    )
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.match(/^"([^"]+)"/)[1]);
    expect(expectedCategoryIds).toHaveLength(78);
    expect(statsRequests.map((request) => request.searchParams.get("startPosition"))).toEqual([
      "1",
      "1",
      String(pageSize + 1),
    ]);
    for (const request of statsRequests) {
      expect(request.searchParams.get("cdArea")).toBe("00000");
      expect(request.searchParams.get("cdTab")).toBe("1");
      expect(request.searchParams.get("cdTimeFrom")).toBe("1970000101");
      expect(request.searchParams.get("cdCat01")).toBe(expectedCategoryIds.join(","));
    }
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

  it("selects only the configured exact CPI identity and treats cycle/survey fields as diagnostic", () => {
    expect(
      resolveCpiCandidate(
        [
          cpiCandidate({
            "@id": "0004052036",
            TITLE: "消費者物価指数 2020年基準",
            SURVEY_DATE: "2020年",
          }),
          cpiCandidate({ CYCLE: "-", SURVEY_DATE: undefined, UPDATED_DATE: undefined }),
        ],
        source,
      ),
    ).toMatchObject({ id: "0004052037", cycle: "-", surveyDate: "", candidateCount: 1 });
    expect(() => resolveCpiCandidate([cpiCandidate({ "@id": "0004052999" })], source)).toThrow(
      expect.objectContaining({ code: "cpi-candidate-not-found" }),
    );
    expect(() => resolveCpiCandidate([], source)).toThrow(
      expect.objectContaining({
        code: "cpi-candidate-not-found",
        candidateDiagnostics: {
          rowsReturned: 0,
          requiredIdentityFields: 0,
          titleAndStatNameIdentityMatch: 0,
          monthlyFrequencyMatch: 0,
          surveyDate2025Match: 0,
          fullMatch: 0,
          identityCandidates: [],
        },
      }),
    );
    expect(() => resolveCpiCandidate([cpiCandidate(), cpiCandidate()], source)).toThrow(
      expect.objectContaining({ code: "cpi-candidate-ambiguous" }),
    );
  });

  it("counts safe CPI candidate identity matches without exposing candidate values", () => {
    let failure;
    try {
      resolveCpiCandidate(
        [
          cpiCandidate({ "@id": "0004052038", SURVEY_DATE: "2024年" }),
          cpiCandidate({ "@id": "bad-id" }),
          cpiCandidate({ "@id": "0004052039", CYCLE: "年次", SURVEY_DATE: "2025年・2026年" }),
          cpiCandidate({ "@id": "0004052040", CYCLE: "四半期", SURVEY_DATE: "1999年" }),
          cpiCandidate({ TITLE: "秘密の別統計" }),
          cpiCandidate({ "@id": "0004052041", CYCLE: "周期不明", SURVEY_DATE: "2000年" }),
        ],
        source,
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "cpi-candidate-not-found",
      candidateDiagnostics: {
        rowsReturned: 6,
        requiredIdentityFields: 5,
        titleAndStatNameIdentityMatch: 4,
        monthlyFrequencyMatch: 2,
        surveyDate2025Match: 2,
        fullMatch: 0,
        identityCandidates: [
          {
            statsDataId: "0004052038",
            cycleCategory: "monthly",
            surveyYears: ["2024"],
          },
          {
            statsDataId: "0004052039",
            cycleCategory: "annual",
            surveyYears: ["2025", "2026"],
          },
          {
            statsDataId: "0004052040",
            cycleCategory: "quarterly",
            surveyYears: ["1999"],
          },
        ],
      },
    });
    expect(JSON.stringify(failure.candidateDiagnostics)).not.toContain("秘密");
    expect(JSON.stringify(failure.candidateDiagnostics)).not.toContain("消費者物価指数");
    expect(Object.keys(failure.candidateDiagnostics)).toEqual([
      "rowsReturned",
      "requiredIdentityFields",
      "titleAndStatNameIdentityMatch",
      "monthlyFrequencyMatch",
      "surveyDate2025Match",
      "fullMatch",
      "identityCandidates",
    ]);
  });

  it("keeps the configured API and distribution identities despite a newer mismatched resource", async () => {
    const root = await makeRoot();
    const { metadataPayload, records } = await apiFixtures(root);
    const distributionBytes = await makeDistributionFixture(root, metadataPayload, records);
    let metadataId;
    let dataId;
    const result = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({
        candidates: [cpiCandidate({ CYCLE: "-", SURVEY_DATE: undefined })],
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
      fetchFile: async () => ({ bytes: distributionBytes }),
    });
    const metadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(metadataId).toBe("0004052037");
    expect(dataId).toBe("0004052037");
    expect(metadata.statsDataId).toBe("0004052037");
    expect(metadata.sourceLineage.previousStatsDataId).toBe("0004052037");
    expect(metadata.distributionSourceIdentity).toMatchObject({
      catalogResourceId: "cpi-distribution-resource-1",
      legacyStatInfId: "000040482945",
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
    const root = await makeRoot({ qualityCompatible: true });
    const { metadataPayload, records } = await apiFixtures(root, "202608", {
      qualityCompatible: true,
    });
    const listCandidate = cpiCandidate({ CYCLE: "-", SURVEY_DATE: undefined });
    const result = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [listCandidate] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => metadataPayload,
      fetchApi: async () => records,
    });
    const output = result.artifacts[0].bytes.toString("utf8").trimEnd().split("\n");
    expect(output.at(-1).startsWith("2026年8月,")).toBe(true);
    expect(JSON.parse(result.artifacts[1].bytes.toString("utf8")).period.monthlyRows).toBe(680);
    expect(result.validationSummary.unitEvidence).toBe("official-value-rows");
    expect(result.validationSummary).toMatchObject({
      overlapComparedValueCount: 679 * 78,
      overlapStartMonth: "197001",
      overlapEndMonth: "202607",
      overlapMismatchCount: 0,
    });
    const outputMetadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(outputMetadata.selectedApiSourceIdentity.unitEvidence).toBe("official-value-rows");
    expect(outputMetadata.valueIdentityEvidence).toEqual({
      comparedValueCount: 679 * 78,
      startMonth: "197001",
      endMonth: "202607",
      mismatchCount: 0,
    });

    for (const otherSource of refreshRegistry.sources.filter(({ id }) => id !== "cpi-long")) {
      for (const outputPath of otherSource.outputs) {
        const target = path.join(root, outputPath);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.join(repo, outputPath), target);
      }
    }
    const adapters = new Map([["cpi", async () => result]]);
    for (const otherSource of refreshRegistry.sources.filter(({ id }) => id !== "cpi-long")) {
      adapters.set(otherSource.adapterId, async () => ({
        semanticValue: { fixtureSource: otherSource.id },
        artifacts: await Promise.all(
          otherSource.outputs.map(async (outputPath) => ({
            path: outputPath,
            bytes: await readFile(path.join(root, outputPath)),
          })),
        ),
        rawFetches: [],
      }));
    }
    let validationOutcome;
    let refreshReport;
    try {
      refreshReport = await runRefresh({
        root,
        registry: refreshRegistry,
        adapters,
        check: true,
        validate: async ({ stageRoot, registry, sourceResults }) => {
          try {
            const result = await validateStagedRuntimeData({
              root: repo,
              stageRoot,
              registry,
              sourceResults,
            });
            validationOutcome = { status: "passed", result };
            return result;
          } catch (error) {
            const diagnostics = summarizeRuntimeQualityDiagnostics({
              ...error?.runtimeQualityDiagnostics,
              code: error?.code,
            });
            validationOutcome = {
              status: "failed",
              code: diagnostics?.code ?? "unknown-validator-error",
              diagnostics,
            };
            throw error;
          }
        },
        preflightChanges: async () => false,
      });
    } catch (error) {
      let reportDiagnostics;
      let reportPathRejected = typeof error?.reportPath === "string";
      if (typeof error?.reportPath === "string") {
        try {
          const reportSegments = error.reportPath.split(/[\\/]+/);
          const resolvedReportPath = path.resolve(root, error.reportPath);
          const reportsRoot = path.resolve(root, ".data-refresh/reports");
          if (
            !path.isAbsolute(error.reportPath) &&
            !reportSegments.includes("..") &&
            resolvedReportPath.startsWith(`${reportsRoot}${path.sep}`)
          ) {
            reportPathRejected = false;
            const report = JSON.parse(await readFile(resolvedReportPath, "utf8"));
            reportDiagnostics = report.sources?.find(
              (item) => item.sourceCandidate?.runtimeQualityDiagnostics,
            )?.sourceCandidate?.runtimeQualityDiagnostics;
          } else {
            reportPathRejected = true;
          }
        } catch {
          // Preserve the original validator failure if its persisted report is unavailable.
        }
      }
      if (reportPathRejected) throw error;
      const diagnosticSummary = {
        status: validationOutcome?.status ?? "failed",
        code:
          validationOutcome?.code ??
          summarizeRuntimeQualityDiagnostics({
            ...reportDiagnostics,
            code: error?.code,
          })?.code ??
          "unknown-validator-error",
        diagnostics:
          validationOutcome?.diagnostics ??
          summarizeRuntimeQualityDiagnostics({ ...reportDiagnostics, code: error?.code }),
      };
      throw new Error(
        `August staged CPI quality validation failed: ${JSON.stringify(diagnosticSummary)}`,
        { cause: error },
      );
    }
    expect(refreshReport.quality).toMatchObject({
      cpi: true,
      qualitySuiteCount: 7,
    });
    expect(validationOutcome).toMatchObject({
      status: "passed",
      result: { validator: "runtime-data-quality-suites-v1" },
    });

    const { metadataPayload: septemberMetadata, records: septemberRecords } = await apiFixtures(
      root,
      "202609",
    );
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => septemberMetadata,
        fetchApi: async () => septemberRecords,
      }),
    ).rejects.toMatchObject({ code: "cpi-period-unapproved" });

    const { metadataPayload: juneMetadata, records: juneRecords } = await apiFixtures(
      root,
      "202606",
    );
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => juneMetadata,
        fetchApi: async () => juneRecords,
      }),
    ).rejects.toMatchObject({ code: "cpi-period-regression" });

    const makeAdapter = (apiRecords) =>
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => metadataPayload,
        fetchApi: async () => apiRecords,
      });
    const missingAllUnits = records.map((record) => {
      const withoutUnit = { ...record };
      delete withoutUnit["@unit"];
      return withoutUnit;
    });
    const inferredUnitResult = await makeAdapter(missingAllUnits);
    expect(inferredUnitResult.validationSummary.unitEvidence).toBe(
      "historical-overlap-plus-2025-base-year",
    );
    expect(
      JSON.parse(inferredUnitResult.artifacts[1].bytes.toString("utf8")).selectedApiSourceIdentity
        .unitEvidence,
    ).toBe("historical-overlap-plus-2025-base-year");

    const explicitMetadata = structuredClone(metadataPayload);
    const tabClass = explicitMetadata.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "tab",
    ).CLASS;
    tabClass["@unit"] = "２０２５年 ＝ １００";
    const metadataUnitResult = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => explicitMetadata,
      fetchApi: async () => records,
    });
    expect(metadataUnitResult.validationSummary.unitEvidence).toBe("official-metadata");

    const missingAllValueUnitsWithMetadata = records.map((record) => {
      const withoutUnit = { ...record };
      delete withoutUnit["@unit"];
      return withoutUnit;
    });
    const metadataOnlyUnitResult = await cpiAdapter({
      source,
      root,
      getStatsList: async () => ({ candidates: [cpiCandidate()] }),
      getDataCatalog: async () => cpiCatalog(),
      getMetaInfo: async () => explicitMetadata,
      fetchApi: async () => missingAllValueUnitsWithMetadata,
    });
    expect(metadataOnlyUnitResult.validationSummary.unitEvidence).toBe("official-metadata");

    const wrongMetadata = structuredClone(metadataPayload);
    wrongMetadata.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ.find(
      (item) => item["@id"] === "tab",
    ).CLASS["@unit"] = "指数";
    let wrongMetadataValueCalls = 0;
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => wrongMetadata,
        fetchApi: async () => {
          wrongMetadataValueCalls += 1;
          return records;
        },
      }),
    ).rejects.toMatchObject({ code: "cpi-meta-unit-unproven" });
    expect(wrongMetadataValueCalls).toBe(0);

    const missingValueUnitWithMetadata = records.map((record, index) => {
      if (index !== 0) return record;
      const withoutUnit = { ...record };
      delete withoutUnit["@unit"];
      return withoutUnit;
    });
    await expect(
      cpiAdapter({
        source,
        root,
        getStatsList: async () => ({ candidates: [cpiCandidate()] }),
        getDataCatalog: async () => cpiCatalog(),
        getMetaInfo: async () => explicitMetadata,
        fetchApi: async () => missingValueUnitWithMetadata,
      }),
    ).rejects.toMatchObject({ code: "cpi-api-unit-unproven" });

    const wrongUnit = records.map((record, index) =>
      index === 0 ? { ...record, "@unit": "指数" } : record,
    );
    await expect(makeAdapter(wrongUnit)).rejects.toMatchObject({ code: "cpi-api-unit-unproven" });

    const mixedUnit = records.map((record, index) =>
      index === 1 ? { ...record, "@unit": "2020年=100" } : record,
    );
    await expect(makeAdapter(mixedUnit)).rejects.toMatchObject({ code: "cpi-api-unit-mismatch" });
  }, 30_000);

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
