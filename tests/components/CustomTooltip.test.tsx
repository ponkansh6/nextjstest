import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";

const payload = [{ name: "総合", value: 112.5, color: "#1d4ed8" }];

describe("CustomTooltip", () => {
  it("renders a close button on mobile when active", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.getByText("2024年1月")).toBeDefined();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeDefined();
  });

  it("does not render a close button on desktop", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile={false}
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.queryByRole("button", { name: "閉じる" })).toBeNull();
  });

  it("hides the tooltip after the close button is clicked", () => {
    render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("2024年1月")).toBeNull();
  });

  it("stays hidden while the same data point remains active (rerender with same label)", () => {
    const { rerender } = render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("2024年1月")).toBeNull();

    // Recharts re-renders the same active point repeatedly (e.g. on scroll/resize) —
    // it should remain dismissed as long as the point hasn't changed.
    rerender(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.queryByText("2024年1月")).toBeNull();
  });

  it("reopens automatically when a different data point becomes active", () => {
    const { rerender } = render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("2024年1月")).toBeNull();

    // User taps/drags to a different bar — a new label becomes active.
    rerender(
      <CustomTooltip
        active
        payload={payload}
        label="2024年2月"
        isMobile
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.getByText("2024年2月")).toBeDefined();
  });
});
