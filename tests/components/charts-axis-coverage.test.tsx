import { fireEvent, render, screen } from "@testing-library/react";
import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from "react";

const plotAreaState = vi.hoisted(() => ({ value: null as { x: number; width: number } | null }));

vi.mock("recharts", () => ({
  usePlotArea: () => plotAreaState.value,
  XAxis: ({
    ticks,
    tick,
    dataKey,
    interval,
    dy,
  }: {
    ticks: string[];
    tick: (props: Record<string, unknown>) => ReactNode;
    dataKey: string;
    interval: number;
    dy: number;
  }) => (
    <svg data-testid="axis" data-key={dataKey} data-interval={interval} data-dy={dy}>
      {ticks.map((value, index) => (
        <g key={`${value}-${index}`}>
          {tick({
            index,
            visibleTicksCount: ticks.length,
            payload: { value },
            coordinate: index * 48,
            x: index * 48,
            viewBox: { x: 0, width: Math.max(100, (ticks.length - 1) * 48) },
            tickFormatter: () => "formatted-but-not-used",
            verticalAnchor: "start",
            role: "img",
          })}
        </g>
      ))}
    </svg>
  ),
}));

vi.mock("@/hooks/useChartTheme", () => ({
  useChartTheme: () => ({
    isMobile: false,
    chartColors: {
      gridStroke: "#ccc",
      tooltipBg: "#fff",
      tooltipText: "#111",
    },
  }),
}));

import { TimeSeriesXAxis } from "@/app/components/charts/TimeSeriesXAxis";
import { XAxisEdgeTick } from "@/app/components/charts/XAxisEdgeTick";
import { computePeriodXAxisTicks, computeXAxisTicks } from "@/app/components/charts/xAxisTicks";
import { useChartTooltipController } from "@/app/components/charts/useChartTooltipProps";

const data = [
  { 年月: "2000年1月" },
  { 年月: "2010年1月" },
  { 年月: "2015年1月" },
  { 年月: "2020年1月" },
  { 年月: "2025年1月" },
  { 年月: "2030年1月" },
];

