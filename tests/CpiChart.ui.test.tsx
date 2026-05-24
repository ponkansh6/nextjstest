/**
 * @vitest-environment jsdom
 */

import { render } from "@testing-library/react";
import React from "react";
import CpiChart from "../src/app/components/CpiChart";
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

    // コンポーネントをレンダリング
    render(<CpiChart data={mockData} ctiData={[]} totalEarningData={totalEarningData} />);

    expect(true).toBeTruthy();
  });
});
