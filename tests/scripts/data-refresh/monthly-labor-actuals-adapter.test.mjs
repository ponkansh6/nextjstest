import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import {
  MONTHLY_LABOR_ACTUALS_PATHS,
  monthlyLaborActualsAdapter,
  parseMonthlyLaborActualWorkbook,
  resolveLatestMonthlyLaborActuals,
} from "../../../scripts/data-refresh/adapters/monthly-labor-actuals.mjs";
import { registry } from "../../../scripts/data-refresh/registry/index.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function catalogDataset({ period, revision = "確報", statInfId = "000040491571" }) {
  const [year, month] = period.split("-").map(Number);
  return {
    TITLE: {
      NAME: "毎月勤労統計調査 全国調査 / 実数原表・実数推計等 / 実数原表（2012年1月～）",
      CYCLE: "月次",
      SURVEY_DATE: `${period.slice(0, 4)}年${month}月`,
    },
    STAT_NAME: { "@code": "00450071", NAME: "毎月勤労統計調査" },
    RESOURCE: [
      {
        "@id": `resource-${statInfId}`,
        TITLE: { NAME: `毎勤原表（令和${year - 2018}年${month}月${revision}）` },
        FORMAT: "XLS_REP",
        URL: `https://www.e-stat.go.jp/stat-search/file-download?fileKind=4&statInfId=${statInfId}`,
        RELEASE_DATE: `${period}-23`,
        LAST_MODIFIED_DATE: `${period}-23`,
      },
    ],
  };
}

function workbookFor(
  period,
  revision = "確報",
  updates = {},
  headerOverrides = {},
  groupHeaderOverrides = {},
  { additionalRows = [], targetMarkers = ["T", "T", "T"] } = {},
) {
  const [year, month] = period.split("-").map(Number);
  const rows = Array.from({ length: 7 }, () => []);
  rows[0][7] = "毎月勤労統計調査全国調査結果原表";
  rows[1] = [
    "",
    "",
    "",
    "",
    "",
    `令和 ${year - 2018}年`,
    `${month}月分`,
    "",
    "",
    "",
    "",
    "",
    "",
    `（ ${revision.split("").join(" ")} ）`,
  ];
  rows[3][3] = "常　　　用　　　労　　　働　　　者　　　数";
  rows[3][9] = "実　労　働　時　間　数";
  rows[3][12] = "現　　　　金　　　　給　　　　与　　　　額";
  rows[4][6] = "本調査期間末";
  rows[4][9] = "総    数";
  rows[4][12] = "総　　　　額";
  rows[4][13] = "きまって支\n給する給与";
  rows[4][14] = "所定内給与";
  for (const [column, value] of Object.entries(groupHeaderOverrides))
    rows[3][Number(column)] = value;
  rows[6][6] = "人";
  rows[6][9] = "時間";
  rows[6][12] = "円";
  rows[6][13] = "円";
  rows[6][14] = "円";
  for (const [column, value] of Object.entries(headerOverrides)) rows[4][Number(column)] = value;
  const values = [];
  values[0] = targetMarkers[0];
  values[1] = targetMarkers[1];
  values[2] = targetMarkers[2];
  values[6] = updates.employment_indices ?? 52_186_412;
  values[9] = updates.total_worked_hours ?? 139.3;
  values[12] = updates.total_earning ?? 534_823;
  values[13] = updates.contractual_earnings ?? 299_671;
  values[14] = updates.scheduled_earnings ?? 279_511;
  rows.push(values, ...additionalRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "実数原表");
  return XLSX.write(workbook, { type: "buffer", bookType: "xls" });
}

function source() {
  return registry.sources.find(({ id }) => id === "monthly-labor-actuals");
}

async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "monthly-labor-actuals-"));
  temporaryRoots.push(root);
  return root;
}

async function seedPreviousSnapshot(root, period, totalEarning) {
  const csv = [
    "series,年月,value,unit,target,revision",
    `total_earning,${period},${totalEarning},円,現金給与額/総額,確報`,
    `contractual_earnings,${period},299671,円,現金給与額/きまって支給する給与,確報`,
    `scheduled_earnings,${period},279511,円,現金給与額/所定内給与,確報`,
    `total_worked_hours,${period},139.3,時間,実労働時間数/総数,確報`,
    `employment_indices,${period},52186412,人,常用労働者数/本調査期間末,確報`,
    "",
  ].join("\n");
  const metadataPath = path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.metadata);
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(
    metadataPath,
    JSON.stringify({
      period,
      normalizedCsvSha256: createHash("sha256").update(csv).digest("hex"),
    }),
  );
  await writeFile(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.csv), csv);
}