describe("shared time-series axis coverage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    plotAreaState.value = null;
  });

  it("keeps desktop endpoints and supplied tick limits while forwarding chart colors", () => {
    render(
      <TimeSeriesXAxis
        data={data}
        chartColors={{ axisText: "#345", axisTextEmphasis: "#123" }}
        tickOptions={{ maxTicks: 4 }}
      />,
    );
    const axis = screen.getByTestId("axis");
    expect(axis.getAttribute("data-key")).toBe("年月");
    expect(axis.getAttribute("data-interval")).toBe("0");
    expect(axis.getAttribute("data-dy")).toBe("10");
    expect(axis.querySelectorAll("text")).toHaveLength(4);
    expect(axis.querySelector("text")?.getAttribute("fill")).toBe("#123");
    expect(axis.querySelectorAll("text")[1]?.getAttribute("fill")).toBe("#345");
    expect(axis.querySelectorAll("text")[3]?.getAttribute("fill")).toBe("#123");
  });

  it("keeps all nearby milestones on narrow viewports and avoids endpoint collisions", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    render(
      <TimeSeriesXAxis
        data={data}
        chartColors={{ axisText: "#345", axisTextEmphasis: "#123" }}
        tickOptions={{ maxTicks: 3 }}
      />,
    );
    const axis = screen.getByTestId("axis");
    expect([...axis.querySelectorAll("text")].map((node) => node.textContent)).toEqual([
      "2000/1",
      "2010/1",
      "2015/1",
      "2020/1",
      "2025/1",
      "2030/1",
    ]);
  });

  it("responds to viewport resize by applying the mobile endpoint-overlap policy", () => {
    const view = render(
      <TimeSeriesXAxis
        data={data}
        chartColors={{ axisText: "#345", axisTextEmphasis: "#123" }}
        tickOptions={{ maxTicks: 3 }}
      />,
    );
    expect(screen.getByTestId("axis").querySelectorAll("text")).toHaveLength(3);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    act(() => fireEvent(window, new Event("resize")));
    view.rerender(
      <TimeSeriesXAxis
        data={data}
        chartColors={{ axisText: "#345", axisTextEmphasis: "#123" }}
        tickOptions={{ maxTicks: 3 }}
      />,
    );
    expect(screen.getByTestId("axis").querySelectorAll("text")).toHaveLength(6);
  });

  it("uses the server snapshot for viewport width during server rendering", () => {
    const html = renderToString(
      <TimeSeriesXAxis data={data} chartColors={{ axisText: "#345", axisTextEmphasis: "#123" }} />,
    );
    expect(html).toContain("2000/1");
  });

  it("formats only year-month labels and filters Recharts layout props from SVG text", () => {
    const { rerender } = render(
      <svg>
        <XAxisEdgeTick
          fill="#345"
          emphasisFill="#123"
          index={0}
          visibleTicksCount={3}
          payload={{ value: "2025年12月" }}
          tickFormatter={() => "ignored"}
          verticalAnchor="start"
          role="img"
          aria-label="終了年"
        />
      </svg>,
    );
    const edge = screen.getByRole("img", { name: "終了年" });
    expect(edge.textContent).toBe("2025/12");
    expect(edge.getAttribute("fill")).toBe("#123");
    expect(edge.getAttribute("text-anchor")).toBe("middle");
    expect(edge.getAttribute("tickformatter")).toBeNull();
    expect(edge.getAttribute("verticalanchor")).toBeNull();

    rerender(
      <svg>
        <XAxisEdgeTick fill="#345" emphasisFill="#123" payload={{ value: 42 }} />
      </svg>,
    );
    expect(screen.getByText("42").getAttribute("fill")).toBe("#345");
    rerender(
      <svg>
        <XAxisEdgeTick fill="#345" emphasisFill="#123" payload={{ value: "2025Q4" }} />
      </svg>,
    );
    expect(screen.getByText("2025Q4")).not.toBeNull();
    rerender(
      <svg>
        <XAxisEdgeTick fill="#345" emphasisFill="#123" payload={{ value: "2025年1月" }} />
      </svg>,
    );
    expect(screen.getByText("2025/1")).not.toBeNull();
  });

  it("handles an absent payload label with an empty rendered tick", () => {
    const { container } = render(
      <svg>
        <XAxisEdgeTick fill="#345" emphasisFill="#123" />
      </svg>,
    );
    expect(container.querySelector("text")?.textContent).toBe("");
  });

  it("uses plot coordinates when available and falls back to the supplied viewBox", () => {
    const { rerender } = render(
      <svg>
        <XAxisEdgeTick
          fill="#345"
          emphasisFill="#123"
          index={1}
          visibleTicksCount={3}
          payload={{ value: "中間" }}
          coordinate={24}
          viewBox={{ x: 0, width: 100 }}
          avoidEndpointOverlap
        />
      </svg>,
    );
    expect(screen.queryByText("中間")).toBeNull();
    rerender(
      <svg>
        <XAxisEdgeTick
          fill="#345"
          emphasisFill="#123"
          index={1}
          visibleTicksCount={3}
          payload={{ value: "中間" }}
          x={50}
          viewBox={{ x: 0, width: 100 }}
          avoidEndpointOverlap
        />
      </svg>,
    );
    expect(screen.getByText("中間")).not.toBeNull();
    rerender(
      <svg>
        <XAxisEdgeTick
          fill="#345"
          emphasisFill="#123"
          index={0}
          visibleTicksCount={3}
          payload={{ value: "端点" }}
          coordinate={0}
          avoidEndpointOverlap
        />
      </svg>,
    );
    expect(screen.getByText("端点").getAttribute("fill")).toBe("#123");
  });

  it("prefers Recharts plot bounds when they are available", () => {
    plotAreaState.value = { x: 10, width: 100 };
    render(
      <svg>
        <XAxisEdgeTick
          fill="#345"
          emphasisFill="#123"
          index={1}
          visibleTicksCount={3}
          payload={{ value: "内側" }}
          coordinate={35}
          viewBox={{ x: 0, width: 500 }}
          avoidEndpointOverlap
        />
      </svg>,
    );
    expect(screen.queryByText("内側")).toBeNull();
  });
});

