import XLSX from "xlsx";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CTI_BASIC_2025_ROOT,
  CTI_BASIC_2025_SERIES,
  buildCtiBasicConsumptionOutput,
  loadCtiBasicConsumptionOutput,
  normalizeCtiBasicSeriesCsv,
  recordsToNormalizedCsv,
  type CtiBasicRecord,
  type CtiBasicSeriesKind,
} from "../../server/lib/ctiBasicSeries2025LongTerm";
import { sha256Hex, validateCtiBasicManifest } from "../../server/lib/ctiBasicSeries2025LongTerm";
import {
  endpoint,
  isExpectedTitle,
  normalizedCsv,
  parseOfficialFile,
  SERIES,
} from "../../scripts/fetch-cti-basic-series-2025.mjs";

function fixture(
  series = SERIES[0],
  omitMonth?: string,
  extraSheets: string[] = [],
  title = series.title,
) {
  const width = series.valueEnd + 1;
  const rows = Array.from({ length: 12 }, () => Array(width).fill(""));
  rows[0][0] = title;
  rows[series.headerRow - 1][series.timeCodeColumn] = "時間軸コード";
  rows[series.headerRow - 1][series.monthColumn] = "年月";
  for (let i = 0; i < 22; i += 1) {
    rows[series.headerRow - 1][series.valueStart + i] = `費目${i + 1}`;
    if (series.codeRows.length)
      for (const row of series.codeRows) rows[row][series.valueStart + i] = String(i + 1);
  }
  const months = [];
  for (let year = 2002; year <= 2005; year += 1)
    for (let month = 1; month <= 12; month += 1)
      if (year < 2005 || month <= 3) months.push(`${year}年${month}月`);
  months
    .filter((month) => month !== omitMonth)
    .forEach((month, rowOffset) => {
      const row =
        rows[series.dataRow - 1 + rowOffset] ??
        (rows[series.dataRow - 1 + rowOffset] = Array(width).fill(""));
      row[series.timeCodeColumn] = `T${rowOffset}`;
      row[series.monthColumn] = month;
      for (let i = 0; i < 22; i += 1)
        row[series.valueStart + i] =
          month === "2005年2月" && i === 0 ? "-" : String(i === 0 ? 0 : i + rowOffset);
    });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), series.sheet);
  for (const sheet of extraSheets)
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["ignored"]]), sheet);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function artifactFixture() {
  const root = mkdtempSync(path.join("/tmp", "cti-basic-2025-"));
  const files = SERIES.map((series) => {
    const kind = series.kind as CtiBasicSeriesKind;
    const raw = fixture(series);
    const parsed = parseOfficialFile(raw, series);
    const normalized = normalizedCsv(parsed.records);
    const id = CTI_BASIC_2025_SERIES[kind].statInfId;
    const metadata = {
      status: "ready",
      statisticName: "2025年基準 消費動向指数",
      governmentStatisticsCode: "00200567",
      baseYear: 2025,
      unit: "指数",
      statInfId: id,
      seriesKind: kind,
      seriesLabel: series.label,
      householdScope: "二人以上の世帯",
      valueType: series.label,
      sourceTitle: parsed.title,
      frequency: "monthly",
      sourceStart: "2002-01",
      requestedStart: "2005-01",
      availabilityStart: "2002-01",
      retrieval: { retrievedAt: "2025-01-01T00:00:00.000Z", updatedAt: null },
      officialUrl: `${endpoint}&statInfId=${id}`,
      encoding: "binary/official",
      rawFile: `${id}.raw`,
      normalizedFile: `${id}.normalized.csv`,
      metadataFile: `${id}.metadata.json`,
      rawBytes: raw.length,
      normalizedBytes: Buffer.byteLength(normalized),
      parserVersion: "xlsx-0.20.3",
      transformVersion: "cti-basic-2025-long-term-v2",
      sourceHeaders: {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentDisposition: null,
        lastModified: null,
      },
      rawSha256: sha256Hex(raw),
      normalizedSha256: sha256Hex(normalized),
      latestPublishedMonth: "2005-03",
      rowCount: 66,
      seriesCount: 22,
      series: parsed.series,
      validation: {
        ok: true,
        checks: ["identity", "format", "schema", "period", "continuity", "duplicates", "sha256"],
      },
      unavailable: { periods: [], reason: null },
    };
    const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
    writeFileSync(path.join(root, metadata.rawFile), raw);
    writeFileSync(path.join(root, metadata.normalizedFile), normalized);
    writeFileSync(path.join(root, metadata.metadataFile), metadataBytes);
    return {
      statInfId: id,
      seriesKind: kind,
      rawFile: metadata.rawFile,
      normalizedFile: metadata.normalizedFile,
      metadataFile: metadata.metadataFile,
      rawSha256: metadata.rawSha256,
      normalizedSha256: metadata.normalizedSha256,
      metadataSha256: sha256Hex(metadataBytes),
    };
  });
  return {
    root,
    manifest: { schemaVersion: 1 as const, generatedAt: "2025-01-01T00:00:00.000Z", files },
  };
}

