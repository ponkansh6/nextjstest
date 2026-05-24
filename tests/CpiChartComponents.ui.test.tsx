import { render } from "@testing-library/react";
import React from "react";
import { CpiAreaChart } from "../src/app/components/CpiAreaChart";
import { CpiBarChart } from "../src/app/components/CpiBarChart";

const MockTooltip = () => <div>Tooltip</div>;

describe("cpiChart Components", () => {
  const chartColors = {
    axisText: "#000",
    gridStroke: "#000",
    tooltipBg: "#000",
    tooltipText: "#000",
  };

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
