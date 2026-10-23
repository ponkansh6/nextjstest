import { renderHook, act } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock useChartTheme to avoid useSyncExternalStore SSR/hydration issues in test environment
vi.mock("@/hooks/useChartTheme", () => ({
  useChartTheme: () => ({
    chartColors: {
      gridStroke: "#cbd5e1",
    },
  }),
}));

import {
  createChartTooltipSelectionResolver,
  useChartTooltipController,
} from "../../src/app/components/charts/useChartTooltipProps";

function selectTouchPoint(
  controller: ReturnType<typeof useChartTooltipController>,
  chartId: string,
  drawerEnabled = false,
) {
  const bound = controller.bind(chartId, {
    dataLength: 1,
    drawerEnabled,
    selectionPayloadAtIndex: () => ({
      label: "row-0",
      payload: [{ dataKey: "value", name: "value", value: 1, payload: { label: "row-0" } }],
    }),
  });
  const wrapper = document.createElement("div");
  wrapper.className = "recharts-wrapper";
  const pointer = {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX: 10,
    clientY: 10,
    target: wrapper,
    currentTarget: wrapper,
  } as unknown as ReactPointerEvent<HTMLElement>;
  act(() => {
    bound.onPointerDown(pointer);
    bound.onChartMouseMove({ activeTooltipIndex: 0 });
    bound.onPointerUp?.(pointer);
  });
}

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

  it("uses the hit Recharts bar index for the selected source row", () => {
    const selectionPayloadAtIndex = vi.fn((index: number) => ({
      label: `row-${index}`,
      payload: [
        { dataKey: "value", name: "value", value: index, payload: { label: `row-${index}` } },
      ],
    }));
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("source-row", {
      dataLength: 3,
      selectionPayloadAtIndex,
    });
    const barGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    barGroup.setAttribute("class", "recharts-bar-rectangle");
    const bar = document.createElementNS("http://www.w3.org/2000/svg", "path");
    bar.setAttribute("data-index", "2");
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(new DOMRect(5, 5, 20, 20));
    barGroup.append(bar);
    const currentTarget = {
      querySelector: () => null,
      querySelectorAll: () => [bar],
      getBoundingClientRect: () => new DOMRect(0, 0, 300, 100),
    };
    const pointer = {
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: 10,
      clientY: 10,
      // Pointer handlers receive the wrapper as currentTarget, while the
      // event target is the actual SVG hit shape; handlers must
      // resolve its indexed ancestor rather than infer a row from coordinates.
      target: bar,
      currentTarget,
    } as unknown as ReactPointerEvent<HTMLElement>;

    act(() => {
      bound.onPointerDown(pointer);
      bound.onPointerUp?.(pointer);
    });

    expect(selectionPayloadAtIndex).toHaveBeenCalledWith(2);
    expect(result.current.bind("source-row", { dataLength: 3 }).tooltipProps.defaultIndex).toBe(2);
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it.each([
    {
      chartId: "major-indices",
      rows: [
        { label: "before", headline: 1 },
        { label: "visible-major-Q2", headline: 20 },
        { label: "after", headline: 3 },
      ],
      series: [{ key: "headline", color: "#a00" }],
    },
    {
      chartId: "stacked-area",
      rows: [
        { label: "before", food: 1, shelter: 2 },
        { label: "visible-stack-Q2", food: 20, shelter: 21 },
        { label: "after", food: 3, shelter: 4 },
      ],
      series: [
        { key: "food", name: "食料", color: "#f00" },
        { key: "shelter", name: "住居", color: "#00f" },
      ],
    },
    {
      chartId: "earnings",
      rows: [
        { label: "before", ordinary: 1, special: 2 },
        { label: "visible-earnings-Q2", ordinary: 20, special: 21 },
        { label: "after", ordinary: 3, special: 4 },
      ],
      series: [
        { key: "ordinary", name: "所定内給与", color: "#0a0" },
        { key: "special", name: "特別給与", color: "#a0a" },
      ],
    },
    {
      chartId: "residual-area",
      rows: [
        { label: "before", residual: 1 },
        { label: "visible-residual-Q2", residual: 20 },
        { label: "after", residual: 3 },
      ],
      series: [{ key: "residual", name: "残差", color: "#777" }],
    },
    {
      chartId: "new-graph-range",
      // This is already range-filtered; activeTooltipIndex is relative to this
      // exact NewGraph data array, not to the unfiltered quarterly source.
      rows: [
        { label: "range-Q1", salary: 10, cpi: 11 },
        { label: "range-Q2", salary: 20, cpi: 21 },
      ],
      series: [
        { key: "salary", name: "給与", color: "#00f" },
        { key: "cpi", name: "物価", color: "#f80" },
      ],
    },
  ])(
    "uses the same-interaction activeTooltipIndex for $chartId selection",
    ({ chartId, rows, series }) => {
      const resolverRows = rows as Array<Record<string, unknown>>;
      const resolve = vi.fn(
        createChartTooltipSelectionResolver(
          resolverRows.map((row, index) => ({ ...row, value: index + 10 })),
          () => series,
        ),
      );
      const { result } = renderHook(() =>
        useChartTooltipController({ isTouch: true, suppressed: false }),
      );
      const bound = result.current.bind(chartId, {
        dataLength: rows.length,
        drawerEnabled: true,
        selectionPayloadAtIndex: resolve,
      });
      const wrapper = document.createElement("div");
      wrapper.className = "recharts-wrapper";
      const pointer = {
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: 250,
        clientY: 60,
        target: wrapper,
        currentTarget: wrapper,
      } as unknown as ReactPointerEvent<HTMLElement>;

      act(() => {
        // A previous hover pointed at row zero; a zero-move tap must wait for
        // Recharts' click state instead of reusing that stale index.
        bound.onChartMouseMove({ activeTooltipIndex: 0 });
        bound.onPointerDown(pointer);
        bound.onPointerUp?.(pointer);
        expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
        bound.onClick({ activeTooltipIndex: 1 });
      });

      expect(resolve).toHaveBeenCalledWith(1);
      expect(
        result.current.bind(chartId, { dataLength: rows.length }).tooltipProps.defaultIndex,
      ).toBe(1);
      expect(resolve(1)?.label).toBe(rows[1]?.label);
      expect(
        resolve(1)?.payload.map(({ dataKey, name, color }) => ({ dataKey, name, color })),
      ).toEqual(
        series.map((item) => ({
          dataKey: item.key,
          name: ("name" in item ? item.name : undefined) ?? item.key,
          color: item.color,
        })),
      );
      expect(resolve(1)?.payload.map(({ value }) => value)).toEqual(
        series.map(({ key }) => (rows[1] as Record<string, unknown> | undefined)?.[key]),
      );
      expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
    },
  );

  it("leaves Recharts active control unset across charts for fine-pointer input", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );

    act(() => {
      result.current.bind("A").onClick();
    });

    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();
    expect(result.current.bind("B").tooltipProps.active).toBeUndefined();
  });

  it("leaves Recharts active control unset when fine-pointer focus changes charts", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );

    act(() => {
      result.current.bind("A").onClick();
    });
    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();

    act(() => {
      result.current.bind("B").onClick();
    });
    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();
    expect(result.current.bind("B").tooltipProps.active).toBeUndefined();
  });

  it("dismisses active charts on pointerdown outside recharts-wrapper", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    selectTouchPoint(result.current, "A");
    expect(result.current.bind("A").tooltipProps.active).toBe(true);

    // Dispatch pointerdown outside
    act(() => {
      const outsideEl = document.createElement("div");
      const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "target", { value: outsideEl });
      document.dispatchEvent(event);
    });

    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();
  });

  it("only intercepts Escape while a chart tooltip is active", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    selectTouchPoint(result.current, "A");
    expect(result.current.bind("A").tooltipProps.active).toBe(true);

    const otherKey = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(otherKey);
    });
    expect(otherKey.defaultPrevented).toBe(false);
    expect(result.current.bind("A").tooltipProps.active).toBe(true);

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();

    const inactiveEscape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(inactiveEscape);
    });
    expect(inactiveEscape.defaultPrevented).toBe(false);
    expect(result.current.bind("A").tooltipProps.active).toBeFalsy();
  });

  it("keeps same-position mouse movement suppressed after Escape", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const bound = result.current.bind("A", { dataLength: 5 });
    const interaction = {
      clientX: 100,
      clientY: 50,
      pointerType: "mouse",
      currentTarget: {
        querySelector: () => null,
        getBoundingClientRect: () => new DOMRect(0, 0, 200, 100),
      },
      relatedTarget: null,
    } as unknown as ReactPointerEvent<HTMLElement>;
    act(() => {
      bound.onChartMouseMove({ activeTooltipIndex: "1" });
      bound.onMouseMove(interaction);
    });
    expect(result.current.bind("A").tooltipProps.active).toBeUndefined();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(result.current.bind("A").tooltipProps.active).toBe(false);

    act(() => {
      result.current.bind("A").onMouseMove(interaction);
    });
    expect(result.current.bind("A").tooltipProps.active).toBe(false);
  });

  it("does not dismiss active charts on pointerdown inside recharts-wrapper", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    selectTouchPoint(result.current, "A");

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

    expect(result.current.bind("A").tooltipProps.active).toBe(true);
  });

  it("keeps the tooltip open when a chartNote link overlaps the visible tooltip among multiple tooltips", () => {
    const staleTooltip = document.createElement("div");
    staleTooltip.dataset.customTooltip = "true";
    vi.spyOn(staleTooltip, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 100, 100));

    const hiddenTooltip = document.createElement("div");
    hiddenTooltip.dataset.customTooltip = "true";
    hiddenTooltip.style.display = "none";
    vi.spyOn(hiddenTooltip, "getBoundingClientRect").mockReturnValue(
      new DOMRect(200, 10, 100, 100),
    );

    const visibleTooltip = document.createElement("div");
    visibleTooltip.dataset.customTooltip = "true";
    vi.spyOn(visibleTooltip, "getBoundingClientRect").mockReturnValue(
      new DOMRect(200, 10, 100, 100),
    );

    const chartNoteLink = document.createElement("a");
    chartNoteLink.dataset.chartNoteLink = "true";
    document.body.append(staleTooltip, hiddenTooltip, visibleTooltip, chartNoteLink);

    try {
      const { result } = renderHook(() =>
        useChartTooltipController({ isTouch: true, suppressed: false }),
      );

      selectTouchPoint(result.current, "A");

      act(() => {
        const event = new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 250,
          clientY: 50,
        });
        Object.defineProperty(event, "target", { value: chartNoteLink });
        document.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
      });

      expect(result.current.bind("A").tooltipProps.active).toBe(true);
    } finally {
      staleTooltip.remove();
      hiddenTooltip.remove();
      visibleTooltip.remove();
      chartNoteLink.remove();
    }
  });

  it("keeps the tooltip open when chart leave coordinates are inside a visible tooltip", () => {
    const tooltip = document.createElement("div");
    tooltip.dataset.customTooltip = "true";
    vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 10, 100, 100));
    document.body.append(tooltip);

    try {
      const { result } = renderHook(() =>
        useChartTooltipController({ isTouch: true, suppressed: false }),
      );

      selectTouchPoint(result.current, "A");

      act(() => {
        result.current.bind("A").onPointerLeave(
          new PointerEvent("pointerleave", {
            clientX: 250,
            clientY: 50,
          }) as unknown as ReactPointerEvent<HTMLElement>,
        );
      });

      expect(result.current.bind("A").tooltipProps.active).toBe(true);
    } finally {
      tooltip.remove();
    }
  });

  it("dismisses the tooltip when chart leave coordinates are outside visible tooltips", () => {
    const tooltip = document.createElement("div");
    tooltip.dataset.customTooltip = "true";
    vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 10, 100, 100));
    document.body.append(tooltip);

    try {
      const { result } = renderHook(() =>
        useChartTooltipController({ isTouch: true, suppressed: false }),
      );

      selectTouchPoint(result.current, "A");

      act(() => {
        result.current.bind("A").onPointerLeave(
          new PointerEvent("pointerleave", {
            clientX: 100,
            clientY: 50,
          }) as unknown as ReactPointerEvent<HTMLElement>,
        );
      });

      expect(result.current.bind("A").tooltipProps.active).toBeFalsy();
    } finally {
      tooltip.remove();
    }
  });

  it("dismisses active charts when window scrollY changes by more than 40px", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    selectTouchPoint(result.current, "A");
    expect(result.current.bind("A").tooltipProps.active).toBe(true);

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

    selectTouchPoint(result.current, "A");
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
    selectTouchPoint(result.current, "A");
    expect(result.current.bind("A").tooltipProps.active).toBe(true);

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

  it("returns activeDot as false initially on touch for inactive chart", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bindA = result.current.bind("A");
    expect(bindA.activeDot).toBe(false);
  });

  it("returns activeDot as undefined for active chart and false for inactive chart after onClick", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );

    selectTouchPoint(result.current, "A", true);

    expect(result.current.bind("A").activeDot).toBeUndefined();
    expect(result.current.bind("B").activeDot).toBe(false);
  });

  it("returns activeDot as undefined when isTouch is false", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const bindA = result.current.bind("A");
    expect(bindA.activeDot).toBeUndefined();
  });

  it("T5: passes showTotal to tooltipProps content props when specified in bind options", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const bound = result.current.bind("chart-id", { showTotal: true });
    expect((bound.tooltipProps.content as any).props.showTotal).toBe(true);
  });

  it("T6: showTotal is falsy when bind options are omitted", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const bound = result.current.bind("chart-id");
    expect((bound.tooltipProps.content as any).props.showTotal).toBeFalsy();
  });
});
