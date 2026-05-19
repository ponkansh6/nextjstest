import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { CpiAreaChart } from "../src/app/components/CpiAreaChart";
import { CpiBarChart } from "../src/app/components/CpiBarChart";

const MockTooltip = () => <div>Tooltip</div>;

describe("CpiChart Components", () => {
  const chartColors = {
    gridStroke: "#000",
    axisText: "#000",
    tooltipBg: "#000",
    tooltipText: "#000",
  };

  it("CpiAreaChart renders correctly", () => {
    const { container } = render(
      <CpiAreaChart
        title="Test Area Chart"
        data={[{ 年月: "2020年1月", A: 10 }]}
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

  it("CpiBarChart renders correctly", () => {
    const { container } = render(
      <CpiBarChart
        title="Test Bar Chart"
        data={[{ label: "2020年Q1", A: 10 }]}
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
