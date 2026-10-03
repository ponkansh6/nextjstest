import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CpiData } from "@/types";
import type { CpiDataStatus } from "../../server/lib/data-loader/cpiSource";
import type { CtiBasicConsumptionStatus } from "../../server/lib/ctiBasicSeries2025LongTerm";

const mocks = vi.hoisted(() => ({
  loadCpiData: vi.fn(),
  loadTotalEarningData: vi.fn(),
  getCpiDataStatus: vi.fn(),
  getCtiBasicConsumptionStatus: vi.fn(),
  toCpiView: vi.fn(),
  toEarningsView: vi.fn(),
  loadQuarterlyPublicData: vi.fn(),
  chartProps: [] as unknown[],
  suspendChart: false,
}));

vi.mock("../../server/lib/dataLoader", () => ({
  loadCpiData: mocks.loadCpiData,
  loadTotalEarningData: mocks.loadTotalEarningData,
  getCpiDataStatus: mocks.getCpiDataStatus,
  getCtiBasicConsumptionStatus: mocks.getCtiBasicConsumptionStatus,
}));

vi.mock("../../server/lib/view-models/dashboard", () => ({
  toCpiView: mocks.toCpiView,
  toEarningsView: mocks.toEarningsView,
}));

vi.mock("../../server/lib/view-models/quarterlyProjection", () => ({
  loadQuarterlyPublicData: mocks.loadQuarterlyPublicData,
}));

vi.mock("../../src/app/components/CpiChart", () => ({
  default: (props: unknown) => {
    if (mocks.suspendChart) throw new Promise(() => undefined);
    mocks.chartProps.push(props);
    return <div data-testid="cpi-chart">chart</div>;
  },
}));

import Page from "../../src/app/page";

const cpiRows = [
  {
    年月: "2025年1月",
    総合: 100,
    生鮮食品を除く総合: 100,
    持家の帰属家賃を除く総合: 100,
    "消費支出（参考）": null,
    "CPI総合(参考)": 100,
  },
] satisfies CpiData[];

const ctiStatus = (overrides: Partial<CtiBasicConsumptionStatus> = {}) =>
  ({
    valid: true,
    baseline: 100,
    reason: null,
    artifactRoot: "data/source/official-cti-2025-long-term",
    artifactStatus: "ready",
    artifactReason: null,
    ...overrides,
  }) satisfies CtiBasicConsumptionStatus;

const quarterlyData = {
  nominal: [{ 年月: "2025Q1", 年: 2025, quarter: 1, label: "2025Q1" }],
  real: [{ 年月: "2025Q1", 年: 2025, quarter: 1, label: "2025Q1" }],
  maxCpiDate: { year: 2025, month: 1 },
};

const chartProps = () => mocks.chartProps.at(-1) as Record<string, unknown>;

function setLoaderState({
  cpiStatus = { baseYear: 2025, pair: "2025", valid: true },
  cti = ctiStatus(),
  consumptionRows = cpiRows,
  cpiView = [{ 年月: "2025年1月", 総合: 100 }],
}: {
  cpiStatus?: CpiDataStatus;
  cti?: CtiBasicConsumptionStatus;
  // The runtime loader adds a measurement sidecar to the public numeric row;
  // the page intentionally reads that additive metadata without exposing it
  // through the CpiData index signature.
  consumptionRows?: unknown[];
  cpiView?: Array<Record<string, string | number | null>>;
} = {}) {
  mocks.loadCpiData.mockResolvedValue(cpiRows);
  mocks.loadTotalEarningData.mockResolvedValue(consumptionRows);
  mocks.getCpiDataStatus.mockResolvedValue(cpiStatus);
  mocks.getCtiBasicConsumptionStatus.mockResolvedValue(cti);
  mocks.toCpiView.mockReturnValue(cpiView);
  mocks.toEarningsView.mockReturnValue([{ 年月: "2025年1月", 総合: 100 }]);
  mocks.loadQuarterlyPublicData.mockResolvedValue(quarterlyData);
}

