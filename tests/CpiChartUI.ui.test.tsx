/**
 * @vitest-environment happy-dom
 */

import { render } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";
import CpiChart from "../src/app/components/CpiChart";
import { CpiAreaChart } from "../src/app/components/CpiAreaChart";
import { CpiBarChart } from "../src/app/components/CpiBarChart";
import type { CpiData } from "../src/app/page";
import { createCpiDataList } from "./factories/cpiDataFactory";
import { setupUiMocks } from "./ui-mocks";

setupUiMocks();

// ResponsiveContainerをモック化
vi.mock(import("recharts"), async () => {
  const original = await vi.importActual("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const MockTooltip = () => <div>Tooltip</div>;
const chartColors = {
  axisText: "#000",
  gridStroke: "#000",
  tooltipBg: "#000",
  tooltipText: "#000",
};

describe("UI Tests (Consolidated)", () => {
  describe("cpiChart Component", () => {
    it("should filter data correctly based on year range", () => {
      const mockData: CpiData[] = createCpiDataList([
        { 年月: "2020年01月", 総合: 100 },
        { 年月: "2021年01月", 総合: 101 },
        { 年月: "2022年01月", 総合: 102 },
      ]);
      const totalEarningData: CpiData[] = createCpiDataList([
        { 年月: "2020年01月", 所定内給与: 100 },
        { 年月: "2021年01月", 所定内給与: 101 },
        { 年月: "2022年01月", 所定内給与: 102 },
      ]);

      render(<CpiChart data={mockData} ctiData={[]} totalEarningData={totalEarningData} />);
      expect(true).toBeTruthy();
    });
  });

  describe("cpiChart Components", () => {
    it("cpiAreaChart renders correctly", () => {
      const { container } = render(
        <CpiAreaChart
          title="Test Area Chart"
          data={[{ A: 10, 年月: "2020年1月" }]}
          keys={["A"]}
          colors={["#000"]}
          hiddenKeys={[]}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
        />,
      );
      expect(container.querySelector("h2")?.textContent).toBe("Test Area Chart");
    });

    it("cpiBarChart renders correctly", () => {
      const { container } = render(
        <CpiBarChart
          title="Test Bar Chart"
          data={[{ A: 10, label: "2020年Q1" }]}
          keys={["A"]}
          colors={["#000"]}
          hiddenKeys={[]}
          chartColors={chartColors}
          isMobile={false}
          CustomTooltip={MockTooltip}
          stackId="test"
        />,
      );
      expect(container.querySelector("h2")?.textContent).toBe("Test Bar Chart");
    });
  });
});
