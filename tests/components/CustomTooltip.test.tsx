import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
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

  it("hides the tooltip after the close button is clicked", () => {
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
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("2024年1月")).toBeNull();

    rerender(
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
    expect(screen.queryByText("2024年1月")).toBeNull();
  });

  it("reopens automatically when a different data point becomes active", () => {
    const { rerender } = render(
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
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("2024年1月")).toBeNull();

    rerender(
      <CustomTooltip
        active
        payload={payload}
        label="2024年2月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
      />,
    );
    expect(screen.getByText("2024年2月")).toBeDefined();
  });

  it("reopens when resetKey changes even if label is the same", () => {
    const { rerender } = render(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        resetKey={0}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("2024年1月")).toBeNull();

    rerender(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        resetKey={1}
      />,
    );
    expect(screen.getByText("2024年1月")).toBeDefined();
  });

  it("keeps the tooltip hidden when a tap during programmatic scroll is released (late-display suppression)", () => {
    const { rerender } = render(
      <CustomTooltip
        active={false}
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        resetKey={0}
        suppressed={true}
      />,
    );
    // 抑制中のタップで resetKey が増える（active は抑制中なので false のまま）
    rerender(
      <CustomTooltip
        active={false}
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        resetKey={1}
        suppressed={true}
      />,
    );
    // 抑制解除。Recharts 内部に残ったクリック状態が active として後出し表示される
    rerender(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        resetKey={1}
        suppressed={false}
      />,
    );
    // 何も操作していないのに表示されてはならない
    expect(screen.queryByText("2024年1月")).toBeNull();
  });

  it("shows the tooltip again for a legitimate tap after suppression is released", () => {
    const { rerender } = render(
      <CustomTooltip
        active={false}
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        resetKey={0}
        suppressed={true}
      />,
    );
    // 抑制解除（抑制中のタップなし）
    rerender(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        resetKey={0}
        suppressed={false}
      />,
    );
    expect(screen.queryByText("2024年1月")).toBeNull();
    // 抑制解除後の正当な新規タップで resetKey が増える
    rerender(
      <CustomTooltip
        active
        payload={payload}
        label="2024年1月"
        isMobile
        isTouch
        tooltipBg="#1e293b"
        tooltipText="#f1f5f9"
        resetKey={1}
        suppressed={false}
      />,
    );
    expect(screen.getByText("2024年1月")).toBeDefined();
  });

  it("dismisses automatically on page scroll when active and isTouch", () => {
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
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

    Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
    fireEvent.scroll(window);
    expect(screen.queryByText("2024年1月")).toBeNull();
  });
});
