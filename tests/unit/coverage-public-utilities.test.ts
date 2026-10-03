import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CTI_ADJUSTED_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
  CPI_CATEGORIES,
  buildCpiTooltipMetadata,
  getColorForNominalKey,
  getSpendingSeriesColor,
  projectTooltipMetadata,
} from "@/lib/chartConstants";
import { getChartInfoContent } from "@/lib/chartInfoContent";
import { buildCsv } from "@/lib/csvExport";
import {
  adaptCtiAdjustedV2PublicView,
  type CtiAdjustedV2PublicMeasurement,
  type CtiAdjustedV2PublicRow,
} from "@/lib/ctiAdjustedV2PublicProjection";
import {
  projectCtiAdjustedPublicView,
  type CtiAdjustedPublicInputRow,
} from "@/lib/ctiAdjustedPublicProjection";
import {
  assertQuarterlyPublicRegistryOrder,
  projectQuarterlyPublicView,
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
} from "@/lib/quarterlyPublicProjection";
import { computePeriodXAxisTicks } from "@/app/components/charts/xAxisTicks";
import {
  buildCpiFilePath,
  findHeaderRow,
  parseContributionWeights,
  parseCsvFile,
  parseCsvWithHeader,
  parseIndexSection,
} from "../../server/lib/dataIo";

