import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTablesSection } from "../../src/app/components/DataTablesSection";
import { ChartDataContract } from "../../src/app/components/ChartDataContract";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";
import { SUPPORT_SERIES_KEY_NOMINAL } from "../../src/lib/chartConstants";
import { buildCsv } from "../../src/lib/csvExport";

const measurement = {
  key: SUPPORT_SERIES_KEY_NOMINAL,
  label: "CTIミクロ（名目・四半期平均）",
  color: "#0f766e",
  unit: "指数",
  source: "e-Stat 公式CTI長期artifact 000040499070",
  valueType: "raw" as const,
  value: null,
  status: "invalid" as const,
  reason: "insufficient_months",
  frequency: "quarterly" as const,
  aggregation: "simple_mean_of_three_calendar_months",
};

const expectAttribute = (element: Element | null, name: string, value: string) => {
  if (!element) throw new Error(`element for ${name} was not rendered`);
  expect(element.getAttribute(name)).toBe(value);
};

describe("Plan38 public measurement metadata", () => {
  it("renders the row measurement metadata and invalid reason in the table", () => {
    render(
      <DataTablesSection
        tables={[
          {
            chartSectionId: "section-consumption-nominal",
            title: "消費支出（名目）",
            data: [
              {
                年月: "2005Q1",
                [SUPPORT_SERIES_KEY_NOMINAL]: null,
                measurements: {
                  [SUPPORT_SERIES_KEY_NOMINAL]: measurement,
                },
              },
            ],
            keys: [SUPPORT_SERIES_KEY_NOMINAL],
            metadata: [measurement],
          },
        ]}
      />,
    );

    const cell = screen
      .getByTestId("data-table-section-consumption-nominal")
      .querySelector(`[data-measurement-metadata="${SUPPORT_SERIES_KEY_NOMINAL}"]`);
    if (!cell) throw new Error("measurement metadata cell was not rendered");
    expect(cell.textContent).toContain("指数");
    expectAttribute(
      cell.querySelector("[data-measurement-value-type]"),
      "data-measurement-value-type",
      "raw",
    );
    expect(cell.textContent).toContain("e-Stat 公式CTI長期artifact 000040499070");
    expect(cell.textContent).toContain("quarterly");
    expect(cell.textContent).toContain("simple_mean_of_three_calendar_months");
    expect(cell.textContent).toContain("insufficient_months");
  });

  it("keeps the same measurement metadata on the tooltip row", () => {
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2005Q1"
        payload={[{ name: measurement.label, dataKey: measurement.key, value: null }]}
        seriesMeta={[measurement]}
        showAllPayload
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    const row = screen.getByText(measurement.label).closest("[data-tooltip-row]");
    if (!row) throw new Error("tooltip row was not rendered");
    expect(row.getAttribute("data-tooltip-unit")).toBe(measurement.unit);
    expect(row.getAttribute("data-tooltip-source")).toBe(measurement.source);
    expect(row.getAttribute("data-tooltip-value-type")).toBe("raw");
    expect(row.getAttribute("data-tooltip-frequency")).toBe(measurement.frequency);
    expect(row.getAttribute("data-tooltip-aggregation")).toBe(measurement.aggregation);
    expect(row.getAttribute("data-tooltip-status")).toBe(measurement.status);
    expect(row.getAttribute("data-tooltip-reason")).toBe(measurement.reason);
  });

  it("switches tooltip and table metadata by quarter without a common fallback", () => {
    const laterMeasurement = {
      ...measurement,
      source: "2018 CTI source",
      status: "valid" as const,
      reason: null,
    };
    render(
      <>
        <DataTablesSection
          tables={[
            {
              chartSectionId: "boundary",
              title: "境界",
              data: [
                {
                  年月: "2017Q4",
                  [SUPPORT_SERIES_KEY_NOMINAL]: 100,
                  measurements: { [SUPPORT_SERIES_KEY_NOMINAL]: measurement },
                },
                { 年月: "2018Q1", [SUPPORT_SERIES_KEY_NOMINAL]: null },
                {
                  年月: "invalidQ",
                  [SUPPORT_SERIES_KEY_NOMINAL]: null,
                  measurements: { [SUPPORT_SERIES_KEY_NOMINAL]: laterMeasurement },
                },
              ],
              keys: [SUPPORT_SERIES_KEY_NOMINAL],
              metadata: [measurement],
            },
          ]}
        />
        <CustomTooltip
          active
          isMobile={false}
          isTouch={false}
          label="2018Q1"
          payload={[
            {
              name: measurement.label,
              dataKey: measurement.key,
              value: null,
              payload: { 年月: "2018Q1", [SUPPORT_SERIES_KEY_NOMINAL]: null },
            },
          ]}
          seriesMeta={[measurement]}
          showAllPayload
          tooltipBg="#fff"
          tooltipText="#000"
        />
      </>,
    );

    const table = screen.getByTestId("data-table-boundary");
    expect(
      table.querySelectorAll(`[data-measurement-metadata="${SUPPORT_SERIES_KEY_NOMINAL}"]`),
    ).toHaveLength(3);
    const metadataCells = [...table.querySelectorAll("[data-measurement-metadata]")];
    expect(
      metadataCells.filter((cell) => cell.textContent?.includes(measurement.source)),
    ).toHaveLength(1);
    expect(
      metadataCells.filter((cell) => cell.textContent?.includes(laterMeasurement.source)),
    ).toHaveLength(1);
    expect(table.textContent).toContain("理由: unavailable");
    const tooltipRow = screen.getByText(measurement.label).closest("[data-tooltip-row]");
    if (!tooltipRow) throw new Error("tooltip row was not rendered");
    expect(tooltipRow.getAttribute("data-tooltip-status")).toBe("invalid");
    expect(tooltipRow.getAttribute("data-tooltip-reason")).toBe("unavailable");
    expect(tooltipRow.getAttribute("data-tooltip-source")).toBe("");
  });

  it("does not synthesize unavailable metadata for monthly non-CTI series", () => {
    const monthlyMeasurement = {
      ...measurement,
      key: "CPI総合(参考)",
      label: "CPI総合(参考)",
      frequency: "monthly" as const,
    };
    render(
      <DataTablesSection
        tables={[
          {
            chartSectionId: "monthly",
            title: "月次",
            data: [
              { 年月: "2025年1月", [monthlyMeasurement.key]: 100 },
              {
                年月: "2025年2月",
                [monthlyMeasurement.key]: 101,
                measurements: { [monthlyMeasurement.key]: monthlyMeasurement },
              },
            ],
            keys: [monthlyMeasurement.key],
            metadata: [monthlyMeasurement],
          },
        ]}
      />,
    );

    const table = screen.getByTestId("data-table-monthly");
    expect(table.querySelectorAll("[data-measurement-metadata]")).toHaveLength(1);
    expect(
      table.querySelector('[data-measurement-metadata="CPI総合(参考)"]')?.textContent,
    ).toContain("monthly");
  });

  it("keeps descriptor schema metadata while resolving ChartDataContract metadata per row", () => {
    render(
      <ChartDataContract
        data={[
          {
            年月: "2017Q4",
            [SUPPORT_SERIES_KEY_NOMINAL]: 100,
            measurements: { [SUPPORT_SERIES_KEY_NOMINAL]: measurement },
          },
          {
            年月: "2018Q1",
            [SUPPORT_SERIES_KEY_NOMINAL]: null,
            measurements: {
              [SUPPORT_SERIES_KEY_NOMINAL]: {
                ...measurement,
                status: "invalid",
                reason: "insufficient_months",
              },
            },
          },
          { 年月: "2018Q2", [SUPPORT_SERIES_KEY_NOMINAL]: null },
        ]}
        keys={[SUPPORT_SERIES_KEY_NOMINAL]}
        descriptors={[measurement]}
      />,
    );

    const rows = screen
      .getAllByTestId("chart-data-contract")[0]
      .querySelectorAll("[data-chart-data-row]");
    expectAttribute(rows[0]?.querySelector("[data-series-key]"), "data-source", measurement.source);
    expectAttribute(
      rows[0]?.querySelector("[data-series-key]"),
      "data-measurement-value-type",
      "raw",
    );
    expectAttribute(
      rows[1]?.querySelector("[data-series-key]"),
      "data-reason",
      "insufficient_months",
    );
    expectAttribute(rows[2]?.querySelector("[data-series-key]"), "data-status", "invalid");
    expectAttribute(rows[2]?.querySelector("[data-series-key]"), "data-reason", "unavailable");
    const unavailableSeries = rows[2]?.querySelector("[data-series-key]");
    if (!unavailableSeries) throw new Error("unavailable series was not rendered");
    expect(unavailableSeries.getAttribute("data-source")).not.toBe(measurement.source);

    const csv = buildCsv(
      [
        {
          年月: "2017Q4",
          [SUPPORT_SERIES_KEY_NOMINAL]: 100,
          measurements: { [SUPPORT_SERIES_KEY_NOMINAL]: measurement },
        },
        {
          年月: "2018Q1",
          [SUPPORT_SERIES_KEY_NOMINAL]: null,
          measurements: {
            [SUPPORT_SERIES_KEY_NOMINAL]: { ...measurement, reason: "insufficient_months" },
          },
        },
        { 年月: "2018Q2", [SUPPORT_SERIES_KEY_NOMINAL]: null },
      ],
      [SUPPORT_SERIES_KEY_NOMINAL],
      [measurement.label],
      { metadata: [measurement] },
    );
    expect(csv).toContain(`${measurement.source},quarterly`);
    expect(csv).toContain(`${measurement.label},raw,`);
    expect(csv).toContain("2018Q1");
    expect(csv).toContain("insufficient_months");
    expect(csv).toContain("invalid,unavailable");
  });
});
