import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeAll, describe, it, expect, vi } from "vitest";
import ChartInfoButton, {
  ChartInfoSectionHeading,
  ChartInfoList,
  ChartInfoListItem,
  ChartInfoSource,
  ChartInfoUrl,
} from "../../src/app/components/ChartInfoButton";
import ChartInfoContentRenderer from "../../src/app/components/ChartInfoContentRenderer";
import { EarningsBreakdownChart } from "../../src/app/components/EarningsBreakdownChart";
import { setupUiMocks } from "../utils/ui-mocks";

beforeAll(() => {
  setupUiMocks();
});

// ── Helper: mock data for EarningsBreakdownChart ──
const mockEarningsData = [
  {
    年月: "2023年1月",
    総合: 150,
    生鮮食品を除く総合: 140,
    持家の帰属家賃を除く総合: 145,
    "消費支出（参考）": 160,
    "CPI総合(参考)": 120,
    所定内給与: 100,
    所定外給与: 50,
    特別給与: 30,
    時間当たり給与: 10,
    "15歳以上国民当たり給与": 200,
  },
];

const mockChartColors = {
  gridStroke: "#e5e7eb",
  axisText: "#374151",
  tooltipBg: "#ffffff",
  tooltipText: "#374151",
};

const MockTooltip = () => null;

// ── Helper: content shared across tests ──

const SampleContent = (
  <>
    <ChartInfoSectionHeading>データソース</ChartInfoSectionHeading>
    <ChartInfoSource>Test Source</ChartInfoSource>
    <ChartInfoUrl href="https://example.com">詳細へ</ChartInfoUrl>
    <ChartInfoSectionHeading>項目</ChartInfoSectionHeading>
    <ChartInfoList>
      <ChartInfoListItem>項目A</ChartInfoListItem>
      <ChartInfoListItem>項目B</ChartInfoListItem>
    </ChartInfoList>
  </>
);

