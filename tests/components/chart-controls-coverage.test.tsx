import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CagrPanel } from "@/app/components/CagrPanel";
import { ChartDataContract } from "@/app/components/ChartDataContract";
import { ChartExportButton } from "@/app/components/ChartExportButton";
import { ChartFilters } from "@/app/components/ChartFilters";
import ChartInfoButton from "@/app/components/ChartInfoButton";
import ChartInfoContentRenderer from "@/app/components/ChartInfoContentRenderer";
import { DataTablesSection } from "@/app/components/DataTablesSection";
import { SUPPORT_SERIES_KEY_NOMINAL, type SeriesMetadata } from "@/lib/chartConstants";
import type { ChartInfoContent } from "@/lib/chartInfoContent";

vi.mock("@/app/components/CpiChart.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => key }),
}));
vi.mock("@/app/components/ChartInfoButton.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => key }),
}));

const descriptor: SeriesMetadata = {
  key: "series",
  label: "Series label",
  color: "#123456",
  unit: "index",
  source: "fixture source",
  frequency: "quarterly",
  aggregation: "quarterly_mean",
  seriesType: "unavailable",
  reason: "outside_period",
};

describe("chart control coverage contracts", () => {
  it("filters CAGR years, displays result/error and routes select and calculate actions", () => {
    const props = {
      allYears: [2004, 2005, 2020],
      cagrStartYear: 2005,
      cagrEndYear: 2020,
      cagrMonth: 7,
      cagrResult: 0.125,
      cagrError: "sample validation message",
      setCagrStartYear: vi.fn(),
      setCagrEndYear: vi.fn(),
      setCagrMonth: vi.fn(),
      calculateCAGR: vi.fn(),
    };
    render(<CagrPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    const dialog = screen.getByRole("dialog", { name: "年率上昇率（CAGR）" });
    expect(within(dialog).getByLabelText("開始年:").querySelectorAll("option")).toHaveLength(2);
    fireEvent.change(within(dialog).getByLabelText("開始年:"), { target: { value: "2020" } });
    fireEvent.change(within(dialog).getByLabelText("終了年:"), { target: { value: "2020" } });
    fireEvent.change(within(dialog).getByLabelText("評価月:"), { target: { value: "12" } });
    expect(props.setCagrStartYear).toHaveBeenCalledWith(2020);
    expect(props.setCagrEndYear).toHaveBeenCalledWith(2020);
    expect(props.setCagrMonth).toHaveBeenCalledWith(12);
    expect(within(dialog).getByText("12.50%")).toBeTruthy();
    expect(within(dialog).getByText("sample validation message")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "計算する" }));
    expect(props.calculateCAGR).toHaveBeenCalledTimes(1);
  });

  it("normalizes unavailable, malformed, string, and absent values in the DOM data contract", () => {
    const { container } = render(
      <ChartDataContract
        data={[
          {
            年月: "2025Q1",
            series: 12.5,
            text: "reported",
            invalid: Number.NaN,
            unavailable: 9,
            measurements: {
              unavailable: {
                seriesType: "unavailable",
                status: "available",
                bridgeAppliedRange: { startYear: 2010, endYear: 2020 },
                bridgeCoefficient: 1.1,
              },
              invalid: null,
            },
          },
          { label: "2025Q2", series: "12.75", text: false, missing: null },
          { period: "row without a known label" },
        ]}
        keys={["series", "text", "invalid", "unavailable", "missing"]}
        labelKeys={["年月", "label"]}
        descriptors={[descriptor]}
      />,
    );
    const rows = container.querySelectorAll("[data-chart-data-row]");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.getAttribute("data-period")).toBe("2025Q1");
    expect(rows[1]?.getAttribute("data-period")).toBe("2025Q2");
    expect(rows[2]?.getAttribute("data-period")).toBe("");
    expect(
      container.querySelector('[data-series-key="series"]')?.getAttribute("data-value-type"),
    ).toBe("number");
    expect(
      container.querySelector('[data-series-key="text"]')?.getAttribute("data-value-type"),
    ).toBe("string");
    expect(container.querySelector('[data-series-key="invalid"]')?.getAttribute("data-value")).toBe(
      "null",
    );
    expect(
      container.querySelector('[data-series-key="unavailable"]')?.getAttribute("data-value"),
    ).toBe("null");
    expect(
      container.querySelector('[data-series-key="missing"]')?.getAttribute("data-value-type"),
    ).toBe("null");
    expect(
      container.querySelector('[data-series-key="series"]')?.getAttribute("data-measurement-note"),
    ).toBe("利用不可: unavailable");
    expect(
      container
        .querySelector('[data-series-key="unavailable"]')
        ?.getAttribute("data-measurement-note"),
    ).toBe("利用不可");
    expect(
      container
        .querySelector('[data-series-key="unavailable"]')
        ?.getAttribute("data-bridge-applied-range"),
    ).toBe("2010-2020");
    expect(
      container
        .querySelector('[data-series-key="unavailable"]')
        ?.getAttribute("data-bridge-coefficient"),
    ).toBe("1.1");
  });

  it("selects start/end years and falls back to the minimum year for an empty range", () => {
    const setStartYear = vi.fn();
    const setEndYear = vi.fn();
    const { rerender } = render(
      <ChartFilters
        allYears={[2005, 2010, 2020, 2025]}
        startYear={2010}
        endYear={2020}
        setStartYear={setStartYear}
        setEndYear={setEndYear}
      />,
    );
    const start = screen.getByLabelText("開始年:") as HTMLSelectElement;
    const end = screen.getByLabelText("終了年:") as HTMLSelectElement;
    expect(
      (start.querySelector('option[value="2025"]') as HTMLOptionElement | null)?.disabled,
    ).toBe(true);
    expect((end.querySelector('option[value="2005"]') as HTMLOptionElement | null)?.disabled).toBe(
      true,
    );
    fireEvent.change(start, { target: { value: "2005" } });
    fireEvent.change(end, { target: { value: "2010" } });
    expect(setStartYear).toHaveBeenCalledWith(2005);
    expect(setEndYear).toHaveBeenCalledWith(2010);
    rerender(
      <ChartFilters
        allYears={[]}
        startYear={2010}
        endYear={2020}
        setStartYear={setStartYear}
        setEndYear={setEndYear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "最大期間" }));
    expect(setStartYear).toHaveBeenLastCalledWith(2005);
    expect(setEndYear).toHaveBeenLastCalledWith(2005);
  });

  it("exports metadata-rich CSV and revokes the temporary object URL", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:coverage");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const rows = [
      {
        年月: "2025Q1",
        series: 100,
        measurements: {
          "row-measurement": {
            label: "Row metadata",
            valueType: "comparison",
            value: 100,
            status: "unavailable",
            reason: "outside_period",
            frequency: "annual",
            seriesType: "unavailable",
            official: false,
            annualAnchorType: "estimated",
            quarterlyDerived: true,
            model: "v2-bottom-up",
            estimateVersion: "plan39-v2",
            inputFingerprint: "fixture-fingerprint",
            sourceId: "source-id",
            statInfId: "stat-id",
            householdScope: "two-or-more",
            sourceWorkbook: "book.xlsx",
            sourceSheet: "sheet",
            sourceColumn: "A",
            sourceRole: "anchor",
            sourceDerivedFromColumns: ["A", 2],
            canonicalSeries: "canonical",
            seasonalitySourceId: "seasonality-id",
            targetSourceId: "target-id",
            targetHouseholdScope: "all-households",
            bridgeAppliedRange: { startYear: 2000, endYear: 2020 },
            bridgeCoefficient: 1.2,
            baseYear: null,
            cpiSeries: "cpi-series",
            cpiPeriod: "2025Q1",
            cpiAggregation: "quarterly_mean",
            nominalSource: "nominal-source",
            measurementNote: "explicit measurement note",
          },
          "row-measurement-alt": {
            label: false,
            valueType: "raw",
            value: "not numeric",
            unit: 42,
            source: false,
            frequency: "fortnightly",
            aggregation: false,
            status: "invalid",
            reason: null,
            seriesType: "official_adjusted",
            official: "yes",
            annualAnchorType: "other",
            quarterlyDerived: "yes",
            model: "legacy",
            estimateVersion: "plan39-v1",
            inputFingerprint: 5,
            sourceId: 6,
            statInfId: false,
            householdScope: 7,
            sourceWorkbook: false,
            sourceSheet: 8,
            sourceColumn: null,
            sourceRole: true,
            sourceDerivedFromColumns: ["A", 2],
            canonicalSeries: 9,
            seasonalitySourceId: false,
            targetSourceId: 10,
            targetHouseholdScope: false,
            bridgeAppliedRange: { startYear: "2000", endYear: 2020 },
            bridgeCoefficient: "1.2",
            baseYear: "2020",
            cpiSeries: false,
            cpiPeriod: 11,
            cpiAggregation: false,
            nominalSource: 12,
            measurementNote: false,
          },
          "row-measurement-other": {
            status: "available",
            seriesType: "unsupported",
          },
          "row-measurement-official": {
            official: true,
          },
          unselected: { label: "Excluded metadata" },
        },
      },
      { 年月: "2025Q2", series: null },
    ];
    render(
      <ChartExportButton
        title="Sample / chart"
        data={rows}
        keys={[
          "series",
          "row-measurement",
          "row-measurement-alt",
          "row-measurement-other",
          "row-measurement-official",
          "without-metadata",
        ]}
        headers={[
          "Shown series",
          "Row measurement",
          "Alternate row measurement",
          "Other row measurement",
          "Official row measurement",
          "Missing",
        ]}
        metadata={[descriptor, { ...descriptor, key: "unselected", official: true }]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sample / chartのデータをCSVでダウンロード" }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:coverage");
    expect(document.querySelector("a[download='Sample_chart.csv']")).toBeNull();
    vi.restoreAllMocks();
  });

  it("exports nominal data and legacy rows without measurement objects", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:legacy");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(
      <>
        <ChartExportButton
          title="Nominal"
          data={[{ 年月: "2025Q1", [SUPPORT_SERIES_KEY_NOMINAL]: 10 }]}
          keys={[SUPPORT_SERIES_KEY_NOMINAL]}
        />
        <ChartExportButton
          title="Legacy"
          data={[{ 年月: "2025Q1", series: 10 }]}
          keys={["series"]}
        />
        <ChartExportButton
          title="Legacy measured"
          data={[{ 年月: "2025Q1", series: 10, measurements: { series: { label: "Legacy" } } }]}
          keys={["series"]}
        />
        <ChartExportButton
          title="Row official"
          data={[{ 年月: "2025Q1", series: 10, measurements: { series: { official: true } } }]}
          keys={["series"]}
        />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "NominalのデータをCSVでダウンロード" }));
    fireEvent.click(screen.getByRole("button", { name: "LegacyのデータをCSVでダウンロード" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Legacy measuredのデータをCSVでダウンロード" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Row officialのデータをCSVでダウンロード" }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(4);
  });

  it("renders table fallback, unavailable-period label, descriptor and empty table branches", () => {
    render(
      <DataTablesSection
        tables={[
          {
            chartSectionId: "fixture",
            title: "Fixture",
            keys: [
              "series",
              "missing",
              "legacy",
              SUPPORT_SERIES_KEY_NOMINAL,
              "CTIミクロ調整系列（食料）",
              "cpi-all",
              "cpi-source",
              "cpi-missing",
            ],
            headers: [
              "Series",
              "Missing",
              "Legacy",
              "Nominal",
              "CTI",
              "CPI all",
              "CPI source",
              "CPI missing",
            ],
            data: [
              {
                年月: "2025Q1",
                series: 10,
                missing: null,
                legacy: "bad",
                measurements: {
                  series: {
                    key: "series",
                    label: "Series",
                    unit: "index",
                    source: "fixture",
                    valueType: "raw",
                    value: 10,
                    status: "valid",
                    reason: null,
                    frequency: "quarterly",
                    aggregation: "mean",
                    baseYear: 2020,
                    bridgeAppliedRange: { startYear: 2010, endYear: 2020 },
                    bridgeCoefficient: 1.2,
                  },
                  missing: {
                    key: "missing",
                    label: "Missing",
                    unit: "",
                    source: "",
                    valueType: "raw",
                    value: null,
                    status: "unavailable",
                    reason: "outside_period",
                    frequency: "quarterly",
                    aggregation: "",
                  },
                  "cpi-all": {
                    key: "cpi-all",
                    label: "CPI all",
                    valueType: "raw",
                    value: 1,
                    status: "valid",
                    reason: null,
                    unit: "",
                    source: "",
                    frequency: "quarterly",
                    aggregation: "mean",
                    cpiSeries: "fixture",
                    statInfId: "stat",
                    sourceId: "source",
                    baseYear: 2020,
                    cpiPeriod: "2025Q1",
                    cpiAggregation: "mean",
                    nominalSource: "support",
                    bridgeAppliedRange: { startYear: 2010, endYear: 2020 },
                    bridgeCoefficient: 1.2,
                  },
                  "cpi-source": {
                    key: "cpi-source",
                    label: "CPI source",
                    valueType: "raw",
                    value: 2,
                    status: "valid",
                    reason: null,
                    unit: "",
                    source: "",
                    frequency: "quarterly",
                    aggregation: "mean",
                    cpiSeries: "fixture",
                    sourceId: "source-only",
                    baseYear: null,
                    cpiPeriod: "",
                    cpiAggregation: "",
                    nominalSource: "",
                  },
                  "cpi-missing": {
                    key: "cpi-missing",
                    label: "CPI missing identifiers",
                    valueType: "raw",
                    value: 3,
                    status: "valid",
                    reason: null,
                    unit: "",
                    source: "",
                    frequency: "quarterly",
                    aggregation: "mean",
                    cpiSeries: "fixture",
                    cpiPeriod: "",
                    cpiAggregation: "",
                    nominalSource: "",
                  },
                },
              },
              { label: "labeled row without year", series: null },
              { 年月: "", series: null, measurements: {} },
              { series: null },
            ],
            metadata: [
              descriptor,
              { ...descriptor, key: "missing", estimateVersion: "plan39-v2" },
              { ...descriptor, key: "legacy", baseYear: 2020 },
              { ...descriptor, key: SUPPORT_SERIES_KEY_NOMINAL },
              { ...descriptor, key: "CTIミクロ調整系列（食料）" },
            ],
          },
          { chartSectionId: "empty", title: "Empty", keys: [], data: [] },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("data-table-toggle-fixture"));
    const table = screen.getByTestId("data-table-fixture");
    const missingCell = table.querySelector('td[data-series-key="missing"]');
    expect(missingCell).not.toBeNull();
    expect(within(missingCell as HTMLElement).getAllByText("対象期間外")).toHaveLength(1);
    expect(within(table).getByText("10.00")).toBeTruthy();
    expect(within(table).getAllByText("-").length).toBeGreaterThan(0);
    expect(table.querySelector('small[data-measurement-base-year="2020"]')).toBeTruthy();
    expect(screen.getByTestId("data-table-empty")).toBeTruthy();
  });

  it("renders supplied info sections and an empty fallback, including conditional URL/subitems/footer", () => {
    const content: ChartInfoContent = {
      source: "Coverage source",
      url: "https://example.com/data",
      sections: [
        {
          heading: "Details",
          items: [
            { text: "Parent", subItems: ["Child A", "Child B"] },
            { text: "Standalone", subItems: [] },
          ],
        },
        { heading: "Empty", items: [] },
      ],
    };
    const { rerender } = render(
      <ChartInfoContentRenderer chartKey="cpi" content={content} footer={<p>Coverage footer</p>} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    expect(screen.getByText("Coverage source")).toBeTruthy();
    expect(screen.getByRole("link", { name: "データ詳細へ" }).getAttribute("href")).toBe(
      content.url,
    );
    expect(screen.getByText("Parent")).toBeTruthy();
    expect(screen.getByText("Child A")).toBeTruthy();
    expect(screen.getByText("Standalone")).toBeTruthy();
    expect(screen.getByText("Coverage footer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    rerender(
      <ChartInfoContentRenderer chartKey="cpi" content={{ source: "No link", sections: [] }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    expect(screen.getByText("No link")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "データ詳細へ" })).toBeNull();
    const missing = render(<ChartInfoContentRenderer chartKey="unconfigured-chart" />);
    expect(missing.container.firstChild).toBeNull();
  });

  it("keeps popup clicks open and closes on an outside pointer event and non-Escape key", async () => {
    render(
      <div>
        <ChartInfoButton>
          <p>Inside info</p>
        </ChartInfoButton>
        <button type="button">Outside control</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "データソースの説明を表示" });
    fireEvent.click(trigger);
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    fireEvent.pointerDown(screen.getByText("Inside info"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside control" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the CAGR sheet through its close callback", () => {
    render(
      <CagrPanel
        allYears={[2010, 2020]}
        cagrStartYear={2010}
        cagrEndYear={2020}
        cagrMonth={1}
        cagrResult={null}
        setCagrStartYear={vi.fn()}
        setCagrEndYear={vi.fn()}
        setCagrMonth={vi.fn()}
        calculateCAGR={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }));
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "年率上昇率（CAGR）" })).toBeNull();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
