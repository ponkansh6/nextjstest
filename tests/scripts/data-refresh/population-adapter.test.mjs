import { afterEach, describe, expect, it } from "vitest";
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
};

async function makeRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "data-refresh-population-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function makeWorkbook(endPeriod) {
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
    row[4] =
      year === 2026 && month === 5 ? 10976 : year === 2026 && month === 6 ? 10969 : 10000 + month;
    rows.push(row);
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "原数値");
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
  return {
    source: "総務省統計局 労働力調査（基本集計）長期時系列 表1-b-1",
    sourceUrl:
      "https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000031831366",
    statInfId: "000031831366",
    tableId: "1-b-1",
    title: "15歳以上人口（年齢階級（10歳階級）別）",
    unit: "万人",
    sha256: hash(bytes),
    verifiedObservations,
  };
}

async function writeMetadata(root, metadata) {
  const metadataPath = path.join(root, "data/source/population_statistics.metadata.json");
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, JSON.stringify(metadata));
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
  it("reproduces converter BOM, headers, rows and values from injected workbook bytes", async () => {
    const root = await makeRoot();
    const bytes = makeWorkbook("2026-06");
    const expectedObservations = { "2026-05": 10976, "2026-06": 10969 };
    const metadataPath = await writeMetadata(root, metadataFor(bytes, expectedObservations));
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
        return { bytes };
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
    expect(generatedMetadata.resultSha256).toBe(hash(result.artifacts[0].bytes));
    expect(generatedMetadata.period).toEqual({
      start: "2004-01",
      end: "2026-06",
      monthlyRows: 270,
    });
    expect(result.semanticValue).not.toHaveProperty("sha256");
    expect(await readdir(path.dirname(metadataPath))).toEqual([
      "population_statistics.metadata.json",
    ]);
    await expect(
      readFile(path.join(root, "data/source/population_statistics.csv")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a stale verified coverage claim before returning any artifacts", async () => {
    const root = await makeRoot();
    const bytes = makeWorkbook("2026-02");
    await writeMetadata(root, metadataFor(bytes, { "2026-05": 10976, "2026-06": 10969 }));
    const stageRoot = path.join(root, "stage");

    await expect(
      populationAdapter({
        source,
        root,
        stageRoot,
        fetchFile: async () => ({ bytes }),
      }),
    ).rejects.toMatchObject({ code: "population-source-provenance-mismatch" });

    await expect(readdir(stageRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(root, "data/source/population_statistics.csv")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects duplicate year-month observations before they can overwrite each other", async () => {
    const root = await makeRoot();
    const bytes = withDuplicateFinalObservation(makeWorkbook("2026-06"));
    await writeMetadata(root, metadataFor(bytes, { "2026-05": 10976, "2026-06": 10969 }));
    const stageRoot = path.join(root, "stage");

    await expect(
      populationAdapter({
        source,
        root,
        stageRoot,
        fetchFile: async () => ({ bytes }),
      }),
    ).rejects.toMatchObject({ code: "population-coverage-invalid" });

    await expect(readdir(stageRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(root, "data/source/population_statistics.csv")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects fetched bytes whose hash differs from the verified source hash", async () => {
    const root = await makeRoot();
    const verifiedBytes = makeWorkbook("2026-06");
    const fetchedBytes = makeWorkbook("2026-02");
    await writeMetadata(root, metadataFor(verifiedBytes, { "2026-05": 10976, "2026-06": 10969 }));
    const stageRoot = path.join(root, "stage");

    await expect(
      populationAdapter({
        source,
        root,
        stageRoot,
        fetchFile: async () => ({ bytes: fetchedBytes }),
      }),
    ).rejects.toMatchObject({ code: "population-source-provenance-mismatch" });

    await expect(readdir(stageRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(root, "data/source/population_statistics.csv")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires the registered distribution format to be XLSX", async () => {
    await expect(
      populationAdapter({
        source: { ...source, identity: { ...source.identity, format: "csv" } },
      }),
    ).rejects.toMatchObject({ code: "population-identity-mismatch" });
  });
});
