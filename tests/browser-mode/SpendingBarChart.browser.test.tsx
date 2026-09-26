import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { renderBrowserComponent } from "./renderBrowserComponent";

describe("SpendingBarChart empty state in Chromium", () => {
  it("announces the empty-state message when every supplied expense series is hidden", async () => {
    const keys = ["食料", "住居"];

    renderBrowserComponent(
      <SpendingBarChart
        title="消費支出（実質）"
        data={[{ label: "2025Q1", 年: 2025, quarter: 1, 年月: "2025Q1", 食料: 100, 住居: 50 }]}
        keys={keys}
        colors={["#e11d48", "#2563eb"]}
        hiddenKeys={keys}
        onToggle={() => {}}
        chartColors={{ barFill: "#94a3b8", gridStroke: "#e2e8f0", axisText: "#64748b" }}
        tooltipProps={{
          cursor: { stroke: "#000", strokeWidth: 1, strokeOpacity: 0.6 },
          trigger: "hover",
          content: <div />,
        }}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => {}}
      />,
    );

    const status = page.getByRole("status");
    await expect.element(status).toBeVisible();
    await expect
      .element(status)
      .toHaveTextContent("表示する系列がありません。凡例から費目を1つ以上選択してください。");
  });
});
