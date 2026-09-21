import { describe, expect, it } from "vitest";
import { normalizePublicChartData } from "@/app/components/ChartDataContract";
import { buildCsv, escapeCsvCell, toFileName, withBom } from "@/lib/csvExport";

describe("escapeCsvCell", () => {
  it("特殊文字を含まない値はそのまま返す", () => {
    expect(escapeCsvCell("総合")).toBe("総合");
    expect(escapeCsvCell(12.5)).toBe("12.5");
  });

  it("null/undefined は空文字にする", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("カンマ・改行を含む値は引用符で囲む", () => {
    expect(escapeCsvCell("食料,住居")).toBe('"食料,住居"');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });

  it("引用符は二重化した上で囲む", () => {
    expect(escapeCsvCell('総合"参考"')).toBe('"総合""参考"""');
  });
});

describe("buildCsv", () => {
  const rows = [
    { 年月: "2020年1月", 総合: 100, 食料: 98.456 },
    { 年月: "2020年2月", 総合: 101.2, 食料: 99 },
  ];

  it("ヘッダ行と本体行を生成する", () => {
    const csv = buildCsv(rows, ["総合", "食料"]);
    expect(csv).toBe(
      ["年月,総合,食料", "2020年1月,100.00,98.46", "2020年2月,101.20,99.00", ""].join("\r\n"),
    );
  });

  it("常にCRLF終端で裸LFを含まない", () => {
    const csv = buildCsv([{ 年月: "2020年1月", 総合: 100 }], ["総合"]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "")).not.toContain("\n");
    expect(csv).not.toContain("\r\r");
  });

  it("引用符と特殊文字をround-tripできる", () => {
    const csv = buildCsv([{ 年月: 'a,"b\r\nc', 総合: 100 }], ["総合"]);
    expect(csv).toContain('"a,""b\r\nc"');
  });

  it("headers を渡すと表示名をヘッダに使う", () => {
    const csv = buildCsv(rows, ["総合"], ["CPI総合"]);
    expect(csv.split("\r\n")[0]).toBe("年月,CPI総合");
  });

  it("年月がない行は label をラベル列に使う", () => {
    const csv = buildCsv([{ label: "2020Q1", 総合: 100 }], ["総合"]);
    expect(csv.split("\r\n")[1]).toBe("2020Q1,100.00");
  });

  it("数値でない値・欠損は空セルにする", () => {
    const csv = buildCsv([{ 年月: "2020年1月", 総合: null, 食料: NaN }], ["総合", "食料"]);
    expect(csv.split("\r\n")[1]).toBe("2020年1月,,");
  });

  it("行が空でもヘッダ行は出力する", () => {
    expect(buildCsv([], ["総合"])).toBe("年月,総合\r\n");
  });

  it("各行のmeasurement metadataを使い、invalid月も保持する", () => {
    const metadata = [
      {
        key: "CTI",
        label: "CTIミクロ（名目・四半期平均）",
        valueType: "raw" as const,
        value: null,
        unit: "指数",
        source: "CTI",
        frequency: "quarterly" as const,
        aggregation: "simple_mean_of_three_calendar_months",
        status: "valid" as const,
        reason: null,
      },
    ];
    const csv = buildCsv(
      [
        { 年月: "2025年1月", CTI: 101, measurements: { CTI: { ...metadata[0], value: 101 } } },
        {
          年月: "2025年2月",
          CTI: null,
          measurements: {
            CTI: { ...metadata[0], value: null, status: "invalid", reason: "欠測月" },
          },
        },
      ],
      ["CTI"],
      undefined,
      { metadata },
    );
    expect(csv.split("\r\n")[0]).toContain(
      "CTI__label,CTI__valueType,CTI__seriesType,CTI__official,CTI__value,CTI__unit,CTI__source,CTI__frequency,CTI__aggregation,CTI__status,CTI__reason",
    );
    expect(csv.split("\r\n")[1]).toContain(
      "CTIミクロ（名目・四半期平均）,raw,,,101,指数,CTI,quarterly,simple_mean_of_three_calendar_months,valid,",
    );
    expect(csv.split("\r\n")[2]).toContain(
      "CTIミクロ（名目・四半期平均）,raw,,,,指数,CTI,quarterly,simple_mean_of_three_calendar_months,invalid,欠測月",
    );
  });

  it("2017年12月/2018年1月境界でmeasurementなしのlegacy数値を保持する", () => {
    const metadata = [
      {
        key: "CTI",
        label: "CTIミクロ（名目・四半期平均）",
        valueType: "raw" as const,
        value: null,
        unit: "指数",
        source: "2005 source",
        frequency: "quarterly" as const,
        aggregation: "simple_mean_of_three_calendar_months",
        status: "valid" as const,
        reason: null,
      },
    ];
    const csv = buildCsv(
      [
        { label: "2017年12月", CTI: 100, measurements: { CTI: { ...metadata[0], value: 100 } } },
        { label: "2018年1月", CTI: 42 },
        {
          label: "invalidQ",
          CTI: null,
          measurements: {
            CTI: {
              ...metadata[0],
              value: null,
              source: "2018 source",
              status: "invalid",
              reason: "missing",
            },
          },
        },
      ],
      ["CTI"],
      undefined,
      { metadata },
    );
    const lines = csv.split("\r\n");
    expect(lines[1]).toContain(
      "CTIミクロ（名目・四半期平均）,raw,,,100,指数,2005 source,quarterly,simple_mean_of_three_calendar_months,valid,",
    );
    expect(lines[2]).toContain(
      "CTIミクロ（名目・四半期平均）,raw,unavailable,false,,,,quarterly,,invalid,unavailable",
    );
    expect(lines[2]).toMatch(/^2018年1月,42\.00,/);
    expect(lines[2]).not.toContain("2005 source");
    expect(lines[3]).toContain(
      "CTIミクロ（名目・四半期平均）,raw,,,,指数,2018 source,quarterly,simple_mean_of_three_calendar_months,invalid,missing",
    );
  });

  it("invalidのlegacy数値を保持し、明示的unavailableだけを空欄にする", () => {
    const metadata = [
      {
        key: "CTI",
        label: "CTI",
        valueType: "raw" as const,
        value: null,
        unit: "指数",
        source: "Plan39",
        frequency: "annual" as const,
        aggregation: "annual_adjusted",
        status: "available" as const,
        reason: null,
      },
    ];
    const rows = [
      {
        年月: "2017年12月",
        CTI: 31,
        measurements: {
          CTI: { ...metadata[0], value: 31, status: "invalid" as const, reason: "unavailable" },
        },
      },
      {
        年月: "2018年1月",
        CTI: 42,
        measurements: {
          CTI: {
            ...metadata[0],
            value: 42,
            status: "available" as const,
            reason: null,
            seriesType: "estimated_adjusted" as const,
            official: false,
          },
        },
      },
      {
        年月: "2018年2月",
        CTI: 99,
        measurements: {
          CTI: {
            ...metadata[0],
            value: 99,
            status: "available" as const,
            seriesType: "unavailable" as const,
            official: false,
          },
        },
      },
      {
        年月: "2018年3月",
        CTI: 44,
        measurements: {
          CTI: {
            ...metadata[0],
            value: 44,
            status: "available" as const,
            seriesType: "official_adjusted" as const,
            official: true,
          },
        },
      },
      {
        年月: "2018年4月",
        CTI: null,
        measurements: {
          CTI: {
            ...metadata[0],
            value: null,
            status: "invalid" as const,
            reason: "missing_input",
            seriesType: "estimated_adjusted" as const,
            official: false,
          },
        },
      },
    ];
    const csvRows = buildCsv(rows, ["CTI"], undefined, { metadata }).split("\r\n");
    expect(csvRows.slice(1, 6).map((row) => row.split(",")[1])).toEqual([
      "31.00",
      "42.00",
      "",
      "44.00",
      "",
    ]);
    expect(normalizePublicChartData(rows, ["CTI"]).map((row) => row.CTI)).toEqual([
      31,
      42,
      null,
      44,
      null,
    ]);
    expect(csvRows[1]).toContain(",invalid,unavailable");
    expect(csvRows[5]).toContain(",invalid,missing_input");
    expect(csvRows[3]).not.toContain(",99,");
    expect(csvRows[4]).toContain("official_adjusted,true,44");
  });
});

describe("withBom / toFileName", () => {
  it("BOM を先頭に付ける", () => {
    expect(withBom("a,b")).toBe("﻿a,b");
  });

  it("ファイル名に使えない文字を _ に置換する", () => {
    expect(toFileName("消費支出（名目）")).toBe("消費支出（名目）.csv");
    expect(toFileName("物価指数 費目別/寄与度")).toBe("物価指数_費目別_寄与度.csv");
  });
});
