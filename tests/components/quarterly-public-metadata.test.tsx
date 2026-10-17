import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTablesSection } from "../../src/app/components/DataTablesSection";
import { ChartDataContract } from "../../src/app/components/ChartDataContract";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";
import { buildCsv } from "../../src/lib/csvExport";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../src/lib/quarterlyPublicProjection";

const SERIES_KEY = "テスト用四半期系列";

const measurement = {
  key: SERIES_KEY,
  label: "テスト用四半期系列",
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

describe("quarterly public measurement metadata", () => {
  it("keeps an official Plan40 measurement in the quarterly table", () => {
    const key = QUARTERLY_PUBLIC_NOMINAL_KEYS[0];
    const officialMeasurement = {
      ...measurement,
      key,
      label: "住居",
      source: "Plan40 official quarterly source",
      value: 125,
      status: "available" as const,
      reason: null,
      valueType: "comparison" as const,
      seriesType: "official_adjusted" as const,
      official: true,
    };
    render(
      <DataTablesSection
        tables={[
          {
            chartSectionId: "plan40-official",
            title: "Plan40",
            data: [{ 年月: "2018Q1", [key]: 125, measurements: { [key]: officialMeasurement } }],
            keys: [key],
            metadata: [officialMeasurement],
          },
        ]}
      />,
    );
    const table = screen.getByTestId("data-table-plan40-official");
    const cell = table.querySelector("td[data-series-key]");
    expect(cell?.textContent).toContain("125");
    expect(cell?.textContent).toContain("Plan40 official quarterly source");
    expect(
      cell
        ?.querySelector("[data-measurement-series-type]")
        ?.getAttribute("data-measurement-series-type"),
    ).toBe("official_adjusted");
  });

  it("keeps an official Plan40 measurement in the quarterly tooltip", () => {
    const key = QUARTERLY_PUBLIC_NOMINAL_KEYS[0];
    const officialMeasurement = {
      ...measurement,
      key,
      label: "住居",
      source: "Plan40 official quarterly source",
      value: 125,
      status: "available" as const,
      reason: null,
      valueType: "comparison" as const,
      seriesType: "official_adjusted" as const,
      official: true,
    };
    render(
      <CustomTooltip
        active
        isMobile={false}
        isTouch={false}
        label="2018Q1"
        payload={[
          {
            name: "住居",
            dataKey: key,
            value: 125,
            payload: {
              年月: "2018Q1",
              [key]: 125,
              measurements: { [key]: officialMeasurement },
            },
          },
        ]}
        seriesMeta={[{ key, label: "住居", color: "#000", order: 0 }]}
        showAllPayload
        tooltipBg="#fff"
        tooltipText="#000"
      />,
    );
    const row = screen.getByText("住居").closest("[data-tooltip-row]");
    expect(row?.getAttribute("data-tooltip-status")).toBe("available");
    expect(row?.getAttribute("data-tooltip-source")).toBe("Plan40 official quarterly source");
    expect(row?.getAttribute("data-tooltip-series-type")).toBe("official_adjusted");
  });

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
                [SERIES_KEY]: null,
                measurements: {
                  [SERIES_KEY]: measurement,
                },
              },
            ],
            keys: [SERIES_KEY],
            metadata: [measurement],
          },
        ]}
      />,
    );

    const cell = screen
      .getByTestId("data-table-section-consumption-nominal")
      .querySelector(`[data-measurement-metadata="${SERIES_KEY}"]`);
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
                  [SERIES_KEY]: 100,
                  measurements: { [SERIES_KEY]: measurement },
                },
                { 年月: "2018Q1", [SERIES_KEY]: null },
                {
                  年月: "invalidQ",
                  [SERIES_KEY]: null,
                  measurements: { [SERIES_KEY]: laterMeasurement },
                },
              ],
              keys: [SERIES_KEY],
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
              payload: { 年月: "2018Q1", [SERIES_KEY]: null },
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
    expect(table.querySelectorAll(`[data-measurement-metadata="${SERIES_KEY}"]`)).toHaveLength(3);
    const metadataCells = [...table.querySelectorAll("[data-measurement-metadata]")];
    expect(
      metadataCells.filter((cell) => cell.textContent?.includes(measurement.source)),
    ).toHaveLength(1);
    expect(
      metadataCells.filter((cell) => cell.textContent?.includes(laterMeasurement.source)),
    ).toHaveLength(1);
    expect(table.textContent).toContain("理由: unavailable");
    const tooltipRow = document.querySelector(
      `[data-tooltip-row="true"][data-tooltip-label="${measurement.label}"]`,
    );
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
            [SERIES_KEY]: 100,
            measurements: { [SERIES_KEY]: measurement },
          },
          {
            年月: "2018Q1",
            [SERIES_KEY]: null,
            measurements: {
              [SERIES_KEY]: {
                ...measurement,
                status: "invalid",
                reason: "insufficient_months",
              },
            },
          },
          { 年月: "2018Q2", [SERIES_KEY]: null },
        ]}
        keys={[SERIES_KEY]}
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
          [SERIES_KEY]: 100,
          measurements: { [SERIES_KEY]: measurement },
        },
        {
          年月: "2018Q1",
          [SERIES_KEY]: null,
          measurements: {
            [SERIES_KEY]: { ...measurement, reason: "insufficient_months" },
          },
        },
        { 年月: "2018Q2", [SERIES_KEY]: null },
      ],
      [SERIES_KEY],
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
