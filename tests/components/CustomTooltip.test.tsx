import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";
import { SUPPORT_SERIES_KEY_NOMINAL } from "../../src/lib/chartConstants";

const payload = [{ name: "総合", value: 112.5, color: "#1d4ed8" }];

describe("CustomTooltip", () => {
  it("renders a close button on touch when active", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.getByText("2024年1月")).toBeDefined();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDefined();
  });

  it("does not render a close button when isTouch is false", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });

  it("does not render a close button on mobile if isTouch is false", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile={true}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });

  it("renders a close button on tablet landscape (isMobile=false, isTouch=true)", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile={false}
        isTouch={true}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDefined();
  });

  it("calls onDismiss when close button is clicked or touchEnd", () => {
    const handleDismiss = vi.fn();
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        onDismiss={handleDismiss}
      />,
    );
    const closeBtn = screen.getByRole("button", { name: "閉じる" });
    fireEvent.click(closeBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(1);

    fireEvent.touchEnd(closeBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(2);
  });

  it("T1: does not render '合計' when showTotal is not provided", () => {
    const multiPayload = [
      { name: "食料", value: 100, color: "#f00" },
      { name: "住居", value: 50, color: "#0f0" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.queryByText("合計")).toBeNull();
  });

  it("T2: renders '合計' and correct sum when showTotal is true", () => {
    const multiPayload = [
      { name: "食料", value: 100.5, color: "#f00" },
      { name: "住居", value: 50.25, color: "#0f0" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal={true}
      />,
    );
    expect(screen.getByText("合計")).toBeDefined();
    const totalRow = screen.getByText("合計").parentElement as HTMLElement;
    expect(within(totalRow).getByText("150.75")).toBeDefined();
  });

  it("T3: computes total from all payload items and renders every item regardless of touch state", () => {
    const multiPayload = [
      { name: "A", value: 10, color: "#1" },
      { name: "B", value: 20, color: "#2" },
      { name: "C", value: 30, color: "#3" },
      { name: "D", value: 40, color: "#4" },
      { name: "E", value: 50, color: "#5" },
      { name: "F", value: 60, color: "#6" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={true}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal={true}
        showAllPayload={true}
      />,
    );
    // Total of 10+20+30+40+50+60 = 210
    expect(screen.getByText("合計")).toBeDefined();
    const totalRow = screen.getByText("合計").parentElement as HTMLElement;
    expect(within(totalRow).getByText("210.00")).toBeDefined();
    multiPayload.forEach((entry) => {
      const itemRow = screen.getByText(entry.name).parentElement as HTMLElement;
      expect(within(itemRow).getByText(entry.value.toFixed(2))).toBeDefined();
    });
    expect(screen.queryByText(/他\s*\d+\s*件/)).toBeNull();
  });

  it("T3: renders every desktop item when showAllPayload is true", () => {
    const multiPayload = [
      { name: "A", value: 10, color: "#1" },
      { name: "B", value: 20, color: "#2" },
      { name: "C", value: 30, color: "#3" },
      { name: "D", value: 40, color: "#4" },
      { name: "E", value: 50, color: "#5" },
      { name: "F", value: 60, color: "#6" },
      { name: "G", value: 70, color: "#7" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showAllPayload={true}
      />,
    );
    multiPayload.forEach(({ name }) => {
      expect(screen.getByText(name)).toBeDefined();
    });
    expect(screen.queryByText(/他\s*\d+\s*件/)).toBeNull();
  });

  it("T4: handles non-number values in payload safely by ignoring them", () => {
    const multiPayload = [
      { name: "食料", value: 100, color: "#f00" },
      { name: "無効", value: undefined as any, color: "#0f0" },
      { name: "住居", value: 50, color: "#00f" },
    ];
    render(
      <CustomTooltip
        active
        payload={multiPayload}
        label="2024年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal={true}
      />,
    );
    expect(screen.getByText("合計")).toBeDefined();
    const totalRow = screen.getByText("合計").parentElement as HTMLElement;
    expect(within(totalRow).getByText("150.00")).toBeDefined();
  });

  it("Plan24: excludes GDP comparison values from the CTI total", () => {
    render(
      <CustomTooltip
        active
        payload={[
          { name: "食料", dataKey: "食料", value: 100, color: "#f00" },
          { name: "GDP", dataKey: SUPPORT_SERIES_KEY_NOMINAL, value: 200, color: "#0ff" },
        ]}
        label="2025年1月"
        isMobile={false}
        isTouch={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal
        totalExcludedKeys={[SUPPORT_SERIES_KEY_NOMINAL]}
      />,
    );

    const itemRow = screen.getByText("食料").parentElement as HTMLElement;
    expect(within(itemRow).getByText("100.00")).toBeDefined();
    expect(screen.queryByText("300.00")).toBeNull();
    const gdpRow = screen.getByText("GDP").parentElement as HTMLElement;
    expect(within(gdpRow).getByText("200.00")).toBeDefined();
  });

  it("採用: showAllPayload renders every mobile value without the collapsed remainder", () => {
    const allPayload = Array.from({ length: 7 }, (_, index) => ({
      name: `費目${index + 1}`,
      value: index + 1,
      color: "#123456",
    }));
    render(
      <CustomTooltip
        active
        payload={allPayload}
        label="2024年1月"
        isMobile
        isTouch
        showAllPayload
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    allPayload.forEach((entry) => {
      const itemRow = screen.getByText(entry.name).parentElement as HTMLElement;
      expect(within(itemRow).getByText(entry.value.toFixed(2))).toBeDefined();
    });
    expect(screen.queryByText(/他 \d+ 件/)).toBeNull();
  });

  it("採用: mobile tooltip has internal scrolling and safe-area-aware bottom padding", () => {
    const { container } = render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    const tooltip = container.firstElementChild as HTMLElement;
    expect(tooltip.style.overflowY).toBe("auto");
    expect(tooltip.style.maxHeight).toContain("40dvh");
    expect(tooltip.style.maxHeight).toContain("env(safe-area-inset-top");
    expect(tooltip.style.maxHeight).toContain("env(safe-area-inset-bottom");
    // CSS environment variables are serialized differently across browsers.
    expect(tooltip.style.paddingBottom).toMatch(/10px/);
  });

  it("採用: mobile tooltip uses readable fee and total sizes with right-aligned values", () => {
    render(
      <CustomTooltip
        active
        payload={[{ name: "食料", value: 100, color: "#f00" }]}
        label="2024年1月"
        isMobile
        isTouch
        showTotal
        tooltipBg="#000"
        tooltipText="#fff"
      />,
    );
    expect(screen.getByText("食料").parentElement?.style.fontSize).toBe("14px");
    expect(screen.getByText("合計").parentElement?.style.fontSize).toBe("16px");
    const feeRow = screen.getByText("食料").parentElement as HTMLElement;
    expect(within(feeRow).getByText("100.00").style.textAlign).toBe("right");
  });
});
