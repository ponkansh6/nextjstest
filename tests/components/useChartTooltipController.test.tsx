import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock useChartTheme to avoid useSyncExternalStore SSR/hydration issues in test environment
vi.mock("@/hooks/useChartTheme", () => ({
  useChartTheme: () => ({
    chartColors: {
      gridStroke: "#cbd5e1",
    },
  }),
}));

import { useChartTooltipController } from "../../src/app/components/charts/useChartTooltipProps";

describe("useChartTooltipController", () => {
  let scrollYValue = 0;

  beforeEach(() => {
    scrollYValue = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollYValue);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns all false active states initially on touch", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bindA = result.current.bind("A");
    const bindB = result.current.bind("B");

    expect(bindA.tooltipProps.active).toBeFalsy();
    expect(bindB.tooltipProps.active).toBeFalsy();
    expect(bindA.tooltipProps.trigger).toBe("click");
    expect(bindA.tooltipProps.cursor).toBeDefined();
    expect(typeof bindA.onClick).toBe("function");
  });

  it("activates chart A and keeps chart B inactive when onClick is called on A", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    act(() => {
      result.current.bind("A").onClick();
    });

    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();
    expect(result.current.bind("B").tooltipProps.active).toBeFalsy();
  });

  it("deactivates chart A when chart B is clicked subsequently", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    act(() => {
      result.current.bind("A").onClick();
    });
    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();

    act(() => {
      result.current.bind("B").onClick();
    });
    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();
    expect(result.current.bind("B").tooltipProps.active).toBeUndefined();
  });

  it("dismisses active charts on pointerdown outside recharts-wrapper", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    act(() => {
      result.current.bind("A").onClick();
    });
    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();

    // Dispatch pointerdown outside
    act(() => {
      const outsideEl = document.createElement("div");
      const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "target", { value: outsideEl });
      document.dispatchEvent(event);
    });

    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();
  });

  it("does not dismiss active charts on pointerdown inside recharts-wrapper", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    act(() => {
      result.current.bind("A").onClick();
    });

    act(() => {
      const wrapperEl = document.createElement("div");
      wrapperEl.className = "recharts-wrapper";
      const innerEl = document.createElement("div");
      wrapperEl.appendChild(innerEl);

      // mock closest
      vi.spyOn(innerEl, "closest").mockImplementation((selector) => {
        if (selector === ".recharts-wrapper") return wrapperEl;
        return null;
      });

      const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "target", { value: innerEl });
      document.dispatchEvent(event);
    });

    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();
  });

  it("dismisses active charts when window scrollY changes by more than 40px", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    act(() => {
      result.current.bind("A").onClick();
    });
    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();

    scrollYValue = 50;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();
  });

  it("prevents activation when suppressed is true and remains suppressed after suppressed becomes false", () => {
    const { result, rerender } = renderHook(
      ({ suppressed }) => useChartTooltipController({ isTouch: true, suppressed }),
      { initialProps: { suppressed: true } },
    );

    act(() => {
      result.current.bind("A").onClick();
    });
    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();

    rerender({ suppressed: false });
    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();
  });

  it("sets trigger to hover and active always undefined when isTouch is false", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const bindA = result.current.bind("A");

    expect(bindA.tooltipProps.trigger).toBe("hover");
    expect(bindA.tooltipProps.active).toBeUndefined();
  });

  it("suppression clears an already-open tooltip and it must not resurface after release", () => {
    const { result, rerender } = renderHook(
      ({ suppressed }) => useChartTooltipController({ isTouch: true, suppressed }),
      { initialProps: { suppressed: false } },
    );

    // ツールチップを開く
    act(() => {
      result.current.bind("A").onClick();
    });
    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();

    // プログラム的スクロール開始（suppressed=true）→ 非表示になる
    act(() => {
      rerender({ suppressed: true });
    });
    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();

    // 抑制解除 → 古い状態が復活（後出し）してはならない
    act(() => {
      rerender({ suppressed: false });
    });
    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();
  });
});
