/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import CpiChart from "../src/app/components/CpiChart";
import { CpiData } from "../src/app/page";
import { createCpiDataList } from "./factories/cpiDataFactory";

// ResponsiveContainerをモック化
vi.mock("recharts", async () => {
  const original = await vi.importActual("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

// RechartsのResizeObserverエラーを防ぐモック
vi.stubGlobal(
  "ResizeObserver",
  vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
);

describe("CpiChart Component", () => {
  it("should render without crashing with provided data", () => {
    const mockData: CpiData[] = createCpiDataList([
      {
        年月: "2025年10月",
        総合: 110,
        生鮮食品を除く総合: 100,
        持家の帰属家賃を除く総合: 100,
      },
    ]);
    const totalEarningData: CpiData[] = createCpiDataList([
      {
        年月: "2025年10月",
        総合: 0,
        生鮮食品を除く総合: 0,
        持家の帰属家賃を除く総合: 0,
        所定内給与: 85,
        所定外給与: 6,
        特別給与: 2,
        時間当たり給与: 110,
        "15歳以上国民一人当たり給与": 118,
      },
    ]);

    const { container } = render(
      <CpiChart
        data={mockData}
        ctiData={[]}
        totalEarningData={totalEarningData}
      />,
    );

    expect(container).toBeDefined();
  });
});
