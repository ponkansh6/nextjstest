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
});