describe("period tick selector boundaries", () => {
  it("uses a custom tick key with empty, malformed, and singleton input", () => {
    expect(computeXAxisTicks([])).toEqual([]);
    expect(computeXAxisTicks([{ 年月: "bad", title: "only" }], "title")).toEqual(["only"]);
    expect(computeXAxisTicks([{ 年月: "bad" }])).toEqual(["bad"]);
  });

  it("handles null period indices, custom predicates, zero limits, and one interior slot", () => {
    const rows = [
      { 年月: "invalid-start", label: "start", chosen: false },
      { 年月: "custom-period", label: "middle-a", chosen: true },
      { 年月: "another-period", label: "middle-b", chosen: true },
      { 年月: "invalid-end", label: "end", chosen: false },
    ];
    expect(
      computePeriodXAxisTicks(rows, "label", {
        periodIndex: () => null,
        milestonePredicate: (row) => Boolean(row.chosen),
        boundaryPredicate: (row) => row.label === "middle-a",
        maxTicks: 3,
      }),
    ).toEqual(["start", "middle-a", "end"]);
    expect(
      computePeriodXAxisTicks(rows, "label", {
        maxTicks: 0,
        milestonePredicate: (row) => Boolean(row.chosen),
      }),
    ).toEqual(["start", "middle-a", "middle-b", "end"]);
  });

  it("accepts missing periods in endpoint and interior rows", () => {
    const rows = [
      { label: "start" },
      { label: "middle" },
      { label: "end" },
    ] as unknown as Parameters<typeof computePeriodXAxisTicks>[0];
    expect(computePeriodXAxisTicks(rows, "label")).toEqual(["start", "end"]);
  });

  it("respects a one-tick limit and de-duplicates selected candidates", () => {
    const rows = [
      { 年月: "2000年1月", label: "start" },
      { 年月: "2010年1月", label: "middle" },
      { 年月: "2020年1月", label: "end" },
    ];
    expect(
      computePeriodXAxisTicks(rows, "label", {
        milestonePredicate: () => true,
        maxTicks: 1,
      }),
    ).toEqual(["start", "end"]);
  });
});

function mouseMove(clientX: number, rect = new DOMRect(0, 0, 200, 100)) {
  return {
    clientX,
    clientY: 50,
    currentTarget: {
      querySelector: () => null,
      getBoundingClientRect: () => rect,
    },
    relatedTarget: null,
  } as unknown as ReactPointerEvent<HTMLElement>;
}

