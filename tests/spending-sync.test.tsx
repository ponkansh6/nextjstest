/**
 * @vitest-environment happy-dom
 */

import { render, fireEvent, screen } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";
import CpiChart from "../src/app/components/CpiChart";
import { setupUiMocks } from "./ui-mocks";
import { createCpiDataList } from "./factories/cpiDataFactory";

setupUiMocks();

// ResponsiveContainer and Chart components are mocked to simplify testing
vi.mock("recharts", async () => {
  const original = await vi.importActual("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Bar: ({ dataKey }: { dataKey: string }) => <div data-testid="recharts-bar" data-key={dataKey} />,
  };
});

describe("SpendingBarChart Synchronization", () => {
  const mockData = createCpiDataList([{ 年月: "2020年01月", 総合: 100 }]);

  it("should synchronize nominal and real keys when '全選択解除' is clicked", async () => {
    render(
      <CpiChart data={mockData} ctiData={mockData} totalEarningData={mockData} />
    );

    // Initial state: Nominal bars (10) and Real bars (10) should be rendered.
    let bars = screen.getAllByTestId("recharts-bar");
    const nominalBars = bars.filter(b => b.getAttribute("data-key")?.includes("名目"));
    const realBars = bars.filter(b => b.getAttribute("data-key")?.includes("実質"));

    expect(nominalBars.length).toBe(10);
    expect(realBars.length).toBe(10);

    // Find the "全選択解除" button for the spending chart.
    // There are two such buttons: one for CPI Stacked Area and one for Nominal Spending.
    const resetButtons = screen.getAllByText("全選択解除");
    const spendingResetButton = resetButtons[1];

    // Click to hide all
    fireEvent.click(spendingResetButton);

    // After reset, both nominal and real bars should be hidden.
    const hiddenBars = screen.queryAllByTestId("recharts-bar");
    const remainingNominal = hiddenBars.filter(b => b.getAttribute("data-key")?.includes("名目"));
    const remainingReal = hiddenBars.filter(b => b.getAttribute("data-key")?.includes("実質"));

    expect(remainingNominal.length).toBe(0);
    expect(remainingReal.length).toBe(0);

    // Click again to show all
    fireEvent.click(spendingResetButton);
    bars = screen.getAllByTestId("recharts-bar");
    expect(bars.filter(b => b.getAttribute("data-key")?.includes("名目")).length).toBe(10);
    expect(bars.filter(b => b.getAttribute("data-key")?.includes("実質")).length).toBe(10);
  });
});