describe("monthly labor actuals adapter", () => {
  it("selects the latest confirmed result and excludes a later preliminary result", () => {
    const candidate = resolveLatestMonthlyLaborActuals(
      [
        catalogDataset({ period: "2026-06" }),
        catalogDataset({ period: "2026-08" }),
        catalogDataset({ period: "2026-09", revision: "速報" }),
      ],
      { now: new Date("2026-11-08T00:00:00.000Z") },
    );
    expect(candidate).toMatchObject({ period: "2026-08", revision: "確報" });
    expect(candidate.format).toBe("XLS_REP");
  });

  it("filters historical same-month ties by the target dataset classification", () => {
    const oldPublishedValues = catalogDataset({ period: "2020-04", statInfId: "000040491572" });
    oldPublishedValues.TITLE.NAME = "毎月勤労統計調査 全国調査 / 従来の公表値 / 実数原表";
    const oldSampleSeries = catalogDataset({ period: "2020-04", statInfId: "000040491573" });
    oldSampleSeries.TITLE.NAME = "毎月勤労統計調査 全国調査 / 500人以上規模抽出調査系列 / 実数原表";
    expect(
      resolveLatestMonthlyLaborActuals([
        oldPublishedValues,
        oldSampleSeries,
        catalogDataset({ period: "2026-08" }),
      ]),
    ).toMatchObject({ period: "2026-08" });
    expect(() =>
      resolveLatestMonthlyLaborActuals([oldPublishedValues, oldSampleSeries]),
    ).toThrowError();
  });

  it("rejects catalog records that conflict with the statistic or monthly frequency", () => {
    const wrongStatisticsCode = catalogDataset({ period: "2026-08" });
    wrongStatisticsCode.STAT_NAME["@code"] = "00450072";
    expect(() => resolveLatestMonthlyLaborActuals([wrongStatisticsCode])).toThrowError();

    const nonMonthly = catalogDataset({ period: "2026-08" });
    nonMonthly.TITLE.CYCLE = "四半期";
    expect(() => resolveLatestMonthlyLaborActuals([nonMonthly])).toThrowError();
  });

  it("uses the month-specific resource title when the dataset title is generic", () => {
    const dataset = catalogDataset({ period: "2026-08" });
    expect(dataset.TITLE.NAME).toContain("実数原表（2012年1月～）");
    expect(dataset.RESOURCE[0].TITLE.NAME).toBe("毎勤原表（令和8年8月確報）");
    expect(
      resolveLatestMonthlyLaborActuals([dataset], {
        now: new Date("2026-11-08T00:00:00.000Z"),
      }),
    ).toMatchObject({
      period: "2026-08",
      title: "毎勤原表（令和8年8月確報）",
      datasetTitle: "毎月勤労統計調査 全国調査 / 実数原表・実数推計等 / 実数原表（2012年1月～）",
      statInfId: "000040491571",
    });
  });

  it("fails closed when the latest target resource has an unsupported format", () => {
    const unsupported = catalogDataset({ period: "2026-08" });
    unsupported.RESOURCE[0].FORMAT = "PDF";
    expect(() => resolveLatestMonthlyLaborActuals([unsupported])).toThrowError();
  });

  it("fails closed for missing, tied, or latest unsupported catalog candidates", () => {
    expect(() => resolveLatestMonthlyLaborActuals([])).toThrowError();

    const duplicateA = catalogDataset({ period: "2026-08", statInfId: "000040491578" });
    const duplicateB = catalogDataset({ period: "2026-08", statInfId: "000040491579" });
    expect(() => resolveLatestMonthlyLaborActuals([duplicateA, duplicateB])).toThrowError();

    const unsupportedLatest = catalogDataset({ period: "2026-08" });
    unsupportedLatest.RESOURCE[0].FORMAT = "XLSX";
    expect(() =>
      resolveLatestMonthlyLaborActuals([catalogDataset({ period: "2026-07" }), unsupportedLatest]),
    ).toThrowError();
  });

  it("attaches fixed non-sensitive diagnostics when catalog rows do not match", () => {
    const unrelated = catalogDataset({ period: "2026-08" });
    unrelated.TITLE.NAME = "毎月勤労統計調査 全国調査 / 指数原表";
    let failure;
    try {
      resolveLatestMonthlyLaborActuals([unrelated]);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "actuals-catalog-candidate-missing",
      apiPhase: "catalog",
      candidateDiagnostics: {
        datasetRows: 1,
        resourceRows: 0,
        statisticsCodeMatches: 1,
        statisticsNameMatches: 1,
        nationwideMatches: 1,
        actualTableMatches: 0,
        candidateMatches: 0,
      },
    });
    expect(JSON.stringify(failure.candidateDiagnostics)).not.toContain("https://");
    expect(JSON.stringify(failure.candidateDiagnostics)).not.toContain("appId");
  });

  it("extracts all five values only when the workbook period and confirmed status match", () => {
    const parsed = parseMonthlyLaborActualWorkbook(workbookFor("2026-08"), "2026-08");
    expect(parsed.period).toBe("2026-08");
    expect(parsed.values.map(({ series }) => series)).toEqual([
      "total_earning",
      "contractual_earnings",
      "scheduled_earnings",
      "total_worked_hours",
      "employment_indices",
    ]);
    expect(() =>
      parseMonthlyLaborActualWorkbook(workbookFor("2026-08", "速報"), "2026-08"),
    ).toThrowError();
    expect(() => parseMonthlyLaborActualWorkbook(workbookFor("2026-08"), "2026-07")).toThrowError();
    expect(() =>
      parseMonthlyLaborActualWorkbook(
        workbookFor("2026-08", "確報", {}, { 12: "所定内給与" }),
        "2026-08",
      ),
    ).toThrowError();
    expect(() =>
      parseMonthlyLaborActualWorkbook(
        workbookFor("2026-08", "確報", {}, { 12: "総額（速報値）" }),
        "2026-08",
      ),
    ).toThrowError(/verified header mapping/);
    expect(() =>
      parseMonthlyLaborActualWorkbook(
        workbookFor("2026-08", "確報", {}, {}, { 12: "現金給与額（総額）" }),
        "2026-08",
      ),
    ).toThrowError(/verified header mapping/);
  });

  it("selects only the first aggregate row and rejects a changed first-row scope", () => {
    const laterMatchingRows = [
      ["T", "T", "T", "", "", "", 999, "", "", 999, "", "", 999, 999, 999],
      ["T", "T", "T", "", "", "", 888, "", "", 888, "", "", 888, 888, 888],
    ];
    const parsed = parseMonthlyLaborActualWorkbook(
      workbookFor(
        "2026-08",
        "確報",
        { total_earning: 12_345, contractual_earnings: 9_876 },
        {},
        {},
        { additionalRows: laterMatchingRows },
      ),
      "2026-08",
    );
    expect(parsed.values.map(({ value }) => value)).toEqual([
      12_345, 9_876, 279_511, 139.3, 52_186_412,
    ]);

    expect(() =>
      parseMonthlyLaborActualWorkbook(
        workbookFor("2026-08", "確報", {}, {}, {}, { targetMarkers: ["T", "", "T"] }),
        "2026-08",
      ),
    ).toThrowError(expect.objectContaining({ code: "actuals-workbook-target-mismatch" }));
  });

  it("stages stable current-snapshot paths with source provenance", async () => {
    const root = await tempRoot();
    const workbook = workbookFor("2026-08");
    const selectedStatInfId = "000040491579";
    let observedQuery;
    const result = await monthlyLaborActualsAdapter({
      source: source(),
      root,
      now: () => new Date("2026-11-08T00:00:00.000Z"),
      getDataCatalog: async (query) => {
        observedQuery = query;
        return {
          datasets: [catalogDataset({ period: "2026-08", statInfId: selectedStatInfId })],
        };
      },
      fetchFile: async ({ url, allowedHosts }) => {
        expect(url).toContain(`statInfId=${selectedStatInfId}`);
        expect(allowedHosts).toEqual(["www.e-stat.go.jp"]);
        return { bytes: workbook, contentType: "application/vnd.ms-excel" };
      },
    });
    expect(observedQuery).toEqual({ statsCode: "00450071", searchWord: "毎勤原表" });
    expect(Object.hasOwn(observedQuery, "dataType")).toBe(false);
    expect(result.artifacts.map(({ path: artifactPath }) => artifactPath)).toEqual([
      MONTHLY_LABOR_ACTUALS_PATHS.csv,
      MONTHLY_LABOR_ACTUALS_PATHS.metadata,
      MONTHLY_LABOR_ACTUALS_PATHS.source,
    ]);
    const metadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(metadata).toMatchObject({
      period: "2026-08",
      revision: "確報",
      statInfId: selectedStatInfId,
      statisticsCode: "00450071",
      catalogResourceId: `resource-${selectedStatInfId}`,
    });
    expect(JSON.stringify(metadata)).not.toMatch(/appId|api.?key|token=/i);
    expect(result.artifacts[0].bytes.toString("utf8")).toContain("total_earning,2026-08,534823");
  });

  it("rejects a catalog candidate that regresses behind the published period", async () => {
    const root = await tempRoot();
    await mkdir(path.dirname(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.metadata)), {
      recursive: true,
    });
    const oldCsv = "series,年月,value,unit,target,revision\n";
    await writeFile(
      path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.metadata),
      JSON.stringify({
        period: "2026-08",
        normalizedCsvSha256: createHash("sha256").update(oldCsv).digest("hex"),
      }),
    );
    await writeFile(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.csv), oldCsv);
    await expect(
      monthlyLaborActualsAdapter({
        source: source(),
        root,
        now: () => new Date("2026-11-08T00:00:00.000Z"),
        getDataCatalog: async () => ({ datasets: [catalogDataset({ period: "2026-07" })] }),
        fetchFile: async () => ({
          bytes: workbookFor("2026-07"),
          contentType: "application/vnd.ms-excel",
        }),
      }),
    ).rejects.toMatchObject({ code: "actuals-period-regression" });
  });

  it("reports same-period revisions in check mode and requires matching approval to publish", async () => {
    const root = await tempRoot();
    await seedPreviousSnapshot(root, "2026-08", 534_000);
    const previousCsv = await readFile(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.csv));
    const previousMetadata = await readFile(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.metadata));
    const candidateWorkbook = workbookFor("2026-08");
    const candidateSha256 = createHash("sha256").update(candidateWorkbook).digest("hex");
    const base = {
      source: source(),
      root,
      now: () => new Date("2026-11-08T00:00:00.000Z"),
      getDataCatalog: async () => ({ datasets: [catalogDataset({ period: "2026-08" })] }),
      fetchFile: async () => ({
        bytes: candidateWorkbook,
        contentType: "application/vnd.ms-excel",
      }),
    };
    const checked = await monthlyLaborActualsAdapter({ ...base, check: true });
    expect(checked.revisionAudit.actualsSnapshot).toMatchObject({
      comparedObservationCount: 5,
      changedObservationCount: 1,
      approvalRequired: true,
      changedSample: [
        {
          series: "total_earning",
          month: "2026-08",
          oldValue: 534_000,
          newValue: 534_823,
        },
      ],
    });
    expect(checked.revisionAudit.actualsSnapshot.approval).toEqual({
      period: "2026-08",
      sourceSha256: candidateSha256,
    });
    expect(await readFile(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.csv))).toEqual(previousCsv);
    expect(await readFile(path.join(root, MONTHLY_LABOR_ACTUALS_PATHS.metadata))).toEqual(
      previousMetadata,
    );
    await expect(monthlyLaborActualsAdapter(base)).rejects.toMatchObject({
      code: "actuals-same-period-revision-approval-required",
    });
    await expect(
      monthlyLaborActualsAdapter({
        ...base,
        approveActualsRevision: {
          period: "2026-08",
          sourceSha256: "0".repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: "actuals-same-period-revision-approval-required" });
    const approved = await monthlyLaborActualsAdapter({
      ...base,
      approveActualsRevision: {
        period: "2026-08",
        sourceSha256: candidateSha256,
      },
    });
    expect(approved.validationSummary).toMatchObject({
      samePeriodRevision: true,
      samePeriodRevisionApproved: true,
      changedSeriesCount: 1,
    });
  });
});
