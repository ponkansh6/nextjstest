import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";

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
    expect(screen.getByText("150.75")).toBeDefined();
  });

  it("T3: computes total from all payload items even when mobile truncates to top 5", () => {
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
        isMobile={true}
        isTouch={true}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        showTotal={true}
      />,
    );
    // Total of 10+20+30+40+50+60+70 = 280
    expect(screen.getByText("合計")).toBeDefined();
    expect(screen.getByText("280.00")).toBeDefined();
    // Also check remaining count text exists ("他 2 件")
    expect(screen.getByText(/他 2 件/)).toBeDefined();
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
    expect(screen.getByText("150.00")).toBeDefined();
  });
});