describe("chart tooltip controller selection and options", () => {
  it("clamps pointer coordinates, uses SVG viewBox scale, and keeps per-chart indices", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const first = result.current.bind("first", { dataLength: 5 });
    const second = result.current.bind("second", { dataLength: 2 });
    act(() => first.onMouseMove(mouseMove(-20)));
    expect(result.current.bind("first", { dataLength: 5 }).tooltipProps.defaultIndex).toBe(0);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.defineProperty(svg, "viewBox", { value: { baseVal: { width: 400 } } });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 0, 200, 100));
    const scaledEvent = {
      clientX: 210,
      clientY: 50,
      currentTarget: {
        querySelector: () => svg,
        getBoundingClientRect: () => new DOMRect(10, 0, 200, 100),
      },
    } as unknown as ReactPointerEvent<HTMLElement>;
    act(() => second.onMouseMove(scaledEvent));
    expect(result.current.bind("second", { dataLength: 2 }).tooltipProps.defaultIndex).toBe(1);
    expect(result.current.bind("first", { dataLength: 5 }).tooltipProps.active).toBeUndefined();
  });

  it("does not select when suppressed or given an empty data set, and handles a zero-width SVG", () => {
    const { result, rerender } = renderHook(
      ({ suppressed }) => useChartTooltipController({ isTouch: false, suppressed }),
      { initialProps: { suppressed: true } },
    );
    act(() => result.current.bind("chart", { dataLength: 3 }).onMouseMove(mouseMove(100)));
    expect(result.current.bind("chart").tooltipProps.active).toBe(false);
    rerender({ suppressed: false });
    act(() => result.current.bind("chart", { dataLength: 0 }).onMouseMove(mouseMove(100)));
    expect(result.current.bind("chart").tooltipProps.active).toBeUndefined();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.defineProperty(svg, "viewBox", { value: { baseVal: { width: 0 } } });
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 10));
    const event = {
      clientX: 10,
      currentTarget: {
        querySelector: () => svg,
        getBoundingClientRect: () => new DOMRect(0, 0, 0, 10),
      },
    } as unknown as ReactPointerEvent<HTMLElement>;
    act(() => result.current.bind("chart", { dataLength: 3 }).onMouseMove(event));
    expect(result.current.bind("chart", { dataLength: 3 }).tooltipProps.defaultIndex).toBe(2);
  });

  it("keeps a tooltip open for tooltip-covered pointer targets and closes on chart links/outside targets", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    act(() => result.current.bind("chart", { dataLength: 4 }).onClick());

    const visibleTooltip = document.createElement("div");
    visibleTooltip.dataset.customTooltip = "true";
    document.body.append(visibleTooltip);
    vi.spyOn(visibleTooltip, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 80));
    fireEvent.pointerDown(document.body, { clientX: 30, clientY: 30 });
    expect(result.current.bind("chart", { dataLength: 4 }).tooltipProps.active).toBe(true);
    act(() => result.current.bind("chart", { dataLength: 4 }).onMouseLeave(mouseMove(30)));
    expect(result.current.bind("chart", { dataLength: 4 }).tooltipProps.active).toBe(true);

    vi.spyOn(visibleTooltip, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0));
    fireEvent.pointerDown(visibleTooltip);
    expect(result.current.bind("chart", { dataLength: 4 }).tooltipProps.active).toBe(true);

    const wrapper = document.createElement("div");
    wrapper.className = "recharts-wrapper";
    const tableLink = document.createElement("a");
    tableLink.href = "#data-table-chart";
    const noteLink = document.createElement("a");
    noteLink.dataset.chartNoteLink = "true";
    wrapper.append(tableLink, noteLink);
    document.body.append(wrapper);

    fireEvent.pointerDown(wrapper);
    expect(result.current.bind("chart", { dataLength: 4 }).tooltipProps.active).toBe(true);
    fireEvent.pointerDown(tableLink);
    expect(result.current.bind("chart", { dataLength: 4 }).tooltipProps.active).toBeUndefined();
    act(() => result.current.bind("chart", { dataLength: 4 }).onClick());
    fireEvent.pointerDown(noteLink);
    expect(result.current.bind("chart", { dataLength: 4 }).tooltipProps.active).toBeUndefined();
    visibleTooltip.remove();
    wrapper.remove();
    fireEvent.pointerDown(document.body);
    expect(result.current.bind("chart", { dataLength: 4 }).tooltipProps.active).toBeUndefined();
  });

  it("dismisses a touch tooltip after a 40-pixel scroll", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    act(() => result.current.bind("touch", { dataLength: 3 }).onClick());
    expect(result.current.bind("touch", { dataLength: 3 }).tooltipProps.position).toEqual({
      x: 0,
      y: 0,
    });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 40 });
    act(() => fireEvent.scroll(window));
    expect(result.current.bind("touch", { dataLength: 3 }).tooltipProps.active).toBe(false);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("handles pointer types, untouched touch moves, and scrolls below the dismissal threshold", () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("touch", { dataLength: 5 });
    const pointer = (pointerType: string, clientX: number, clientY: number) =>
      ({
        ...mouseMove(clientX),
        clientY,
        pointerType,
      }) as unknown as ReactPointerEvent<HTMLElement>;

    act(() => bound.onPointerDown(pointer("touch", 10, 10)));
    act(() => bound.onPointerDown(pointer("mouse", 12, 12)));
    act(() =>
      result.current.bind("touch", { dataLength: 5 }).onPointerMove(pointer("mouse", 15, 15)),
    );
    act(() =>
      result.current.bind("touch", { dataLength: 5 }).onPointerMove(pointer("touch", 20, 20)),
    );
    expect(result.current.bind("touch", { dataLength: 5 }).tooltipProps.defaultIndex).toBeDefined();

    act(() =>
      result.current.bind("touch", { dataLength: 5 }).onPointerDown(pointer("touch", 10, 10)),
    );
    act(() =>
      result.current.bind("touch", { dataLength: 5 }).onPointerMove(pointer("touch", 14, 13)),
    );
    expect(result.current.bind("touch", { dataLength: 5 }).tooltipProps.defaultIndex).toBeDefined();

    act(() => result.current.bind("touch", { dataLength: 5 }).onClick());
    Object.defineProperty(window, "scrollY", { configurable: true, value: 39 });
    act(() => fireEvent.scroll(window));
    expect(result.current.bind("touch", { dataLength: 5 }).tooltipProps.active).toBeUndefined();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("ignores a synthetic mouse leave shortly after an unmoved touch gesture", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const pointerDown = {
      ...mouseMove(20),
      clientY: 20,
      pointerType: "touch",
    } as unknown as ReactPointerEvent<HTMLElement>;
    act(() => result.current.bind("touch", { dataLength: 3 }).onPointerDown(pointerDown));
    const mouseLeave = mouseMove(20);
    act(() => result.current.bind("touch", { dataLength: 3 }).onMouseLeave(mouseLeave));
    expect(result.current.bind("touch", { dataLength: 3 }).tooltipProps.defaultIndex).toBeDefined();
    now.mockReturnValue(13_000);
    act(() => result.current.bind("touch", { dataLength: 3 }).onMouseLeave(mouseLeave));
    expect(result.current.bind("touch", { dataLength: 3 }).tooltipProps.active).toBe(false);
    now.mockRestore();
  });

  it("keeps selection dismissed after Escape until a real chart exit and re-entry", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const length = 4;
    act(() => result.current.bind("chart", { dataLength: length }).onClick());
    fireEvent.keyDown(document, { key: "Enter" });
    expect(result.current.bind("chart", { dataLength: length }).tooltipProps.active).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(result.current.bind("chart", { dataLength: length }).tooltipProps.active).toBe(false);
    act(() => result.current.bind("chart", { dataLength: length }).onMouseMove(mouseMove(80)));
    expect(
      result.current.bind("chart", { dataLength: length }).tooltipProps.defaultIndex,
    ).toBeUndefined();
    act(() => result.current.bind("chart", { dataLength: length }).onMouseLeave(mouseMove(80)));
    act(() => result.current.bind("chart", { dataLength: length }).onMouseMove(mouseMove(80)));
    expect(
      result.current.bind("chart", { dataLength: length }).tooltipProps.defaultIndex,
    ).toBeDefined();
    expect(result.current.bind("chart", { dataLength: length }).tooltipProps.active).toBe(true);
  });

  it("passes tooltip options through and uses fixed touch placement while active", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const options = {
      showTotal: true,
      totalLabel: "合計値",
      allowedKeys: ["a", "b"],
      includeUnmappedPayload: true,
      valueFormatter: (value: number | null | undefined) => String(value ?? "欠損"),
      dataLength: 4,
    };
    act(() => result.current.bind("touch", options).onClick());
    const props = result.current.bind("touch", options).tooltipProps;
    expect(props.trigger).toBe("click");
    expect(props.position).toEqual({ x: 0, y: 0 });
    expect(props.wrapperStyle).toMatchObject({
      position: "fixed",
      visibility: "visible",
      zIndex: 1000,
    });
    expect(ReactElementProp(props.content, "showTotal")).toBe(true);
    expect(ReactElementProp(props.content, "totalLabel")).toBe("合計値");
    expect(ReactElementProp(props.content, "allowedKeys")).toEqual(["a", "b"]);
    expect(ReactElementProp(props.content, "includeUnmappedPayload")).toBe(true);
    expect(ReactElementProp(props.content, "valueFormatter")).toBe(options.valueFormatter);
    act(() => result.current.bind("touch", options).onClick());
    expect(result.current.bind("touch", options).tooltipProps.active).toBeUndefined();
  });

  it("dismisses on a vertical touch gesture but preserves horizontal scrubbing", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("touch", { dataLength: 5 });
    const pointer = (pointerType: string, clientX: number, clientY: number) =>
      ({
        ...mouseMove(clientX),
        clientY,
        pointerType,
      }) as unknown as ReactPointerEvent<HTMLElement>;
    act(() => bound.onPointerDown(pointer("touch", 30, 30)));
    act(() => bound.onPointerMove(pointer("touch", 33, 45)));
    expect(result.current.bind("touch").tooltipProps.active).toBe(false);

    act(() => bound.onPointerDown(pointer("touch", 30, 30)));
    act(() => bound.onPointerMove(pointer("touch", 60, 32)));
    expect(
      result.current.bind("touch", { dataLength: 5 }).tooltipProps.defaultIndex,
    ).toBeGreaterThan(0);
    expect(result.current.bind("touch").tooltipProps.active).toBeUndefined();
  });

  it("handles touch leave only after a gesture and preserves a tooltip-related leave target", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("touch", { dataLength: 3 });
    const pointer = (
      pointerType: string,
      clientX: number,
      clientY: number,
      relatedTarget: Element | null = null,
    ) =>
      ({
        ...mouseMove(clientX),
        clientY,
        pointerType,
        relatedTarget,
      }) as unknown as ReactPointerEvent<HTMLElement>;
    act(() => bound.onPointerDown(pointer("touch", 10, 10)));
    act(() => bound.onPointerLeave(pointer("touch", 10, 10)));
    expect(result.current.bind("touch").tooltipProps.active).toBeUndefined();

    act(() => bound.onPointerMove(pointer("touch", 30, 10)));
    const tooltip = document.createElement("div");
    tooltip.dataset.customTooltip = "true";
    document.body.append(tooltip);
    act(() => bound.onPointerLeave(pointer("touch", 30, 10, tooltip)));
    expect(result.current.bind("touch").tooltipProps.active).toBeUndefined();
    tooltip.remove();
    act(() => bound.onPointerLeave(pointer("touch", 30, 10)));
    expect(result.current.bind("touch").tooltipProps.active).toBe(false);
  });
});

function ReactElementProp(element: ReactElement, key: string): unknown {
  return (element.props as Record<string, unknown>)[key];
}
