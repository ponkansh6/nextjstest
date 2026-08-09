import { describe, expect, it } from "vitest";
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
    expect(csv.split("\n")).toEqual([
      "年月,総合,食料",
      "2020年1月,100.00,98.46",
      "2020年2月,101.20,99.00",
    ]);
  });

  it("headers を渡すと表示名をヘッダに使う", () => {
    const csv = buildCsv(rows, ["総合"], ["CPI総合"]);
    expect(csv.split("\n")[0]).toBe("年月,CPI総合");
  });

  it("年月がない行は label をラベル列に使う", () => {
    const csv = buildCsv([{ label: "2020Q1", 総合: 100 }], ["総合"]);
    expect(csv.split("\n")[1]).toBe("2020Q1,100.00");
  });

  it("数値でない値・欠損は空セルにする", () => {
    const csv = buildCsv([{ 年月: "2020年1月", 総合: null, 食料: NaN }], ["総合", "食料"]);
    expect(csv.split("\n")[1]).toBe("2020年1月,,");
  });

  it("行が空でもヘッダ行は出力する", () => {
    expect(buildCsv([], ["総合"])).toBe("年月,総合");
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
