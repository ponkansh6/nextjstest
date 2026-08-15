import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChartFilters } from "../../src/app/components/ChartFilters";

describe("ChartFilters - 最大期間ボタン", () => {
  const allYears = [2005, 2006, 2007, 2025, 2026];

  it("T1: 「最大期間」ボタンが表示されること", () => {
    render(
      <ChartFilters
        allYears={allYears}
        startYear={2010}
        endYear={2020}
        setStartYear={vi.fn()}
        setEndYear={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "最大期間" })).toBeDefined();
  });

  it("T2: 「最大期間」ボタンをクリックすると startYear が2005、endYear が2026に設定されること", () => {
    const handleSetStartYear = vi.fn();
    const handleSetEndYear = vi.fn();
    render(
      <ChartFilters
        allYears={allYears}
        startYear={2010}
        endYear={2020}
        setStartYear={handleSetStartYear}
        setEndYear={handleSetEndYear}
      />,
    );
    const btn = screen.getByRole("button", { name: "最大期間" });
    fireEvent.click(btn);
    expect(handleSetStartYear).toHaveBeenCalledWith(2005);
    expect(handleSetEndYear).toHaveBeenCalledWith(2026);
  });

  it("T3: ボタンクリックが冪等であることを確認（複数回クリックしても同じ値で呼ばれる）", () => {
    const handleSetStartYear = vi.fn();
    const handleSetEndYear = vi.fn();
    render(
      <ChartFilters
        allYears={allYears}
        startYear={2005}
        endYear={2026}
        setStartYear={handleSetStartYear}
        setEndYear={handleSetEndYear}
      />,
    );
    const btn = screen.getByRole("button", { name: "最大期間" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(handleSetStartYear).toHaveBeenCalledWith(2005);
    expect(handleSetEndYear).toHaveBeenCalledWith(2026);
  });
});