describe("2025 CTI long-term artifact", () => {
  it("guards the Plan36 artifact directory as a test input even when it is untracked", () => {
    expect(existsSync(path.join(CTI_BASIC_2025_ROOT, "manifest.json"))).toBe(true);
    expect(existsSync(path.join(CTI_BASIC_2025_ROOT, "000040499070.normalized.csv"))).toBe(true);
    expect(loadCtiBasicConsumptionOutput().raw.size).toBeGreaterThan(0);
  });

  const outputRecords = (value: (month: number) => number | null): CtiBasicRecord[] => {
    const records: CtiBasicRecord[] = [];
    for (let year = 2005; year <= 2025; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const index = (year - 2005) * 12 + month;
        const rawValue = value(index);
        records.push({
          variant: "nominal",
          seriesIndex: 1,
          officialSeriesCode: "1",
          seriesName: "消費支出（名目）",
          month: `${year}-${String(month).padStart(2, "0")}` as `${number}-${number}`,
          rawValue,
          isMissing: rawValue === null,
        });
      }
    }
    return records;
  };

  it("does not use a partial 12MA window and fails closed for non-positive baseline", () => {
    const missing = buildCtiBasicConsumptionOutput(
      outputRecords((index) => (index === 14 ? null : 100)),
    );
    expect(missing.valid).toBe(true);
    expect(missing.movingAverage.has("2006-02")).toBe(false);
    expect(missing.comparison.has("2006-02")).toBe(false);
    const nonPositive = buildCtiBasicConsumptionOutput(outputRecords(() => 0));
    expect(nonPositive.valid).toBe(false);
    expect(nonPositive.reason).toContain("0以下");
    expect(nonPositive.comparison.size).toBe(0);
  });

  it("fails closed for a non-finite baseline component and never substitutes raw values", () => {
    const records = outputRecords((index) => (index === 241 ? Number.NaN : 100));
    const output = buildCtiBasicConsumptionOutput(records);
    expect(output.valid).toBe(false);
    expect(output.comparison.size).toBe(0);
    expect(output.raw.has("2025-01")).toBe(false);
    expect(output.reason).toContain("基準");
  });

  it("retains an individual zero when the 2025 baseline remains positive", () => {
    const output = buildCtiBasicConsumptionOutput(
      outputRecords((index) => (index === 1 ? 0 : 100)),
    );
    expect(output.valid).toBe(true);
    expect(output.raw.get("2005-01")).toBe(0);
    expect(output.comparison.get("2005-12")).toBeGreaterThan(0);
    expect(output.comparison.get("2025-12")).toBeCloseTo(100);
  });

  it("selects only nominal series 1 and computes the Plan37 12MA/index contract", () => {
    const output = loadCtiBasicConsumptionOutput();
    expect(output.valid).toBe(true);
    expect(output.raw.get("2005-01")).toBe(98.3);
    expect(output.movingAverage.has("2005-11")).toBe(false);
    expect(output.movingAverage.get("2005-12")).toBeCloseTo(
      Array.from({ length: 12 }, (_, index) =>
        output.raw.get(`2005-${String(index + 1).padStart(2, "0")}`)!,
      ).reduce((a, b) => a + b, 0) / 12,
    );
    expect(output.baseline).toBeGreaterThan(0);
    const raw2025Average =
      Array.from({ length: 12 }, (_, index) =>
        output.raw.get(`2025-${String(index + 1).padStart(2, "0")}`)!,
      ).reduce((sum, value) => sum + value, 0) / 12;
    expect(output.baseline).toBeCloseTo(raw2025Average);
    expect(output.comparison.get("2017-12")).toBeCloseTo(92.8589284226, 8);
    expect(output.comparison.get("2018-01")).toBeCloseTo(92.9755853679, 8);
    expect(output.comparison.get("2025-12")).toBeCloseTo(
      (100 * output.movingAverage.get("2025-12")!) / output.baseline!,
    );
    expect(output.comparison.get("2025-12")).toBeCloseTo(100, 8);
  });
  it("uses fileKind=0 and exact monthly sheets", () => {
    expect(endpoint).toBe("https://www.e-stat.go.jp/stat-search/file-download?fileKind=0");
    expect(CTI_BASIC_2025_SERIES).toMatchObject({
      nominal: { statInfId: "000040499070" },
      seasonallyAdjusted: { statInfId: "000040499082" },
    });
    expect(SERIES.map((series) => series.sheet)).toEqual(["二人以上・月(原)", "二人以上・月(季)"]);
  });
  it("accepts raw title whitespace and appended kana while rejecting another value type", () => {
    const nominalTitle = "10大費目別　世帯消費動向指数（原数値）カナふりがな";
    expect(isExpectedTitle(nominalTitle, SERIES[0])).toBe(true);
    expect(isExpectedTitle("10大費目別 世帯消費動向指数（季節調整値）", SERIES[0])).toBe(false);
    expect(
      parseOfficialFile(fixture(SERIES[0], undefined, [], nominalTitle), SERIES[0]).title,
    ).toBe(nominalTitle);
  });
  it("accepts the seasonal raw title with appended kana", () => {
    const title = "10大費目別 世帯消費動向指数（季節調整値）カナふりがな";
    expect(parseOfficialFile(fixture(SERIES[1], undefined, [], title), SERIES[1]).title).toBe(
      title,
    );
  });
  it("parses both layouts and preserves zero/missing after 2005-01 filtering", () => {
    for (const series of SERIES) {
      const parsed = parseOfficialFile(fixture(series), series);
      expect(parsed.records).toHaveLength(22 * 39);
      const records = normalizeCtiBasicSeriesCsv(normalizedCsv(parsed.records));
      expect(records).toHaveLength(66);
      expect(records[0]).toMatchObject({ month: "2005-01", rawValue: 0, isMissing: false });
      if (series.kind === "nominal")
        expect(
          records.find((record) => record.seriesIndex === 1 && record.month === "2005-02"),
        ).toMatchObject({ rawValue: null, isMissing: true });
    }
  });
  it("preserves all seasonal series month and value columns", () => {
    const parsed = parseOfficialFile(fixture(SERIES[1]), SERIES[1]);
    const january = parsed.records.filter((record) => record.month === "2005-01");
    expect(january).toHaveLength(22);
    expect(january.map((record) => record.seriesName)).toEqual(
      Array.from({ length: 22 }, (_, index) => `費目${index + 1}`),
    );
    expect(january.map((record) => record.rawValue)).toEqual([
      0,
      ...Array.from({ length: 21 }, (_, index) => index + 37),
    ]);
    expect(
      january.every((record) => record.month === "2005-01" && record.officialSeriesCode === null),
    ).toBe(true);
  });
  it("keeps seasonal official series codes null", () => {
    expect(
      parseOfficialFile(fixture(SERIES[1]), SERIES[1]).series.every(
        (series: ReturnType<typeof parseOfficialFile>["series"][number]) =>
          series.officialSeriesCode === null,
      ),
    ).toBe(true);
  });
  it("validates every manifest artifact directly from its root", () => {
    const { root, manifest } = artifactFixture();
    try {
      expect(() => validateCtiBasicManifest(manifest, root)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fails closed when a manifest artifact is missing", () => {
    const { root, manifest } = artifactFixture();
    try {
      rmSync(path.join(root, manifest.files[0].metadataFile));
      expect(() => validateCtiBasicManifest(manifest, root)).toThrow(/missing/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fails closed for an independent metadata SHA mismatch", () => {
    const { root, manifest } = artifactFixture();
    try {
      const tampered = {
        ...manifest,
        files: manifest.files.map((file, index) =>
          index === 0 ? { ...file, metadataSha256: "0".repeat(64) } : file,
        ),
      };
      expect(() => validateCtiBasicManifest(tampered, root)).toThrow(/hash/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("fails closed for metadata field tampering", () => {
    const { root, manifest } = artifactFixture();
    try {
      const file = manifest.files[0];
      const metadataPath = path.join(root, file.metadataFile);
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
      metadata.governmentStatisticsCode = "00200573";
      const bytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`);
      writeFileSync(metadataPath, bytes);
      const tampered = {
        ...manifest,
        files: manifest.files.map((entry, index) =>
          index === 0 ? { ...entry, metadataSha256: sha256Hex(bytes) } : entry,
        ),
      };
      expect(() => validateCtiBasicManifest(tampered, root)).toThrow(/metadata fields/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("parses the target sheet when the workbook contains other sheets", () => {
    expect(
      parseOfficialFile(
        fixture(SERIES[0], undefined, ["二人以上・四(原)", "二人以上・年(原)"]),
        SERIES[0],
      ).sheetName,
    ).toBe(SERIES[0].sheet);
  });
  it("fails closed for the wrong sheet", () => {
    expect(() =>
      parseOfficialFile(fixture(SERIES[0], undefined, ["二人以上・四(原)"]), SERIES[1]),
    ).toThrow(/sheet|title/);
  });
  it("fails closed for a 2002 gap", () => {
    expect(() => parseOfficialFile(fixture(SERIES[0], "2002年2月"), SERIES[0])).toThrow(
      /continuous/,
    );
  });
  it("fails closed for a 2005 gap", () => {
    expect(() => parseOfficialFile(fixture(SERIES[0], "2005年2月"), SERIES[0])).toThrow(
      /continuous/,
    );
  });
  it("fails closed for a normalized duplicate after changing 2005-02 to 2005-03", () => {
    const normalized = normalizedCsv(parseOfficialFile(fixture(SERIES[0]), SERIES[0]).records);
    const duplicateMonth = normalized
      .split("\n")
      .map((line) =>
        line.split(",")[4] === "2005-02" ? line.replace(",2005-02,", ",2005-03,") : line,
      )
      .join("\n");
    expect(() => normalizeCtiBasicSeriesCsv(duplicateMonth)).toThrow(/duplicate key|continuous/);
  });
  it("fails closed for a normalized gap after deleting 2005-02 from 2005-01,02,03", () => {
    const normalized = normalizedCsv(parseOfficialFile(fixture(SERIES[0]), SERIES[0]).records);
    const missingMonth = normalized
      .split("\n")
      .filter((line, index) => index === 0 || line.split(",")[4] !== "2005-02")
      .join("\n");
    expect(() => normalizeCtiBasicSeriesCsv(missingMonth)).toThrow(/continuous/);
  });
  it("emits explicit deterministic long-form columns", () => {
    const records = Array.from({ length: 22 }, (_, index) => ({
      variant: "seasonallyAdjusted" as const,
      seriesIndex: index + 1,
      officialSeriesCode: null,
      seriesName: `費目${index + 1}`,
      month: "2005-01" as const,
      rawValue: index === 0 ? 0 : null,
      isMissing: index !== 0,
    }));
    expect(recordsToNormalizedCsv(records).split("\n")[0]).toBe(
      "variant,series_index,official_series_code,series_name,month,raw_value,is_missing",
    );
  });
});
