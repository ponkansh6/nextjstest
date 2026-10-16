import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { populationAdapter } from "../../../scripts/data-refresh/adapters/population.mjs";

const roots = [];
const source = {
  id: "population-statistics",
  identity: { kind: "file", statInfId: "000031831366", format: "xlsx" },
  title: "Labor Force Survey table 1-b-1, nationwide monthly population aged 15 or older",
  classifications: ["total population aged 15 or older"],
  frequency: "monthly",
  unit: "万人",
  baseline: "not-applicable",
  period: { from: "2004-01", through: "latest-published" },
  revision: "full-history-revision-required",
};

async function makeRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "data-refresh-population-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function makeWorkbook(endPeriod, overrides = {}) {
  const rows = Array.from({ length: 10 }, () => []);
  rows[0][4] = "長期時系列表１　ｂ－１　15歳以上人口　【年齢階級（10歳階級）別】 － 全国、月別結果";
  rows[1][4] =
    "Historical data 1  b-1 Population aged 15 years old and over - Whole Japan, Monthly Data";
  rows[3][4] = "(万人)";
  rows[6] = [
    "年　月",
    null,
    null,
    null,
    "総数",
    "15～64歳",
    null,
    null,
    null,
    null,
    null,
    "65歳以上",
    "（再掲）",
    "総数",
    "15～64歳",
    null,
    null,
    null,
    null,
    null,
    "65歳以上",
    "（再掲）",
    "総数",
    "15～64歳",
    null,
    null,
    null,
    null,
    null,
    "65歳以上",
    "（再掲）",
  ];
  rows[7] = [
    "Year and month ",
    null,
    null,
    null,
    null,
    null,
    "15～24",
    "25～34",
    "35～44",
    "45～54",
    "55～64",
    null,
    "20～69歳",
  ];
  rows[8] = [null, null, null, null, "Total"];

  const [endYear, endMonth] = endPeriod.split("-").map(Number);
  const monthCount = (endYear - 2004) * 12 + endMonth;
  for (let offset = 0; offset < monthCount; offset += 1) {
    const year = 2004 + Math.floor(offset / 12);
    const month = (offset % 12) + 1;
    const row = [];
    if (month === 1) row[0] = year;
    row[1] = `${month}月`;
    row[2] = "Jan.";
    const period = `${year}-${String(month).padStart(2, "0")}`;
    row[4] =
      overrides[period] ??
      (year === 2026 && month === 5 ? 10976 : year === 2026 && month === 6 ? 10969 : 10000 + month);
    rows.push(row);
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "原数値");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

function withSheetNames(bytes, sheetNames) {
  const original = XLSX.read(bytes, { type: "buffer" });
  const workbook = {
    SheetNames: sheetNames,
    Sheets: Object.fromEntries(
      sheetNames.map((name) => [
        name,
        name === "原数値" ? original.Sheets["原数値"] : XLSX.utils.aoa_to_sheet([]),
      ]),
    ),
  };
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

function withDuplicateFinalObservation(bytes) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["原数値"], { header: 1 });
  rows.push([...rows.at(-1)]);
  const duplicateWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(duplicateWorkbook, XLSX.utils.aoa_to_sheet(rows), "原数値");
  return Buffer.from(XLSX.write(duplicateWorkbook, { type: "buffer", bookType: "xlsx" }));
}