describe("ChartInfoButton", () => {
  // ── Init state ──

  it("renders trigger button with default aria-label", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    const btn = screen.getByRole("button", { name: "データソースの説明を表示" });
    expect(btn).toBeDefined();
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders trigger button with custom aria-label", () => {
    render(<ChartInfoButton ariaLabel="Custom label">{SampleContent}</ChartInfoButton>);
    expect(screen.getByRole("button", { name: "Custom label" })).toBeDefined();
  });

  it("popup is initially closed - content not visible", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    expect(screen.queryByText("Test Source")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applies custom className to wrapper", () => {
    const { container } = render(
      <ChartInfoButton className="my-class">{SampleContent}</ChartInfoButton>,
    );
    // The wrapper is a <span> with the className
    const wrapper = container.querySelector("span");
    expect(wrapper?.className).toContain("my-class");
  });

  // ── Open / Close behavior ──

  it("opens popup on trigger click", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    const trigger = screen.getByRole("button", { name: "データソースの説明を表示" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Test Source")).toBeDefined();
    expect(screen.getByText("項目A")).toBeDefined();
    expect(screen.getByText("項目B")).toBeDefined();
    expect(screen.getByText("詳細へ")).toBeDefined();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes popup on close button click", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    const trigger = screen.getByRole("button", { name: "データソースの説明を表示" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeDefined();

    const closeBtn = screen.getByRole("button", { name: "閉じる" });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Test Source")).toBeNull();
  });

  it("toggles on repeated trigger clicks", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    const trigger = screen.getByRole("button", { name: "データソースの説明を表示" });

    // Open
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    // Close
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    // Open again
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes popup on Escape key", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    const trigger = screen.getByRole("button", { name: "データソースの説明を表示" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes popup on outside pointerdown", async () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    const trigger = screen.getByRole("button", { name: "データソースの説明を表示" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeDefined();

    // The component registers the outside-click listener inside requestAnimationFrame,
    // so we wait for the next frame before dispatching the outside pointerdown
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does NOT close popup when clicking inside the popup content", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    expect(screen.getByRole("dialog")).toBeDefined();

    // Click on the heading inside popup
    fireEvent.pointerDown(screen.getByText("データソース"));
    // Popup should still be open
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  // ── Content rendering ──

  it("renders heading with ChartInfoSectionHeading", () => {
    render(
      <ChartInfoButton>
        <ChartInfoSectionHeading>テスト見出し</ChartInfoSectionHeading>
      </ChartInfoButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    expect(screen.getByText("テスト見出し")).toBeDefined();
  });

  it("renders list items with ChartInfoList + ChartInfoListItem", () => {
    render(
      <ChartInfoButton>
        <ChartInfoList>
          <ChartInfoListItem>項目1</ChartInfoListItem>
          <ChartInfoListItem>項目2</ChartInfoListItem>
        </ChartInfoList>
      </ChartInfoButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    expect(screen.getByText("項目1")).toBeDefined();
    expect(screen.getByText("項目2")).toBeDefined();
  });

  it("renders source text with ChartInfoSource", () => {
    render(
      <ChartInfoButton>
        <ChartInfoSource>出典：e-Stat</ChartInfoSource>
      </ChartInfoButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    expect(screen.getByText("出典：e-Stat")).toBeDefined();
  });

  it("renders external link with ChartInfoUrl", () => {
    render(
      <ChartInfoButton>
        <ChartInfoUrl href="https://example.com/data">詳細を見る</ChartInfoUrl>
      </ChartInfoButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));

    const link = screen.getByText("詳細を見る") as HTMLAnchorElement;
    expect(link).toBeDefined();
    expect(link.href).toBe("https://example.com/data");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
  });

  // ── Accessibility ──

  it("popup has role='dialog' and aria-modal='true'", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("close button has aria-label='閉じる'", () => {
    render(<ChartInfoButton>{SampleContent}</ChartInfoButton>);
    fireEvent.click(screen.getByRole("button", { name: "データソースの説明を表示" }));
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDefined();
  });

  // ── Multiple instances ──

  it("multiple ChartInfoButtons operate independently", () => {
    render(
      <div>
        <ChartInfoButton ariaLabel="ボタンA">
          <ChartInfoSource>内容A</ChartInfoSource>
        </ChartInfoButton>
        <ChartInfoButton ariaLabel="ボタンB">
          <ChartInfoSource>内容B</ChartInfoSource>
        </ChartInfoButton>
      </div>,
    );

    const btnA = screen.getByRole("button", { name: "ボタンA" });
    const btnB = screen.getByRole("button", { name: "ボタンB" });

    // Initially both closed
    expect(screen.queryByText("内容A")).toBeNull();
    expect(screen.queryByText("内容B")).toBeNull();

    // Open A
    fireEvent.click(btnA);
    expect(screen.getByText("内容A")).toBeDefined();
    expect(screen.queryByText("内容B")).toBeNull();

    // Open B (A remains open - each manages own state independently)
    fireEvent.click(btnB);
    expect(screen.getByText("内容A")).toBeDefined();
    expect(screen.getByText("内容B")).toBeDefined();

    // Close A
    fireEvent.click(btnA);
    expect(screen.queryByText("内容A")).toBeNull();
    expect(screen.getByText("内容B")).toBeDefined();

    // Close B
    fireEvent.click(btnB);
    expect(screen.queryByText("内容A")).toBeNull();
    expect(screen.queryByText("内容B")).toBeNull();
  });

  // ── EarningsBreakdownChart integration test ──
  it("should render EarningsBreakdownChart with ChartInfoButton for earnings info", () => {
    render(
      <EarningsBreakdownChart
        data={mockEarningsData}
        hiddenKeys={[]}
        onToggle={() => {}}
        chartColors={mockChartColors}
        isMobile={false}
        CustomTooltip={MockTooltip}
      />,
    );
    // Verify the chart title is rendered
    expect(screen.getByText("給与指標と関連指標")).toBeDefined();
    // Verify the ChartInfoButton is rendered (via ChartInfoContentRenderer)
    // The ChartInfoContentRenderer renders a ChartInfoButton internally
    // We can check for the presence of the info icon or the dialog trigger
    const infoButton = screen.getByRole("button", { name: "給与指標のデータソースを表示" });
    expect(infoButton).toBeDefined();
    expect(infoButton.getAttribute("aria-haspopup")).toBe("dialog");
    // Initially the popup should be closed
    expect(screen.queryByRole("dialog")).toBeNull();
    // Open the popup
    fireEvent.click(infoButton);
    expect(screen.getByRole("dialog")).toBeDefined();
    // Verify the earnings info content is rendered
    expect(screen.getByText("データの内訳")).toBeDefined();
    expect(screen.getByText("所定内給与（エリア）：基本給等の月次実値を指数化")).toBeDefined();
    expect(screen.getByText("データ加工")).toBeDefined();
    expect(
      screen.getByText("すべての給与系列は2020年基準で指数化（2020年平均 = 100）"),
    ).toBeDefined();
    expect(screen.getByText("所定内給与・所定外給与：月次実値を使用")).toBeDefined();
    expect(screen.getByText("特別給与：12か月移動平均を使用")).toBeDefined();
    expect(
      screen.getByText(
        "時間当たり給与：(所定内給与実値 + 所定外給与実値 + 特別給与12か月移動平均) ÷ 総労働時間12か月移動平均",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        "15歳以上国民当たり給与：((所定内給与実値 + 所定外給与実値 + 特別給与12か月移動平均) × 就業者数) ÷ 15歳以上人口",
      ),
    ).toBeDefined();
  });
});
