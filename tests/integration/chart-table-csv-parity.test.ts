// @bun-environment happy-dom
import { createElement } from "react";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import independentFixture from "../fixtures/chart-parity-independent.json";
import CpiChart from "@/app/components/CpiChart";
import { CustomTooltip } from "@/app/components/CustomTooltip";
import { ChartExportButton } from "@/app/components/ChartExportButton";
import {
  createComparisonSeriesRegistry,
  projectTooltipMetadata,
  EARNINGS_SERIES_REGISTRY,
  getLegendLabel,
  CTI_ADJUSTED_V2_PUBLIC_CATEGORIES,
  CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY,
} from "@/lib/chartConstants";
import {
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "@/lib/quarterlyPublicProjection";
import { deriveQuarterlyRealRows } from "@server/lib/view-models/quarterlyProjection";
import type { CpiData } from "@/types";
import type { QuarterlyRow } from "@server/lib/view-models/quarterlyAggregation";
import { setupUiMocks } from "../utils/ui-mocks";
import "../utils/recharts-mock";

vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    const params = new URLSearchParams(window.location.search);
    return {
      get: (key: string) => params.get(key),
    };
  },
}));

setupUiMocks();

type FixtureSection = {
  keys: string[];
  headers: string[];
  rows: Record<string, unknown>[];
  expected: string[][];
};
const matrix = independentFixture.matrix as Record<string, FixtureSection>;
const nominalCategories = CTI_ADJUSTED_V2_PUBLIC_CATEGORIES.filter(
  (category) => category !== "総合",
);
const canonicalNominalKeys = [...QUARTERLY_PUBLIC_NOMINAL_KEYS];
const otherNominalKey = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY["その他の消費支出"];
const parityCpiRows: CpiData[] = [
  [2017, 10],
  [2017, 11],
  [2017, 12],
  [2018, 1],
  [2018, 2],
  [2018, 3],
].map(([year, month]) => {
  const n = Number(month);
  return {
    年月: `${year}年${n}月`,
    総合: 106 + n / 10,
    生鮮食品を除く総合: 105 + n / 10,
    持家の帰属家賃を除く総合: 107 + n / 10,
    食料: 112 + n / 10,
    持家の帰属家賃を除く住居: 101 + n / 10,
    "光熱・水道": 108 + n / 10,
    "家具・家事用品": 103 + n / 10,
    被服及び履物: 99 + n / 10,
    保健医療: 102 + n / 10,
    "交通・通信": 104 + n / 10,
    教育: 100 + n / 10,
    教養娯楽: 105 + n / 10,
    "消費支出（参考）": null,
    "CPI総合(参考)": 106 + n / 10,
  };
});
const plan47Nominal = (section: FixtureSection): FixtureSection => {
  const legacyKeyByCategory: Record<string, string> = {
    食料: "食料（名目）",
    住居: "住居（名目）",
    "光熱・水道": "光熱・水道（名目）",
    "家具・家事用品": "家具・家事用品（名目）",
    被服及び履物: "被服及び履物（名目）",
    保健医療: "保健医療（名目）",
    "交通・通信": "交通・通信（名目）",
    教育: "教育（名目）",
    教養娯楽: "教養娯楽（名目）",
    その他の消費支出: "その他の消費支出（名目）",
  };
  return {
    ...section,
    keys: canonicalNominalKeys,
    headers: canonicalNominalKeys.map(getLegendLabel),
    rows: section.rows.map((row) => {
      const values = Object.fromEntries(
        nominalCategories.map((category) => [
          CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category],
          row[legacyKeyByCategory[category]!],
        ]),
      );
      const measurements = Object.fromEntries(
        nominalCategories.map((category) => {
          const key = CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category];
          const value = values[key];
          const isOther = category === "その他の消費支出";
          return [
            key,
            {
              key,
              label: getLegendLabel(key),
              unit: typeof value === "number" ? "指数" : "",
              source: isOther
                ? "Plan39 quarterly fixture: official total minus nine categories"
                : "Plan39 quarterly fixture: canonical nominal category",
              valueType: "comparison" as const,
              value: typeof value === "number" ? value : null,
              status: typeof value === "number" ? ("available" as const) : ("unavailable" as const),
              reason: typeof value === "number" ? null : "missing_official_quarter",
              frequency: "quarterly" as const,
              aggregation: isOther
                ? "derived_quarterly_residual_from_official_nominal_total_minus_nine_categories"
                : "official_quarterly_adjusted_nominal_observation",
              seriesType: isOther
                ? ("estimated_adjusted" as const)
                : ("official_adjusted" as const),
              official: !isOther,
              annualAnchorType: "official" as const,
              quarterlyDerived: isOther,
              model: "v2-bottom-up" as const,
              estimateVersion: "plan39-v2" as const,
              inputFingerprint: "sha256:chart-parity-plan39-fixture",
              ...(isOther ? { sourceRole: "derived_residual", canonicalSeries: category } : {}),
            },
          ];
        }),
      );
      return {
        年: row.年,
        quarter: row.quarter,
        label: row.label,
        年月: row.年月,
        ...values,
        // Keep old expense/support aliases poisoned in the input; only the
        // canonical expense keys above belong to the public stack.
        "食料（名目）": 777_777,
        "民間最終消費支出（名目）": 999_999,
        "民間最終消費支出（名目）（延長）": 888_888,
        measurements,
      };
    }),
    expected: section.rows.map((row) => [
      String(row.label),
      ...nominalCategories.map((category) => {
        const value = row[legacyKeyByCategory[category]!];
        return typeof value === "number" ? value.toFixed(2) : "";
      }),
    ]),
  };
};
const publicQuarterly = (section: FixtureSection): FixtureSection => ({
  ...section,
  expected: section.expected.map((row) =>
    row[0] === "2017年10-12月"
      ? ["2017Q4", ...row.slice(1)]
      : row[0] === "2018年1-3月"
        ? ["2018Q1", ...row.slice(1)]
        : row,
  ),
});
const parityNominalRows = plan47Nominal(matrix.nominal).rows;
const parityRealRows = deriveQuarterlyRealRows(
  parityNominalRows as unknown as QuarterlyRow[],
  parityCpiRows,
);
const realFixture: FixtureSection = {
  keys: [...QUARTERLY_PUBLIC_REAL_KEYS],
  headers: QUARTERLY_PUBLIC_REAL_KEYS.map(getLegendLabel),
  rows: parityRealRows,
  expected: parityRealRows.map((row) => [
    `${row.年}Q${row.quarter}`,
    ...QUARTERLY_PUBLIC_REAL_KEYS.map((key) =>
      typeof row[key] === "number" ? Number(row[key]).toFixed(2) : "",
    ),
  ]),
};
const CONTRACT = {
  ids: [
    "section-cpi-major",
    "section-stacked",
    "section-consumption-nominal",
    "section-consumption-real",
    "section-earnings",
    "section-residual",
    "section-new-graph",
  ],
  sections: [
    matrix.cpi,
    matrix.stacked,
    publicQuarterly(plan47Nominal(matrix.nominal)),
    realFixture,
    matrix.earnings,
    matrix.residual,
    {
      ...matrix.comparison,
      keys: [...matrix.comparison.keys, "消費(総合)"],
      headers: [...matrix.comparison.headers, "消費(総合)"],
      expected: matrix.comparison.expected.map((row) => {
        const consumption = matrix.earnings.rows.find((entry) => entry.年月 === row[0])?.[
          "消費(総合)"
        ];
        return [...row, typeof consumption === "number" ? consumption.toFixed(2) : ""];
      }),
    },
  ],
} as const;
const input = () => {
  const quarterly = (rows: Record<string, unknown>[]) =>
    rows.map((row) => {
      const label = row.label;
      const publicLabel =
        typeof label === "string" && label.includes("年")
          ? label.replace(
              /^([0-9]{4})年(1-3|4-6|7-9|10-12)月$/,
              (_, year, months) =>
                `${year}Q${({ "1-3": 1, "4-6": 2, "7-9": 3, "10-12": 4 } as Record<string, number>)[months]}`,
            )
          : label;
      return { ...row, label: publicLabel, 年月: publicLabel };
    });
  return {
    data: matrix.cpi.rows,
    // Spending quarterly props expose only the regular public keys.
    quarterlyNominalData: quarterly(plan47Nominal(matrix.nominal).rows),
    quarterlyRealData: quarterly(parityRealRows),
    totalEarningData: matrix.earnings.rows,
  };
};