describe("home page public status and rendering branches", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.chartProps.length = 0;
    mocks.suspendChart = false;
    vi.stubEnv("NODE_ENV", "production");
    setLoaderState();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("passes the official 2025 CPI, valid CTI, comparison status and projections to the chart", async () => {
    setLoaderState({
      consumptionRows: [
        {
          ...cpiRows[0],
          measurements: {
            "消費(総合)": {
              source: "official CTI comparison",
              seriesStatus: "valid",
              seriesReason: null,
            },
          },
        },
      ],
    });

    render(await Page());

    expect(screen.getByRole("heading", { name: "物価・賃金・消費の推移" })).toBeTruthy();
    expect(
      screen.getByText(
        "各指標は2025年平均=100の指数で表示しています。凡例クリックで系列を切替可能。",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("cpi-chart")).toBeTruthy();
    expect(mocks.toCpiView).toHaveBeenCalledWith(
      cpiRows,
      expect.arrayContaining(["総合", "生鮮食品を除く総合", "住居"]),
    );
    expect(mocks.toEarningsView).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining(["年月", "総合", "CTIミクロ基本系列（名目・原数値）"]),
    );
    expect(chartProps()).toEqual(
      expect.objectContaining({
        data: [{ 年月: "2025年1月", 総合: 100 }],
        quarterlyNominalData: quarterlyData.nominal,
        quarterlyRealData: quarterlyData.real,
        maxCpiDate: quarterlyData.maxCpiDate,
        cpiInfoState: {
          baseYear: 2025,
          sourceMode: "official-long",
          label: "2025年基準の公式接続指数",
        },
        ctiInfoState: expect.objectContaining({
          baseYear: 2025,
          sourceMode: "official-connected",
          status: "valid",
          series: expect.objectContaining({
            raw: expect.objectContaining({ status: "valid", reason: null }),
            comparison: expect.objectContaining({ status: "valid", reason: null }),
          }),
        }),
        consumptionSeriesState: { status: "valid", reason: null },
      }),
    );
  });

  it("uses the 2020 fallback label and exposes invalid CTI plus missing comparison state", async () => {
    setLoaderState({
      cpiStatus: { baseYear: 2020, pair: "2020", valid: true },
      cti: ctiStatus({ valid: false, reason: null, artifactStatus: "unavailable" }),
      consumptionRows: [{ ...cpiRows[0] }],
    });

    render(await Page());

    expect(screen.getByTestId("cpi-chart")).toBeTruthy();
    expect(chartProps().cpiInfoState).toEqual({
      baseYear: 2020,
      sourceMode: "fallback",
      label: "2020年基準の互換データ",
    });
    expect(chartProps().ctiInfoState).toEqual(
      expect.objectContaining({
        baseYear: null,
        sourceMode: "unavailable",
        unavailableReason: "CTI長期系列を利用できません。",
        status: "invalid",
        series: expect.objectContaining({
          raw: expect.objectContaining({ status: "invalid", reason: null }),
          comparison: expect.objectContaining({ status: "invalid", reason: null }),
        }),
      }),
    );
    expect(chartProps().consumptionSeriesState).toEqual({ status: "invalid", reason: null });
  });

  it("keeps the server-rendered heading while the chart is suspended", async () => {
    mocks.suspendChart = true;

    render(await Page());

    expect(screen.getByRole("heading", { name: "物価・賃金・消費の推移" })).toBeTruthy();
    expect(screen.queryByTestId("cpi-chart")).toBeNull();
  });

  it("preserves explicit CTI and comparison validation reasons", async () => {
    setLoaderState({
      cti: ctiStatus({ valid: false, reason: "official CTI checksum mismatch" }),
      consumptionRows: [
        {
          ...cpiRows[0],
          measurements: {
            "消費(総合)": {
              source: "comparison validation source",
              seriesStatus: "invalid",
              seriesReason: "comparison series failed validation",
            },
          },
        },
      ],
    });

    render(await Page());

    expect(chartProps().ctiInfoState).toEqual(
      expect.objectContaining({
        unavailableReason: "official CTI checksum mismatch",
        reason: "official CTI checksum mismatch",
        series: expect.objectContaining({
          raw: expect.objectContaining({ reason: "official CTI checksum mismatch" }),
          comparison: expect.objectContaining({
            source: "comparison validation source",
            status: "invalid",
            reason: "comparison series failed validation",
          }),
        }),
      }),
    );
    expect(chartProps().consumptionSeriesState).toEqual({
      status: "invalid",
      reason: "comparison series failed validation",
    });
  });

  it("uses the documented comparison source when valid-series metadata omits provenance", async () => {
    setLoaderState({
      consumptionRows: [
        {
          ...cpiRows[0],
          measurements: {
            "消費(総合)": { seriesStatus: "valid", seriesReason: null },
          },
        },
      ],
    });

    render(await Page());

    expect(chartProps().ctiInfoState).toEqual(
      expect.objectContaining({
        series: expect.objectContaining({
          comparison: expect.objectContaining({
            source: "e-Stat CTI長期系列と公式月次消費支出から算出",
          }),
        }),
      }),
    );
  });

  it("renders the CPI unavailable empty-data message in production", async () => {
    setLoaderState({
      cpiStatus: { baseYear: null, pair: null, valid: false, reason: "no CPI pair" },
      cpiView: [],
    });

    render(await Page());

    expect(screen.getAllByText("CPIデータは現在利用できません。")).toHaveLength(2);
    expect(
      screen.getByText("CPIデータを確認中です。時間をおいて再度お試しください。"),
    ).toBeTruthy();
    expect(screen.queryByText(/data\/source\/cpi_data2025_long\.csv/)).toBeNull();
    expect(screen.queryByTestId("cpi-chart")).toBeNull();
  });

  it("shows the development diagnostic when CPI is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    setLoaderState({
      cpiStatus: { baseYear: null, pair: null, valid: false, reason: "no CPI pair" },
      cpiView: [],
    });

    render(await Page());

    expect(screen.getByText(/data\/source\/cpi_data2025_long\.csv/)).toBeTruthy();
  });

  it("uses the ordinary empty-data error for an available CPI base year", async () => {
    setLoaderState({
      cpiStatus: { baseYear: 2025, pair: "2025", valid: true },
      cpiView: [],
    });

    render(await Page());

    expect(screen.getByText("データの読み込みに失敗したか、データが空です。")).toBeTruthy();
    expect(
      screen.getByText("データを読み込めませんでした。時間をおいて再度お試しください。"),
    ).toBeTruthy();
  });

  it("propagates a loader failure instead of presenting a misleading empty-data state", async () => {
    mocks.loadCpiData.mockRejectedValue(new Error("CPI loader failed"));

    await expect(Page()).rejects.toThrow("CPI loader failed");
  });
});