describe("public chart utility contracts", () => {
  it("maps known and unknown nominal and Plan40 series to their public palette colors", () => {
    expect(getColorForNominalKey("CTIミクロ調整系列（食料）")).toBe("var(--nominal-food)");
    expect(getColorForNominalKey("CTIミクロ調整系列（住居）")).toBe("var(--series-1)");
    expect(getColorForNominalKey("CTIミクロ調整系列（未定義）")).toBe("var(--series-1)");
    expect(getColorForNominalKey("食料（実質）")).toBe("var(--nominal-food)");
    expect(getColorForNominalKey("交通・通信（名目）")).toBe("var(--series-4)");
    expect(getColorForNominalKey("unknown")).toBe("var(--series-1)");
    expect(getSpendingSeriesColor("住居", ["住居"], ["red"])).toBe("red");
    expect(getSpendingSeriesColor("missing", ["住居"], [])).toBe("var(--series-1)");
  });

  it("projects CPI and tooltip metadata with array and Set visibility filters", () => {
    expect(buildCpiTooltipMetadata()).toHaveLength(CPI_CATEGORIES.length);
    expect(buildCpiTooltipMetadata([CPI_CATEGORIES[0]!, "unknown"]).map(({ key }) => key)).toEqual([
      CPI_CATEGORIES[0],
    ]);
    expect(buildCpiTooltipMetadata(new Set([CPI_CATEGORIES[1]!])).map(({ key }) => key)).toEqual([
      CPI_CATEGORIES[1],
    ]);

    const projected = projectTooltipMetadata(
      [
        {
          key: "first",
          color: "blue",
          label: "base",
          displayName: "display",
          legendLabel: "legend",
          tooltipLabel: "tip",
          order: 6,
          advanced: true,
          unit: "指数",
          source: "registry",
          valueType: "raw",
          status: "valid",
          reason: null,
          value: 1,
          frequency: "monthly",
          aggregation: "observed",
          seriesType: "derived_adjusted",
          official: false,
          annualAnchorType: "estimated",
          quarterlyDerived: false,
          model: "v2-bottom-up",
          estimateVersion: "plan39-v2",
          inputFingerprint: "sha256:sample",
          baseYear: 2020,
        },
        {
          key: "legend",
          color: "blue",
          label: "base",
          displayName: "display",
          legendLabel: "legend",
        },
        { key: "display", color: "blue", label: "base", displayName: "display" },
        { key: "label", color: "blue", label: "label" },
        {
          key: "second",
          color: "red",
          label: "fallback",
          order: 8,
          descriptor: {
            key: "second",
            label: "fallback",
            unit: "指数",
            source: "public",
            valueType: "comparison",
            status: "valid",
            reason: null,
            value: 100,
            frequency: "quarterly",
            aggregation: "mean",
            seriesType: "official_adjusted",
            official: true,
            annualAnchorType: "official",
            quarterlyDerived: true,
            baseYear: 2025,
          },
        },
      ],
      new Set(["first", "legend", "display", "label", "second"]),
    );
    expect(projected[0]).toMatchObject({
      key: "first",
      label: "tip",
      order: 6,
      advanced: true,
      unit: "指数",
      source: "registry",
      valueType: "raw",
      status: "valid",
      reason: null,
      value: 1,
      frequency: "monthly",
      aggregation: "observed",
      seriesType: "derived_adjusted",
      official: false,
      annualAnchorType: "estimated",
      quarterlyDerived: false,
      model: "v2-bottom-up",
      estimateVersion: "plan39-v2",
      inputFingerprint: "sha256:sample",
      baseYear: 2020,
    });
    expect(projected.slice(1, 4).map(({ label }) => label)).toEqual(["legend", "display", "label"]);
    expect(projected[4]).toMatchObject({
      key: "second",
      label: "fallback",
      order: 8,
      seriesType: "official_adjusted",
      official: true,
      annualAnchorType: "official",
      quarterlyDerived: true,
      baseYear: 2025,
    });
    expect(projectTooltipMetadata([{ key: "one", color: "blue", label: "one" }], [])).toEqual([]);
  });

  it("uses the selected CPI source state and includes nested fallback item descriptions", () => {
    const fallback = getChartInfoContent("stacked-area", {
      baseYear: 2020,
      sourceMode: "fallback",
    });
    const itemText = fallback.sections.flatMap((section) =>
      section.items.flatMap((item) => [item.text, ...(item.subItems ?? [])]),
    );
    expect(fallback.source).toContain("2020年基準");
    expect(itemText.some((text) => text.includes("2020年基準ウェイト"))).toBe(true);
    const majorFallback = getChartInfoContent("cpi-major", {
      baseYear: 2020,
      dataState: "2020-fallback",
    });
    expect(
      majorFallback.sections.flatMap(({ items }) => items.map(({ text }) => text)),
    ).not.toContain("2024年以前は旧基準の公表指数を2025年基準へ換算して接続した系列を使用");
    expect(getChartInfoContent("cpi-major").sections).toBe(CHART_INFO_CPI_SECTIONS);
  });

  it("resolves CTI invalid, unavailable, and GDP states with absent optional details", () => {
    const unavailable = getChartInfoContent("new-graph", undefined, {
      baseYear: null,
      sourceMode: "unavailable",
      series: {
        raw: {
          key: "raw",
          valueType: "raw",
          unit: "指数",
          source: "e-Stat",
          status: "valid",
          reason: null,
        },
        comparison: {
          key: "comparison",
          valueType: "comparison",
          unit: "指数",
          source: "e-Stat",
          status: "invalid",
          reason: "欠測",
        },
      },
      gdp: { availability: "unavailable" },
    });
    expect(unavailable.sections[0]?.items.map(({ text }) => text)).toContain(
      "CTI基本系列の状態：valid、理由：、単位：指数、出典：e-Stat",
    );
    expect(unavailable.sections.flatMap(({ items }) => items.map(({ text }) => text))).toContain(
      "GDP比較線は利用できません。GDP比較に必要なデータを確認中です。",
    );

    const validWithReason = getChartInfoContent("consumption-expenditure", undefined, {
      baseYear: 2025,
      sourceMode: "official-connected",
      status: "valid",
      reason: "確認済み",
    });
    expect(validWithReason.sections[0]?.items[1]?.text).toContain("状態：valid、理由：確認済み");

    const invalid = getChartInfoContent("consumption-expenditure", undefined, {
      baseYear: 2025,
      sourceMode: "official-connected",
      status: "invalid",
      unit: "万円",
      supportLabel: "補助系列",
      gdp: {
        availability: "available",
        quarterlyStatus: {
          availability: "unavailable",
          comparisonReady: false,
          granularity: "quarterly",
        },
      },
    });
    const text = invalid.sections.flatMap(({ items }) => items.map(({ text }) => text));
    expect(text).toContain(
      "CTI名目四半期系列の状態：invalid、理由：、単位：万円、出典：e-Stat 公式CTI長期artifact 000040499070",
    );
    expect(text).toContain("補助系列");
    expect(text).toContain("四半期GDP比較線は利用できません。");

    const quarterlyUnavailableWithReason = getChartInfoContent("new-graph", undefined, {
      baseYear: 2025,
      sourceMode: "official-connected",
      gdp: {
        availability: "available",
        quarterlyStatus: {
          availability: "unavailable",
          comparisonReady: false,
          granularity: "quarterly",
          reason: "独立照合データなし",
        },
      },
    });
    expect(
      quarterlyUnavailableWithReason.sections[0]?.items.map(({ text: itemText }) => itemText),
    ).toContain("四半期GDP比較線は利用できません。独立照合データなし");
  });

  it("exports CPI metadata columns and escapes their values as CSV cells", () => {
    const csv = buildCsv(
      [
        {
          label: "2025Q1",
          CTI: 100,
          measurements: {
            CTI: {
              key: "CTI",
              cpiSeries: "総合",
              cpiPeriod: "2025Q1",
              cpiAggregation: "simple_mean",
              nominalSource: "CTI, 公式",
              measurementNote: "3か月平均\n基準",
            },
          },
        },
      ],
      ["CTI"],
      undefined,
      { metadata: [{ key: "CTI", unit: "指数", source: "公開", status: "valid", reason: null }] },
    );
    expect(csv).toContain(
      "CTI__cpiSeries,CTI__cpiPeriod,CTI__cpiAggregation,CTI__nominalSource,CTI__measurementNote",
    );
    expect(csv).toContain('総合,2025Q1,simple_mean,"CTI, 公式","3か月平均\n基準"');

    const missingMetadata = buildCsv(
      [{ label: "2025Q2", CTI: 99, measurements: { CTI: { key: "CTI" } } }],
      ["CTI"],
      undefined,
      {
        metadata: [
          {
            key: "CTI",
            unit: "指数",
            source: "公開",
            status: "valid",
            reason: null,
            cpiSeries: "総合",
          },
        ],
      },
    );
    const [headerRow, dataRow] = missingMetadata.trimEnd().split("\r\n");
    expect(headerRow?.split(",")).toEqual([
      "年月",
      "CTI",
      "CTI__label",
      "CTI__valueType",
      "CTI__seriesType",
      "CTI__official",
      "CTI__value",
      "CTI__unit",
      "CTI__source",
      "CTI__frequency",
      "CTI__aggregation",
      "CTI__status",
      "CTI__reason",
      "CTI__cpiSeries",
      "CTI__cpiPeriod",
      "CTI__cpiAggregation",
      "CTI__nominalSource",
      "CTI__measurementNote",
    ]);
    expect(dataRow?.split(",")).toEqual([
      "2025Q2",
      "99.00",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  });

  it("projects valid public quarter rows, rounds bare values, and omits invalid periods", () => {
    const food = QUARTERLY_PUBLIC_NOMINAL_KEYS[0]!;
    const output = projectQuarterlyPublicView([
      { 年: 2025, quarter: 1, label: "2025Q1", 年月: "ignored", [food]: 10.126 },
      { 年: 2025, quarter: 2, label: "2025Q3", 年月: "2025年4月", [food]: 20 },
    ]);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({ label: "2025Q1", 年月: "2025Q1", [food]: 10.13 });
    expect(Object.keys(output[0] ?? {})).toContain(QUARTERLY_PUBLIC_NOMINAL_KEYS.at(-1)!);
  });

  it("retains the quarterly registry drift tripwire on either side of the contract", () => {
    expect(() => assertQuarterlyPublicRegistryOrder(["a", "b"], ["a", "b"])).not.toThrow();
    expect(() => assertQuarterlyPublicRegistryOrder(["a", "b"], ["b", "a"])).toThrow(
      "Plan40 quarterly public registry/key order mismatch",
    );
  });

  it("keeps valid endpoints, handles malformed periods, and caps interior ticks", () => {
    expect(computePeriodXAxisTicks([])).toEqual([]);
    expect(computePeriodXAxisTicks([{ 年月: "bad", label: "only" }], "label")).toEqual(["only"]);
    const malformed = [
      { 年月: "bad-start", label: "start" },
      { 年月: "2010年1月", label: "milestone" },
      { 年月: "bad-end", label: "end" },
    ];
    expect(computePeriodXAxisTicks(malformed, "label")).toEqual(["start", "milestone", "end"]);
    expect(computePeriodXAxisTicks(dataTicks(2005, 2026), "年月", { maxTicks: 2 })).toEqual([
      "2005年1月",
      "2026年1月",
    ]);
    expect(computePeriodXAxisTicks(dataTicks(2005, 2026), "年月", { maxTicks: 3 })).toEqual([
      "2005年1月",
      "2015年1月",
      "2026年1月",
    ]);
  });
});

const CHART_INFO_CPI_SECTIONS = getChartInfoContent("cpi-major").sections;

function dataTicks(startYear: number, endYear: number) {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => ({
    年月: `${startYear + index}年1月`,
  }));
}

describe("server data IO utilities", () => {
  let tempDir = "";
  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("parses present and missing CSV files with both row and header modes", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "nextjstest-data-io-"));
    const file = path.join(tempDir, "sample.csv");
    expect(await parseCsvFile(file)).toEqual([]);
    expect(await parseCsvWithHeader(file)).toEqual([]);
    writeFileSync(file, "name,value\nalpha,12\n\nbeta,3.5\n", "utf8");
    expect(await parseCsvFile<string[][]>(file)).toEqual([
      ["name", "value"],
      ["alpha", "12"],
      [""],
      ["beta", "3.5"],
      [""],
    ]);
    expect(await parseCsvFile<Record<string, string>[]>(file, { header: true })).toEqual([
      { name: "alpha", value: "12" },
      { name: "" },
      { name: "beta", value: "3.5" },
      { name: "" },
    ]);
    expect(await parseCsvWithHeader(file)).toEqual([
      { name: "alpha", value: 12 },
      { name: "beta", value: 3.5 },
    ]);
  });

  it("searches string cells and safely returns no match for nonstring or empty rows", () => {
    expect(
      findHeaderRow(
        [
          ["value", "other"],
          ["年", "data"],
        ],
        [/^年$/],
      ),
    ).toBe(1);
    expect(findHeaderRow([["value"], ["年"]], [/^month$/])).toBe(-1);
    expect(findHeaderRow([["value"], []], [])).toBe(-1);
  });

  it("builds the CPI source path and skips non-numeric index cells", () => {
    expect(buildCpiFilePath("cpi.csv")).toBe(path.join(process.cwd(), "data/source", "cpi.csv"));
    const row = (year: string, months: string[]) => {
      const cells = Array<string>(20).fill("");
      cells[0] = year;
      months.forEach((month, index) => {
        cells[index + 8] = month;
      });
      return cells.join(",");
    };
    const csv = [
      row("year", ["１月"]),
      row("units", []),
      row("2003", ["900"]),
      row("2004", ['"1,234"', "not-a-number", "-"]),
      row("毎月勤労統計調査", []),
      row("2005", ["500"]),
    ].join("\n");
    expect([...parseIndexSection(csv)]).toEqual([["2004年1月", 1234]]);
  });

  it("parses contribution headers only when both category and weight rows exist", () => {
    expect(
      parseContributionWeights("title\n類・品目,, 食料 ,住居 \nウエイト,0,100,nope\n"),
    ).toEqual({ 食料: 100 });
    expect(parseContributionWeights("類・品目,食料\n")).toEqual({});
    expect(parseContributionWeights("ウエイト,100\n")).toEqual({});
  });
});