function normalizeMissingCell(value: string): string {
  return value === "-" ? "" : value;
}

function tableValueText(cell: Element): string {
  return normalizeMissingCell(cell.firstChild?.textContent?.trim() ?? "");
}

async function renderChart(chartInput = input()) {
  window.__MOUNT_ALL__ = true;
  const rendered = render(
    createElement(CpiChart, { ...chartInput, maxCpiDate: { year: 2018, month: 1 } } as never),
  );
  await waitFor(() =>
    expect(rendered.container.querySelectorAll('[data-testid="chart-data-contract"]')).toHaveLength(
      7,
    ),
  );
  return rendered;
}

function contractFor(container: HTMLElement, id: string): HTMLElement {
  const section = container.querySelector(`#${id}`);
  const contract = section?.querySelector('[data-testid="chart-data-contract"]');
  if (!contract) throw new Error(`Missing chart contract for ${id}`);
  return contract as HTMLElement;
}

function parseCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  if (!text.endsWith("\r\n")) throw new Error("CSV must end with CRLF");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  const push = () => {
    if (row.length === 0 && cell === "") throw new Error("CSV contains an empty row");
    row.push(cell);
    rows.push(row);
    row = [];
    cell = "";
    afterQuote = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        afterQuote = true;
      } else if (c === "\r") {
        if (text[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
        cell += "\r\n";
        i++;
      } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
      else cell += c;
    } else if (afterQuote) {
      if (c === ",") {
        row.push(cell);
        cell = "";
        afterQuote = false;
      } else if (c === "\r") {
        if (text[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
        i++;
        push();
      } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
      else throw new Error("invalid character after quote");
    } else if (c === '"') {
      if (cell !== "") throw new Error("quote in an unquoted CSV field");
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r") {
      if (text[i + 1] !== "\n") throw new Error("bare CR is not RFC4180-compatible");
      i++;
      push();
    } else if (c === "\n") throw new Error("bare LF is not RFC4180-compatible");
    else cell += c;
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (rows.some((r) => r.every((v) => v === ""))) throw new Error("extra empty row");
  const columns = rows[0]?.length ?? 0;
  if (columns === 0 || rows.some((r) => r.length !== columns))
    throw new Error("CSV column count mismatch");
  return rows;
}

describe("Phase 4-4 real chart/table/CSV parity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("preserves consumption monthly and MA12 provenance in the NewGraph tooltip payload", () => {
    const row = matrix.earnings.rows[0];
    const key = "消費(総合)";
    const tooltipMetadata = projectTooltipMetadata(createComparisonSeriesRegistry()).filter(
      (entry) => entry.key === key,
    );
    expect(tooltipMetadata[0]?.baseYear).toBe(2025);
    const rendered = render(
      createElement(CustomTooltip, {
        active: true,
        payload: [
          {
            name: key,
            value: row[key] as number,
            dataKey: key,
            payload: row,
          },
        ],
        seriesMeta: tooltipMetadata,
        label: row.年月 as string,
        isMobile: false,
        isTouch: false,
        tooltipBg: "#fff",
        tooltipText: "#111",
        allowedKeys: [key],
      }),
    );
    const tooltipRow = rendered.container.querySelector('[data-tooltip-row="true"]');
    expect(tooltipRow?.getAttribute("data-tooltip-monthly-source-id")).toBe("000040499070");
    expect(tooltipRow?.getAttribute("data-tooltip-base-year")).toBe("2025");
    expect(
      tooltipRow?.querySelector('[data-tooltip-base-year-provenance="true"]')?.textContent,
    ).toContain("基準年: 2025年");
    expect(tooltipRow?.getAttribute("data-tooltip-ma12-window-start")).toBe("2017-01");
    expect(tooltipRow?.getAttribute("data-tooltip-ma12-window-end")).toBe("2017-12");
    expect(
      tooltipRow?.querySelector('[data-tooltip-consumption-provenance="true"]')?.textContent,
    ).toContain("2017-01〜2017-12");
  });

  it("publishes the canonical ten Plan39 categories with model and fingerprint provenance", async () => {
    expect(canonicalNominalKeys).toEqual(
      nominalCategories.map((category) => CTI_ADJUSTED_V2_PUBLIC_KEY_BY_CATEGORY[category]),
    );
    const rendered = await renderChart();
    await waitFor(() =>
      expect(
        rendered.container.querySelectorAll('[data-testid="chart-data-contract"]'),
      ).toHaveLength(7),
    );

    const contract = contractFor(rendered.container, "section-consumption-nominal");
    const descriptors = JSON.parse(contract.getAttribute("data-descriptors") ?? "[]") as Array<{
      key: string;
      valueType: string;
    }>;
    expect(JSON.parse(contract.dataset.series ?? "[]")).toEqual(canonicalNominalKeys);
    expect(descriptors.map(({ key }) => key)).toEqual(canonicalNominalKeys);
    const rows = [...contract.querySelectorAll("[data-chart-data-row]")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      for (const key of canonicalNominalKeys) {
        const cell = row.querySelector(`[data-series-key="${key}"]`);
        expect(cell?.getAttribute("data-model")).toBe("v2-bottom-up");
        expect(cell?.getAttribute("data-estimate-version")).toBe("plan39-v2");
        expect(cell?.getAttribute("data-input-fingerprint")).toBe(
          "sha256:chart-parity-plan39-fixture",
        );
      }
      expect(row.querySelector('[data-series-key="民間最終消費支出（名目）"]')).toBeNull();
      expect(row.querySelector('[data-series-key="食料（名目）"]')).toBeNull();
    }
  });
  it("compares all seven public key sets, periods, and every table/CSV cell", async () => {
    const { container } = await renderChart();
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blobs.push(b as Blob);
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    for (let i = 0; i < CONTRACT.ids.length; i++) {
      const table = container.querySelector(`#data-table-${CONTRACT.ids[i]}`) as HTMLElement;
      const contract = contractFor(container, CONTRACT.ids[i]);
      const section = CONTRACT.sections[i];
      expect(contract).toBeTruthy();
      expect(JSON.parse(contract.dataset.series ?? "[]")).toEqual(section.keys);
      expect(contract.querySelectorAll("[data-chart-data-row]").length).toBe(
        section.expected.length,
      );
      expect(
        [...contract.querySelectorAll("[data-chart-data-row]")].map((row) => [
          row.getAttribute("data-period") ?? "",
          ...[...row.querySelectorAll("[data-series-key]")].map((cell) =>
            cell.getAttribute("data-value-type") === "number"
              ? Number(cell.getAttribute("data-value")).toFixed(2)
              : "",
          ),
        ]),
      ).toEqual(section.expected);
      (table.querySelector("summary") as HTMLElement).click();
      const rows = within(table).getAllByRole("row");
      expect(
        rows.every(
          (r) =>
            within(r).getAllByRole(r === rows[0] ? "columnheader" : "cell").length ===
            section.keys.length + 1,
        ),
      ).toBe(true);
      expect(
        within(rows[0])
          .getAllByRole("columnheader")
          .map((cell) => cell.textContent),
      ).toEqual(["年月", ...section.headers]);
      expect(rows.slice(1).map((r) => within(r).getAllByRole("cell").map(tableValueText))).toEqual(
        section.expected,
      );
      const hasCanonicalNominal = i === 2;
      const nonCtiGdpMetadata = [
        ...table.querySelectorAll('td[data-series-key^="GDP"] [data-measurement-metadata]'),
      ];
      if (hasCanonicalNominal) {
        for (const key of canonicalNominalKeys) {
          const metadataRows = [...table.querySelectorAll(`[data-measurement-metadata="${key}"]`)];
          expect(metadataRows).toHaveLength(section.expected.length);
          expect(metadataRows[0]?.getAttribute("data-measurement-model")).toBe("v2-bottom-up");
          expect(metadataRows[0]?.getAttribute("data-measurement-estimate-version")).toBe(
            "plan39-v2",
          );
          expect(metadataRows[0]?.getAttribute("data-measurement-input-fingerprint")).toBe(
            "sha256:chart-parity-plan39-fixture",
          );
        }
        expect(
          table.querySelector('[data-measurement-metadata="民間最終消費支出（名目）"]'),
        ).toBeNull();
      } else {
        expect(nonCtiGdpMetadata).toHaveLength(0);
      }
      if (i === 6) {
        const consumptionMetadata = table.querySelector(
          'td[data-series-key="消費(総合)"] [data-measurement-metadata]',
        );
        expect(consumptionMetadata?.getAttribute("data-measurement-monthly-source-id")).toBe(
          "000040499070",
        );
        expect(consumptionMetadata?.getAttribute("data-measurement-base-year")).toBe("2025");
        expect(consumptionMetadata?.getAttribute("data-measurement-ma12-window-start")).toBe(
          "2017-01",
        );
        expect(consumptionMetadata?.getAttribute("data-measurement-ma12-window-end")).toBe(
          "2017-12",
        );
      }
      (within(table).getByRole("button", { name: /CSVでダウンロード/ }) as HTMLElement).click();
    }
    expect(blobs).toHaveLength(7);
    for (let i = 0; i < blobs.length; i++) {
      const raw = await blobs[i].text();
      expect(raw.replace(/^\uFEFF/, "").endsWith("\r\n")).toBe(true);
      expect([...raw.matchAll(/\r\n|\r|\n/g)].every(([ending]) => ending === "\r\n")).toBe(true);
      const rows = parseCsv(raw);
      const section = CONTRACT.sections[i];
      const metadataRegistry =
        i === 2
          ? canonicalNominalKeys.map((key) => ({ key }))
          : i === 3
            ? QUARTERLY_PUBLIC_REAL_KEYS.map((key) => ({ key }))
            : i === 4
              ? EARNINGS_SERIES_REGISTRY
              : i === 6
                ? createComparisonSeriesRegistry()
                : [];
      const metadataHeaders = metadataRegistry
        .filter(({ key }) => section.keys.includes(key))
        .flatMap(({ key }) => [
          `${key}__label`,
          `${key}__valueType`,
          // The normal earnings table has descriptors but no row-level
          // measurement for those six displayed keys, so retain its legacy
          // CSV contract without optional provenance columns.
          ...(i === 4 ? [] : [`${key}__seriesType`, `${key}__official`]),
          // 消費(総合) は annualAnchorType / quarterlyDerived を持つため、
          // csvExport の includeDerivedAxisMetadata が全キーへこの2列を広げる。
          ...(i === 3 || i === 6 ? [`${key}__annualAnchorType`, `${key}__quarterlyDerived`] : []),
          ...(i === 2
            ? [
                `${key}__model`,
                `${key}__estimateVersion`,
                `${key}__inputFingerprint`,
                `${key}__annualAnchorType`,
                `${key}__quarterlyDerived`,
              ]
            : []),
          `${key}__value`,
          `${key}__unit`,
          `${key}__source`,
          `${key}__frequency`,
          `${key}__aggregation`,
          `${key}__status`,
          `${key}__reason`,
          ...(i === 3
            ? [
                `${key}__sourceId`,
                `${key}__statInfId`,
                `${key}__householdScope`,
                `${key}__seasonalitySourceId`,
                `${key}__targetSourceId`,
                `${key}__targetHouseholdScope`,
                `${key}__bridgeAppliedRange`,
                `${key}__bridgeCoefficient`,
                `${key}__sourceWorkbook`,
                `${key}__sourceSheet`,
                `${key}__sourceColumn`,
                `${key}__sourceRole`,
                `${key}__sourceDerivedFromColumns`,
                `${key}__canonicalSeries`,
                `${key}__baseYear`,
                `${key}__cpiSeries`,
                `${key}__cpiPeriod`,
                `${key}__cpiAggregation`,
                `${key}__nominalSource`,
                `${key}__measurementNote`,
              ]
            : []),
          ...(i === 6
            ? [
                `${key}__baseYear`,
                `${key}__monthlySourceId`,
                `${key}__monthlyHouseholdScope`,
                `${key}__monthlySeriesType`,
                `${key}__monthlyDescription`,
                `${key}__ma12WindowStart`,
                `${key}__ma12WindowEnd`,
                `${key}__ma12Sources`,
                `${key}__ma12Statuses`,
              ]
            : []),
          ...(i === 2
            ? [
                `${key}__sourceWorkbook`,
                `${key}__sourceSheet`,
                `${key}__sourceColumn`,
                `${key}__sourceRole`,
                `${key}__sourceDerivedFromColumns`,
                `${key}__canonicalSeries`,
              ]
            : []),
        ]);
      expect(rows[0]).toEqual(["年月", ...section.headers, ...metadataHeaders]);
      expect(rows.slice(1).map((row) => row.slice(0, section.keys.length + 1))).toEqual(
        section.expected,
      );
      if (i === 6) {
        for (const [field, expected] of [
          ["baseYear", "2025"],
          ["monthlySourceId", "000040499070"],
          ["ma12WindowStart", "2017-01"],
          ["ma12WindowEnd", "2017-12"],
        ]) {
          const column = rows[0].indexOf(`消費(総合)__${field}`);
          expect(column).toBeGreaterThanOrEqual(0);
          expect(rows[1][column]).toBe(expected);
        }
      }
      expect(rows.every((r) => r.length === section.keys.length + 1 + metadataHeaders.length)).toBe(
        true,
      );
      if (i === 4) {
        expect(rows[0].slice(section.keys.length + 1)).toEqual(metadataHeaders);
      }
      if (i === 3) {
        for (const key of QUARTERLY_PUBLIC_REAL_KEYS) {
          const annualAnchorColumn = rows[0].indexOf(`${key}__annualAnchorType`);
          const quarterlyDerivedColumn = rows[0].indexOf(`${key}__quarterlyDerived`);
          expect(annualAnchorColumn).toBeGreaterThanOrEqual(0);
          expect(quarterlyDerivedColumn).toBeGreaterThanOrEqual(0);
          for (const [rowIndex, row] of rows.slice(1).entries()) {
            const sourceMeasurement = (
              realFixture.rows[rowIndex]?.measurements as
                | Record<string, { annualAnchorType?: string }>
                | undefined
            )?.[key];
            expect(row[annualAnchorColumn]).toBe(sourceMeasurement?.annualAnchorType ?? "");
            expect(row[quarterlyDerivedColumn]).toBe("true");
          }
        }
      }
      if (i === 2) {
        const metadataStart = section.keys.length + 1;
        for (const row of rows.slice(1)) {
          for (let keyIndex = 0; keyIndex < canonicalNominalKeys.length; keyIndex += 1) {
            const offset = metadataStart + keyIndex * 22;
            const key = canonicalNominalKeys[keyIndex]!;
            const isOther = key === otherNominalKey;
            expect(row[offset + 2]).toBe(isOther ? "estimated_adjusted" : "official_adjusted");
            expect(row[offset + 3]).toBe(String(!isOther));
            expect(row[offset + 4]).toBe("v2-bottom-up");
            expect(row[offset + 5]).toBe("plan39-v2");
            expect(row[offset + 6]).toBe("sha256:chart-parity-plan39-fixture");
            expect(row[offset + 7]).toBe("official");
            expect(row[offset + 8]).toBe(String(isOther));
            expect(row[offset + 16]).toBe("");
            expect(row[offset + 17]).toBe("");
            expect(row[offset + 18]).toBe("");
            expect(row[offset + 19]).toBe(isOther ? "derived_residual" : "");
            expect(row[offset + 20]).toBe("");
            expect(row[offset + 21]).toBe(isOther ? "その他の消費支出" : "");
          }
        }
        expect(rows.flat().join(",")).not.toContain("999999");
        expect(rows.flat().join(",")).not.toContain("777777");
        expect(rows.flat().join(",")).not.toContain("888888");
      }
    }
  });
  it("keeps raw quarterly keys private and publishes YYYYQn boundary labels", async () => {
    const { container } = await renderChart();
    expect(CONTRACT.sections[2].keys).toEqual(canonicalNominalKeys);
    expect(CONTRACT.sections[2].keys).not.toContain("民間最終消費支出（名目）");
    expect(CONTRACT.sections[2].keys).toHaveLength(10);
    expect(CONTRACT.sections[2].keys.some((key) => key.startsWith("GDP"))).toBe(false);
    for (const mode of ["nominal", "real"] as const) {
      const table = container.querySelector(
        `#data-table-section-consumption-${mode}`,
      ) as HTMLElement;
      const section = mode === "nominal" ? plan47Nominal(matrix.nominal) : realFixture;
      const rows = [...table.querySelectorAll("tbody tr")].map((row) =>
        [...row.querySelectorAll("th,td")].map(tableValueText),
      );
      expect(rows).toEqual(publicQuarterly(section).expected);
      expect(rows.map((row) => row[0])).toEqual(["2017Q4", "2018Q1"]);
      if (mode === "real") {
        expect(section.keys).not.toContain("民間最終消費支出（実質）");
        expect(section.keys).toContain("CTIミクロ調整系列（総合・実質）");
        expect(
          (realFixture.rows[0]?.measurements as Record<string, Record<string, unknown>>)?.[
            "食料（実質）"
          ],
        ).toMatchObject({
          cpiSeries: "食料",
          baseYear: 2025,
          cpiAggregation: "算術平均（四半期内の3か月）",
          nominalSource: expect.any(String),
        });
      }
      if (mode === "nominal") {
        expect(CONTRACT.sections[2].keys).toHaveLength(10);
        expect(
          table.querySelectorAll(`[data-measurement-metadata="${otherNominalKey}"]`),
        ).toHaveLength(2);
        expect(
          table
            .querySelector(`[data-measurement-metadata="${otherNominalKey}"]`)
            ?.getAttribute("data-measurement-source-role"),
        ).toBe("derived_residual");
      } else {
        expect(table.querySelector(`[data-measurement-metadata="${otherNominalKey}"]`)).toBeNull();
      }
    }
  });

  it("records the independent edge-case basis without deriving expectations from app constants", () => {
    expect(matrix.cpi.rows.some((row) => row["残差"] === null)).toBe(true);
    expect(
      independentFixture.cases["nominal-real"].boundary.map((label) =>
        label === "2017年10-12月" ? "2017Q4" : label === "2018年1-3月" ? "2018Q1" : label,
      ),
    ).toEqual(["2017Q4", "2018Q1"]);
  });

  it("round-trips the independent CSV special-character value through the real export button", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const value = independentFixture.cases["csv-special"].value;
    render(
      createElement(ChartExportButton, {
        title: "特殊文字",
        data: [{ 年月: value, 特殊文字: 1 }],
        keys: ["特殊文字"],
        headers: ["特殊文字"],
      }),
    );
    (
      within(document.body).getByRole("button", { name: /CSVでダウンロード/ }) as HTMLElement
    ).click();
    expect(blobs).toHaveLength(1);
    const raw = await blobs[0].text();
    expect(raw.replace(/^\uFEFF/, "").endsWith("\r\n")).toBe(true);
    expect(parseCsv(raw)).toEqual([
      ["年月", "特殊文字"],
      [value, "1.00"],
    ]);
  });

  it("adv=1 keeps the unsupported Spending extension private", async () => {
    const modes = ["nominal", "real"] as const;
    const regular: Record<string, { contract: string[][]; table: string[][]; csv: string[][] }> =
      {};
    const surface = (container: HTMLElement, mode: "nominal" | "real") => {
      const contract = contractFor(container, `section-consumption-${mode}`);
      const rows = [...contract.querySelectorAll("[data-chart-data-row]")].map((row) => [
        row.getAttribute("data-period") ?? "",
        ...[...row.querySelectorAll("[data-series-key]")].map((cell) =>
          cell.getAttribute("data-value-type") === "number"
            ? Number(cell.getAttribute("data-value")).toFixed(2)
            : "",
        ),
      ]);
      const table = container.querySelector(
        `#data-table-section-consumption-${mode}`,
      ) as HTMLElement;
      (table.querySelector("summary") as HTMLElement).click();
      const tableRows = [...table.querySelectorAll("tr")].map((row) =>
        [...row.querySelectorAll("th,td")].map((cell) => cell.textContent?.trim() ?? ""),
      );
      return { contract: rows, table: tableRows.slice(1), csv: [] };
    };
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    window.history.replaceState({}, "", "/");
    let rendered = await renderChart();
    for (let i = 0; i < modes.length; i++) {
      regular[modes[i]] = surface(rendered.container, modes[i]);
      (
        rendered.container
          .querySelector(`#data-table-section-consumption-${modes[i]}`)!
          .querySelector('button[aria-label*="CSV"]') as HTMLElement
      ).click();
    }
    for (let i = 0; i < modes.length; i++) regular[modes[i]].csv = parseCsv(await blobs[i].text());
    cleanup();
    blobs.length = 0;
    window.history.replaceState({}, "", "/?adv=1");
    rendered = await renderChart();
    for (let i = 0; i < modes.length; i++) {
      const current = surface(rendered.container, modes[i]);
      const fixture = modes[i] === "nominal" ? plan47Nominal(matrix.nominal) : realFixture;
      expect(current.contract).toEqual(regular[modes[i]].contract);
      expect(current.table.map((row) => row.map(normalizeMissingCell))).toEqual(
        regular[modes[i]].table.map((row) => row.map(normalizeMissingCell)),
      );
      expect(
        JSON.parse(
          contractFor(rendered.container, `section-consumption-${modes[i]}`).getAttribute(
            "data-series",
          )!,
        ),
      ).toEqual(fixture.keys);
      if (modes[i] === "real") {
        expect(fixture.keys).not.toContain("民間最終消費支出（実質）");
        expect(fixture.keys).toContain("CTIミクロ調整系列（総合・実質）");
      }
      (
        rendered.container
          .querySelector(`#data-table-section-consumption-${modes[i]}`)!
          .querySelector('button[aria-label*="CSV"]') as HTMLElement
      ).click();
    }
    expect(blobs).toHaveLength(2);
    for (let i = 0; i < modes.length; i++) {
      const raw = await blobs[i].text();
      expect(raw.replace(/^\uFEFF/, "").endsWith("\r\n")).toBe(true);
      const rows = parseCsv(raw);
      expect(rows).toEqual(regular[modes[i]].csv);
    }
  });

  it("rejects LF, missing final CRLF, malformed quotes, mismatched columns, and empty rows", () => {
    expect(() => parseCsv("a,b\na,b\n")).toThrow();
    expect(() => parseCsv("a,b\r\na,b")).toThrow();
    expect(() => parseCsv('a,b\r\n"unterminated,b\r\n')).toThrow();
    expect(() => parseCsv('a,b\r\n"bad"x,c\r\n')).toThrow();
    expect(() => parseCsv("a,b\r\na\r\n")).toThrow();
    expect(() => parseCsv("a,b\r\na,b\r\n\r\n")).toThrow();
  });
});