function metadataFor(bytes, verifiedObservations) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["原数値"], { header: 1 });
  const endYear = Number(rows.at(-1)[0] ?? rows.at(-2)[0] ?? 2026);
  const finalMonth = rows.at(-1)[1];
  const endMonth = Number(String(finalMonth).match(/(\d+)月/)?.[1] ?? 6);
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}`;
  const [year, month] = end.split("-").map(Number);
  return {
    source: "総務省統計局 労働力調査（基本集計）長期時系列 表1-b-1",
    sourceUrl:
      "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000031831366",
    statInfId: "000031831366",
    tableId: "1-b-1",
    title: "15歳以上人口（年齢階級（10歳階級）別）",
    unit: "万人",
    retrievedAt: "2026-09-12T11:14:39+09:00",
    file: "data/source/economics_source/lt01-b10.xlsx",
    fileSizeBytes: bytes.byteLength,
    sha256: hash(bytes),
    verifiedObservations,
    period: { start: "2004-01", end, monthlyRows: (year - 2004) * 12 + month },
  };
}

async function writeMetadata(root, metadata, retainedBytes) {
  const metadataPath = path.join(root, "data/source/population_statistics.metadata.json");
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, JSON.stringify(metadata));
  const retainedPath = path.join(root, metadata.file);
  await mkdir(path.dirname(retainedPath), { recursive: true });
  await writeFile(retainedPath, retainedBytes);
  return metadataPath;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedConverterCsv(bytes) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets["原数値"], { header: 1 });
  const count = Math.max(rows[6].length, rows[7].length, rows[8].length);
  const seen = new Map();
  const headers = Array.from({ length: count }, (_, index) => {
    const raw = rows[6][index];
    let value = raw == null || String(raw).trim() === "" ? `Unnamed: ${index}` : String(raw);
    const occurrence = seen.get(value) ?? 0;
    seen.set(value, occurrence + 1);
    if (occurrence) value = `${value}.${occurrence}`;
    return value;
  });
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    return /[,"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [headers.map(escape).join(",")];
  for (let rowIndex = 7; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    lines.push(
      Array.from({ length: count }, (_, col) => escape(col < row.length ? row[col] : null)).join(
        ",",
      ),
    );
  }
  return `\ufeff${lines.join("\n")}\n`;
}

describe("population refresh adapter", () => {
  it("accepts the known supplemental sheets and reads only the primary original-values sheet", async () => {
    const root = await makeRoot();
    const baselineBytes = makeWorkbook("2026-06");
    const fetchedBytes = withSheetNames(baselineBytes, [
      "原数値",
      "原数値 (沖縄県除く1968-1972)",
      "※注_Notes",
    ]);
    await writeMetadata(
      root,
      metadataFor(baselineBytes, { "2026-05": 10976, "2026-06": 10969 }),
      baselineBytes,
    );

    const result = await populationAdapter({
      source,
      root,
      fetchFile: async () => ({ bytes: fetchedBytes, contentType: "application/octet-stream" }),
    });

    expect(result.artifacts[0].bytes.toString("utf8")).toBe(expectedConverterCsv(baselineBytes));
    expect(JSON.parse(result.artifacts[1].bytes.toString("utf8")).period.end).toBe("2026-06");
  });

  it.each([
    ["unknown supplemental sheet", ["原数値", "Unexpected"]],
    ["wrong primary sheet", ["Unexpected", "原数値"]],
  ])("rejects a workbook with %s", async (_description, sheetNames) => {
    const root = await makeRoot();
    const baselineBytes = makeWorkbook("2026-06");
    const invalidBytes = withSheetNames(baselineBytes, sheetNames);
    await writeMetadata(
      root,
      metadataFor(baselineBytes, { "2026-05": 10976, "2026-06": 10969 }),
      baselineBytes,
    );

    await expect(
      populationAdapter({
        source,
        root,
        fetchFile: async () => ({ bytes: invalidBytes, contentType: "application/octet-stream" }),
      }),
    ).rejects.toMatchObject({ code: "population-workbook-contract-mismatch" });
  });

  it("rejects duplicate sheet names", async () => {
    const root = await makeRoot();
    const baselineBytes = makeWorkbook("2026-06");
    const fetchedBytes = makeWorkbook("2026-06");
    await writeMetadata(
      root,
      metadataFor(baselineBytes, { "2026-05": 10976, "2026-06": 10969 }),
      baselineBytes,
    );
    const read = XLSX.read.bind(XLSX);
    vi.spyOn(XLSX, "read").mockImplementation((bytes, options) => {
      if (Buffer.from(bytes).equals(fetchedBytes)) {
        return {
          SheetNames: ["原数値", "原数値"],
          Sheets: { 原数値: read(bytes, options).Sheets["原数値"] },
        };
      }
      return read(bytes, options);
    });

    await expect(
      populationAdapter({
        source,
        root,
        fetchFile: async () => ({ bytes: fetchedBytes, contentType: "application/octet-stream" }),
      }),
    ).rejects.toMatchObject({ code: "population-workbook-contract-mismatch" });
  });

  it("reproduces converter BOM, headers, rows and values from injected workbook bytes", async () => {
    const root = await makeRoot();
    const bytes = makeWorkbook("2026-06");
    const expectedObservations = { "2026-05": 10976, "2026-06": 10969 };
    const metadataPath = await writeMetadata(root, metadataFor(bytes, expectedObservations), bytes);
    const stageRoot = path.join(root, "stage");
    let requests = 0;

    const result = await populationAdapter({
      source,
      root,
      stageRoot,
      now: () => new Date("2026-07-01T00:00:00.000Z"),
      fetchFile: async ({ url }) => {
        requests += 1;
        expect(url).toBe(metadataFor(bytes, expectedObservations).sourceUrl);
        return { bytes, contentType: "application/octet-stream" };
      },
    });

    expect(requests).toBe(1);
    expect(result.artifacts.map(({ path: output }) => output)).toEqual([
      "data/source/population_statistics.csv",
      "data/source/population_statistics.metadata.json",
    ]);
    expect(result.artifacts[0].bytes.toString("utf8")).toBe(expectedConverterCsv(bytes));
    expect(result.artifacts[0].bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    const generatedMetadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(generatedMetadata.sha256).toBe(hash(bytes));
    expect(generatedMetadata.lastFetchedSource).toMatchObject({
      sha256: hash(bytes),
      fileSizeBytes: bytes.byteLength,
      contentType: "application/octet-stream",
    });
    expect(generatedMetadata.resultSha256).toBe(hash(result.artifacts[0].bytes));
    expect(generatedMetadata.period).toEqual({
      start: "2004-01",
      end: "2026-06",
      monthlyRows: 270,
    });
    expect(result.semanticValue).not.toHaveProperty("sha256");
    expect((await readdir(path.dirname(metadataPath))).sort()).toEqual([
      "economics_source",
      "population_statistics.metadata.json",
    ]);
    expect(
      (await readdir(path.join(path.dirname(metadataPath), "economics_source"))).sort(),
    ).toEqual(["lt01-b10.xlsx"]);
    await expect(
      readFile(path.join(root, "data/source/population_statistics.csv")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects coverage regression before returning any artifacts", async () => {
    const root = await makeRoot();
    const bytes = makeWorkbook("2026-02");
    const previousBytes = makeWorkbook("2026-06");
    await writeMetadata(
      root,
      metadataFor(previousBytes, { "2026-05": 10976, "2026-06": 10969 }),
      previousBytes,
    );
    const stageRoot = path.join(root, "stage");

    await expect(
      populationAdapter({
        source,
        root,
        stageRoot,
        fetchFile: async () => ({ bytes, contentType: "application/octet-stream" }),
      }),
    ).rejects.toMatchObject({ code: "population-coverage-regression" });

    await expect(readdir(stageRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(root, "data/source/population_statistics.csv")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects retained workbook bytes that do not match their metadata hash", async () => {
    const root = await makeRoot();
    const retainedMetadataBytes = makeWorkbook("2026-06");
    const actualRetainedBytes = makeWorkbook("2026-02");
    await writeMetadata(
      root,
      metadataFor(retainedMetadataBytes, { "2026-05": 10976, "2026-06": 10969 }),
      actualRetainedBytes,
    );
    let fetchCount = 0;

    await expect(
      populationAdapter({
        source,
        root,
        fetchFile: async () => {
          fetchCount += 1;
          return { bytes: retainedMetadataBytes, contentType: "application/octet-stream" };
        },
      }),
    ).rejects.toMatchObject({ code: "population-retained-source-mismatch" });
    expect(fetchCount).toBe(0);
  });

  it("rejects duplicate year-month observations before they can overwrite each other", async () => {
    const root = await makeRoot();
    const bytes = withDuplicateFinalObservation(makeWorkbook("2026-06"));
    await writeMetadata(root, metadataFor(bytes, { "2026-05": 10976, "2026-06": 10969 }), bytes);
    const stageRoot = path.join(root, "stage");

    await expect(
      populationAdapter({
        source,
        root,
        stageRoot,
        fetchFile: async () => ({ bytes, contentType: "application/octet-stream" }),
      }),
    ).rejects.toMatchObject({ code: "population-coverage-invalid" });

    await expect(readdir(stageRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(root, "data/source/population_statistics.csv")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("accepts an official revision under the same identity and records it against baseline evidence", async () => {
    const root = await makeRoot();
    const verifiedBytes = makeWorkbook("2026-06");
    const fetchedBytes = makeWorkbook("2026-06", { "2026-05": 10977 });
    await writeMetadata(
      root,
      metadataFor(verifiedBytes, { "2026-05": 10976, "2026-06": 10969 }),
      verifiedBytes,
    );
    const canonicalPath = path.join(root, "data/source/population_statistics.csv");
    await mkdir(path.dirname(canonicalPath), { recursive: true });
    await writeFile(canonicalPath, expectedConverterCsv(verifiedBytes));
    const stageRoot = path.join(root, "stage");

    const result = await populationAdapter({
      source,
      root,
      stageRoot,
      fetchFile: async () => ({ bytes: fetchedBytes, contentType: "application/octet-stream" }),
    });
    const metadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(metadata.file).toBe("data/source/economics_source/lt01-b10.xlsx");
    expect(metadata.sha256).toBe(hash(verifiedBytes));
    expect(metadata.fileSizeBytes).toBe(verifiedBytes.byteLength);
    const retainedBytes = await readFile(path.join(root, metadata.file));
    expect(retainedBytes.byteLength).toBe(metadata.fileSizeBytes);
    expect(hash(retainedBytes)).toBe(metadata.sha256);
    expect(metadata.lastFetchedSource.sha256).toBe(hash(fetchedBytes));
    expect(metadata.lastFetchedSource.fileSizeBytes).toBe(fetchedBytes.byteLength);
    expect(metadata.baselineEvidence.sha256).toBe(hash(verifiedBytes));
    expect(metadata.baselineEvidence.verifiedObservations).toEqual({
      "2026-05": 10976,
      "2026-06": 10969,
    });
    expect(metadata.revisionAudit).toEqual({
      comparedObservationCount: 270,
      changedObservationCount: 1,
      changedSample: [{ period: "2026-05", previous: 10976, current: 10977 }],
      previousSha256: hash(verifiedBytes),
      currentSha256: hash(fetchedBytes),
      previousRetrievedAt: "2026-09-12T11:14:39+09:00",
      retrievedAt: expect.any(String),
    });
    expect(result.revisionAudit.population).toMatchObject({
      comparedObservationCount: 270,
      changedObservationCount: 1,
      changedSample: [{ period: "2026-05", previous: 10976, current: 10977 }],
    });
    expect(result.revisionAudit.population.changedSample).toHaveLength(1);
    expect(result.semanticValue).toMatchObject({
      frequency: "monthly",
      unit: "万人",
      baseline: "not-applicable",
      series: "nationwide-original-values",
    });

    await writeFile(
      path.join(root, "data/source/population_statistics.csv"),
      result.artifacts[0].bytes,
    );
    await writeFile(
      path.join(root, "data/source/population_statistics.metadata.json"),
      result.artifacts[1].bytes,
    );
    const nextResult = await populationAdapter({
      source,
      root,
      fetchFile: async () => ({ bytes: fetchedBytes, contentType: "application/octet-stream" }),
    });
    const nextMetadata = JSON.parse(nextResult.artifacts[1].bytes.toString("utf8"));
    expect(nextMetadata.revisionAudit).toMatchObject({
      comparedObservationCount: 270,
      changedObservationCount: 0,
      changedSample: [],
      previousSha256: hash(fetchedBytes),
      currentSha256: hash(fetchedBytes),
    });
    expect(nextMetadata.baselineEvidence.sha256).toBe(hash(verifiedBytes));
  });

  it("accepts contiguous coverage expansion while retaining the prior baseline", async () => {
    const root = await makeRoot();
    const baselineBytes = makeWorkbook("2026-06");
    const expandedBytes = makeWorkbook("2026-07");
    await writeMetadata(
      root,
      metadataFor(baselineBytes, { "2026-05": 10976, "2026-06": 10969 }),
      baselineBytes,
    );

    const result = await populationAdapter({
      source,
      root,
      fetchFile: async () => ({ bytes: expandedBytes, contentType: "application/octet-stream" }),
    });
    const metadata = JSON.parse(result.artifacts[1].bytes.toString("utf8"));
    expect(metadata.period).toEqual({ start: "2004-01", end: "2026-07", monthlyRows: 271 });
    expect(metadata.baselineEvidence.sha256).toBe(hash(baselineBytes));
    expect(metadata.revisionAudit.changedObservationCount).toBe(0);
  });

  it("rejects a registry source with changed identity dimensions", async () => {
    await expect(
      populationAdapter({
        source: { ...source, unit: "人" },
      }),
    ).rejects.toMatchObject({ code: "population-identity-mismatch" });
  });

  it("requires the registered distribution format to be XLSX", async () => {
    await expect(
      populationAdapter({
        source: { ...source, identity: { ...source.identity, format: "csv" } },
      }),
    ).rejects.toMatchObject({ code: "population-identity-mismatch" });
  });

  it("rejects a non-XLSX media type even when the payload is parseable", async () => {
    const root = await makeRoot();
    const bytes = makeWorkbook("2026-06");
    await writeMetadata(root, metadataFor(bytes, { "2026-05": 10976, "2026-06": 10969 }), bytes);
    await expect(
      populationAdapter({
        source,
        root,
        fetchFile: async () => ({ bytes, contentType: "text/plain" }),
      }),
    ).rejects.toMatchObject({ code: "population-workbook-invalid" });
  });
});