describe("public CTI adjusted view adapters", () => {
  it("accepts the object-shaped v1 public input and preserves accepted estimates", () => {
    const input: CtiAdjustedPublicInputRow = {
      year: 2025,
      seriesType: "estimated_adjusted",
      official: false,
      status: "available",
      reason: null,
      values: Object.fromEntries(CTI_ADJUSTED_PUBLIC_CATEGORIES.map((category) => [category, 101])),
    };
    const [row] = projectCtiAdjustedPublicView(
      { rows: [input] },
      { status: "pass", accepted: true },
    );
    expect(row).toMatchObject({
      year: 2025,
      seriesType: "estimated_adjusted",
      status: "available",
    });
    expect(row?.values["食料"]).toBe(101);
    expect(row?.measurements["食料"]).toMatchObject({
      value: 101,
      official: false,
      seriesType: "estimated_adjusted",
      aggregation: "cti_adjusted_connection_estimate",
    });
  });

  it("adapts valid V2 rows and defaults omitted optional official metadata", () => {
    const measurements = Object.fromEntries(
      CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => {
        const key = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category];
        const measurement = {
          key,
          label: key,
          unit: "指数",
          source: "test source",
          valueType: "comparison" as const,
          value: 100,
          status: "available" as const,
          reason: null,
          frequency: "annual" as const,
          aggregation: "official_annual_artifact",
          seriesType: "official_adjusted" as const,
          model: "v2-bottom-up" as const,
          estimateVersion: "plan39-v2" as const,
          year: 2025,
          category,
        } satisfies CtiAdjustedV2PublicMeasurement;
        return [category, measurement];
      }),
    ) as CtiAdjustedV2PublicRow["measurements"];
    const values = Object.fromEntries(
      CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.map((category) => [category, 100]),
    ) as CtiAdjustedV2PublicRow["values"];
    const input = {
      year: 2025,
      model: "v2-bottom-up",
      estimateVersion: "plan39-v2",
      status: "valid",
      reason: null,
      values,
      measurements,
    } satisfies CtiAdjustedV2PublicRow;

    const [row] = adaptCtiAdjustedV2PublicView([input]);
    expect(row).toMatchObject({
      year: 2025,
      seriesType: "official_adjusted",
      official: false,
      status: "available",
    });
    expect(row?.values["残差"]).toBe(100);
    expect(row?.measurements["CTIミクロ調整系列（残差）"]).toMatchObject({
      seriesType: "official_adjusted",
      label: "CTIミクロ調整系列（残差）",
      category: "その他の消費支出",
    });
    expect(row?.measurements["CTIミクロ調整系列（残差）"]).not.toHaveProperty("official");
  });
});
