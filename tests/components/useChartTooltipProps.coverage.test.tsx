import { act, renderHook } from "@testing-library/react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useChartTheme", () => ({
  useChartTheme: () => ({
    isMobile: false,
    chartColors: { gridStroke: "#ccc", tooltipBg: "#fff", tooltipText: "#111" },
  }),
}));

import {
  createChartTooltipSelectionResolver,
  useChartTooltipController,
} from "../../src/app/components/charts/useChartTooltipProps";

const selection = (index: number) => ({
  label: `label-${index}`,
  payload: [{ dataKey: "value", name: "Value", value: index, payload: { index } }],
});

function pointer(
  pointerType = "touch",
  pointerId = 1,
  target: Element = document.createElement("div"),
  clientX = 10,
  clientY = 10,
) {
  return {
    pointerId,
    pointerType,
    isPrimary: true,
    button: 0,
    clientX,
    clientY,
    target,
    currentTarget: target,
    nativeEvent: { target },
  } as unknown as ReactPointerEvent<HTMLElement>;
}

function openDrawer(
  result: { current: ReturnType<typeof useChartTooltipController> },
  chartId = "chart",
) {
  const bound = result.current.bind(chartId, {
    dataLength: 3,
    selectionPayloadAtIndex: selection,
  });
  const touch = pointer();
  act(() => {
    bound.onPointerDown(touch);
    bound.onChartMouseMove({ activeTooltipIndex: 1 });
    bound.onPointerUp?.(touch);
  });
  return bound;
}

describe("useChartTooltipProps controller branch coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects invalid and out-of-range chart indices, while accepting numeric strings", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: selection,
    });
    act(() => {
      bound.onChartMouseMove({ activeTooltipIndex: "02" });
      bound.onChartMouseMove({ activeTooltipIndex: -1 });
      bound.onChartMouseMove({ activeTooltipIndex: 2 });
    });
    const touch = pointer();
    let outcome: string | undefined;
    act(() => {
      bound.onPointerDown(touch);
      outcome = bound.onPointerUp?.(touch);
    });
    expect(outcome).toBe("awaiting-click");
    act(() => bound.onClick({ activeTooltipIndex: "1" }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("uses indexed hit targets, ignores events within tooltip markup, and applies keyboard fallback", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", {
      dataLength: 3,
      selectionPayloadAtIndex: selection,
    });
    const tooltip = document.createElement("div");
    tooltip.dataset.customTooltip = "true";
    const hit = document.createElement("path");
    hit.setAttribute("data-index", "2");
    const hitEvent = pointer("pen", 8, hit);
    act(() => bound.onPointerDown(hitEvent));
    expect(result.current.bind("chart").tooltipProps.defaultIndex).toBe(2);

    const insideTooltip = pointer("mouse", 9, tooltip);
    act(() => {
      bound.onPointerMove(insideTooltip);
      bound.onMouseMove(insideTooltip);
    });
    expect(result.current.bind("chart").tooltipProps.defaultIndex).toBe(2);

    const keyEvent = {
      key: "Enter",
      preventDefault: vi.fn(),
      currentTarget: { getBoundingClientRect: () => new DOMRect(0, 0, 100, 20) },
      target: document.createElement("button"),
    } as unknown as ReactKeyboardEvent<HTMLElement>;
    act(() => bound.onKeyDown?.(keyEvent));
    expect(keyEvent.preventDefault).toHaveBeenCalled();
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("covers touch gesture cancellation, mismatches, movement, suppression, and legacy mode", () => {
    const { result, rerender } = renderHook(
      ({ suppressed }) => useChartTooltipController({ isTouch: true, suppressed }),
      { initialProps: { suppressed: false } },
    );
    const bound = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: selection,
    });
    let outcome: string | undefined;

    act(() => {
      bound.onPointerDown(pointer("touch", 1));
      outcome = bound.onPointerUp?.(pointer("touch", 2));
    });
    expect(outcome).toBe("rejected-pointer-mismatch");

    act(() => {
      bound.onPointerDown(pointer("touch", 3));
      bound.onPointerCancel?.(pointer("touch", 3));
      outcome = bound.onPointerUp?.(pointer("touch", 3));
    });
    expect(outcome).toBe("rejected-cancelled");

    act(() => {
      bound.onPointerDown(pointer("touch", 4));
      bound.onPointerMove(pointer("touch", 4, document.createElement("div"), 20, 10));
      outcome = bound.onPointerUp?.(pointer("touch", 4));
      bound.onPointerLeave(pointer("touch", 4));
    });
    expect(outcome).toBe("rejected-moved");

    rerender({ suppressed: true });
    const suppressedBound = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: selection,
    });
    act(() => {
      suppressedBound.onPointerDown(pointer("touch", 5));
      outcome = suppressedBound.onPointerUp?.(pointer("touch", 5));
    });
    expect(outcome).toBe("rejected-suppressed");

    rerender({ suppressed: false });
    const legacy = result.current.bind("legacy", { drawerEnabled: false, dataLength: 2 });
    const legacyContent = legacy.tooltipProps.content as ReactElement<{
      onDismiss?: () => void;
      suppressInline?: boolean;
    }>;
    act(() => legacyContent.props.onDismiss?.());
    act(() => legacy.onMouseMove(pointer("mouse", 11)));
    expect(
      (
        result.current.bind("legacy", { drawerEnabled: false }).tooltipProps
          .content as ReactElement<{ suppressInline?: boolean }>
      ).props.suppressInline,
    ).toBe(true);
    act(() => legacy.onClick());
    expect(result.current.bind("legacy").tooltipProps.active).toBeFalsy();
  });

  it("waits for Recharts payload, commits fallback payloads, and ignores stale pending generations", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", { dataLength: 2 });
    const touch = pointer();
    let outcome: string | undefined;
    act(() => {
      bound.onPointerDown(touch);
      outcome = bound.onPointerUp?.(touch);
    });
    expect(outcome).toBe("awaiting-click");

    act(() =>
      bound.onClick({
        activePayload: [{ dataKey: "value", name: "Value", value: 8, payload: { original: true } }],
        activeLabel: "external-label",
        activeTooltipIndex: "1",
      }),
    );
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);

    const second = result.current.bind("other", { dataLength: 1 });
    const nextTouch = pointer("touch", 2);
    act(() => {
      second.onPointerDown(nextTouch);
      second.onPointerUp?.(nextTouch);
      result.current.dismiss();
      second.onClick({ activePayload: [], label: "stale", activeTooltipIndex: 0 });
    });
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
  });

  it("restores row indices from legacy tooltip labels and preserves payload snapshots", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const resolver = (index: number) => selection(index);
    const bound = result.current.bind("chart", {
      dataLength: 3,
      drawerEnabled: false,
      selectionPayloadAtIndex: resolver,
    });
    const event = pointer("mouse");
    act(() => {
      bound.onPointerDown(event);
      bound.onClick();
      (
        bound.tooltipProps.content as ReactElement<{
          onPayloadSnapshot?: (payload: never[], label?: string) => void;
        }>
      ).props.onPayloadSnapshot?.([], "label-2");
    });
    expect(result.current.bind("chart", { dataLength: 3 }).tooltipProps.defaultIndex).toBe(2);
  });

  it("closes a drawer on outside press, ignores stale epoch callbacks, and resolves its return focus target", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    openDrawer(result);
    const oldDrawer = result.current.drawer;
    const staleOpenChange = (
      oldDrawer.props as { onOpenChange: (open: boolean, details: { reason: string }) => void }
    ).onOpenChange;
    act(() =>
      document.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
      ),
    );
    act(() => staleOpenChange(false, { reason: "outside-press" }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);

    openDrawer(result);
    const currentDrawer = result.current.drawer;
    const content = (
      currentDrawer.props as { children: ReactElement<{ finalFocus: () => HTMLElement | null }> }
    ).children;
    const finalFocus = content.props.finalFocus;
    const focusTarget = document.createElement("div");
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const query = vi.spyOn(document, "querySelector").mockReturnValue(focusTarget);
    expect(finalFocus()).toBe(focusTarget);
    expect(query).toHaveBeenCalledWith('#chart [role="img"]');

    const staleEpochDrawer = result.current.drawer;
    act(() => result.current.invalidate());
    const staleCallback = (
      staleEpochDrawer.props as {
        onOpenChange: (open: boolean, details: { reason: string }) => void;
      }
    ).onOpenChange;
    act(() => staleCallback(true, { reason: "trigger-press" }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
  });

  it("uses mouse mode after touch selection, resets snapshots when the viewport changes, and handles drawer close reasons", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    openDrawer(result);
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth + 1 });
    act(() => window.dispatchEvent(new Event("resize")));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });

    openDrawer(result);
    const drawer = result.current.drawer;
    const openChange = (
      drawer.props as { onOpenChange: (open: boolean, details: { reason: string }) => void }
    ).onOpenChange;
    act(() => openChange(false, { reason: "escape-key" }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
    const completion = (drawer.props as { onOpenChangeComplete: (open: boolean) => void })
      .onOpenChangeComplete;
    act(() => completion(false));

    const bound = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: selection,
    });
    const mouse = pointer("mouse", 10);
    act(() => {
      bound.onPointerDown(mouse);
      bound.onPointerUp?.(mouse);
    });
    expect(result.current.bind("chart").tooltipProps.trigger).toBe("hover");
  });

  it("resolves missing rows, non-string labels, and non-numeric row values", () => {
    const resolve = createChartTooltipSelectionResolver(
      [{ label: 2024, value: "not-a-number" }],
      () => [{ key: "value" }],
    );
    expect(resolve(-1)).toBeNull();
    expect(resolve(0)).toEqual({
      label: undefined,
      payload: [
        {
          dataKey: "value",
          name: "value",
          value: null,
          color: undefined,
          payload: { label: 2024, value: "not-a-number" },
        },
      ],
    });
  });

  it("covers input-mode snapshot invalidation and unchanged viewport dimensions", () => {
    const { result, rerender } = renderHook(
      ({ isTouch }) => useChartTooltipController({ isTouch, suppressed: false }),
      { initialProps: { isTouch: true } },
    );
    openDrawer(result);
    act(() => window.dispatchEvent(new Event("resize")));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
    rerender({ isTouch: false });
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);

    rerender({ isTouch: true });
    openDrawer(result);
    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerType: "mouse",
        }),
      );
    });
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
  });

  it("ignores tooltip-origin gestures, chart-mismatched pending work, and pending chart clicks", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", { dataLength: 2 });
    const tooltip = document.createElement("div");
    tooltip.dataset.customTooltip = "true";
    act(() => bound.onPointerDown(pointer("mouse", 1, tooltip)));
    expect(result.current.bind("chart").tooltipProps.trigger).toBe("click");

    const touch = pointer("touch", 2);
    act(() => {
      bound.onPointerDown(touch);
      bound.onChartMouseMove({ activeTooltipIndex: 9 });
      bound.onPointerUp?.(touch);
      bound.onMouseMove(pointer("mouse", 3));
      bound.onClick({ activePayload: null });
    });
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);

    const chartAfterModeSwitch = result.current.bind("chart", { dataLength: 2 });
    act(() => chartAfterModeSwitch.onClick());
    expect(result.current.bind("chart").tooltipProps.active).toBe(false);
  });

  it("does not dismiss a legacy chart for pointer events originating inside tooltip markup", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", { dataLength: 1, drawerEnabled: false });
    act(() => {
      bound.onChartMouseMove({ activeTooltipIndex: 0 });
      bound.onClick();
    });
    const tooltip = document.createElement("div");
    tooltip.dataset.customTooltip = "true";
    document.body.appendChild(tooltip);
    try {
      const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "target", { value: tooltip });
      act(() => document.dispatchEvent(event));
      expect(result.current.bind("chart", { drawerEnabled: false }).tooltipProps.active).toBe(true);
    } finally {
      tooltip.remove();
    }
  });

  it("updates and clears the index captured by a matching touch gesture", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", {
      dataLength: 3,
      selectionPayloadAtIndex: selection,
    });
    const touch = pointer("touch", 4);
    act(() => {
      bound.onPointerDown(touch);
      bound.onChartMouseMove({ activeTooltipIndex: "2" });
      bound.onChartMouseMove({ activeTooltipIndex: 3 });
      bound.onChartMouseMove({ activeTooltipIndex: "bad" });
    });
    let outcome: string | undefined;
    act(() => {
      outcome = bound.onPointerUp?.(touch);
    });
    expect(outcome).toBe("awaiting-click");
    act(() => bound.onClick({ activeTooltipIndex: 1 }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("uses the zero-length fallback when Recharts reports a hover index", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart");
    const touch = pointer("touch", 41);
    let outcome: string | undefined;
    act(() => {
      bound.onPointerDown(touch);
      bound.onChartMouseMove({ activeTooltipIndex: 0 });
      outcome = bound.onPointerUp?.(touch);
    });
    expect(outcome).toBe("awaiting-click");
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
  });

  it("handles chart leave grace, pending touch payloads, and an expired leave grace", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: selection,
    });
    let now = 100;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const touch = pointer("touch", 5);
    act(() => {
      bound.onPointerDown(touch);
      bound.onChartMouseMove({ activeTooltipIndex: 0 });
      bound.onPointerUp?.(touch);
      bound.onPointerLeave(pointer("mouse", 5));
    });
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);

    act(() =>
      document.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }),
      ),
    );
    now += 3000;
    act(() => bound.onMouseLeave({ relatedTarget: null, clientX: 200, clientY: 200 } as never));
    act(() => result.current.dismiss());

    const awaiting = result.current.bind("awaiting", { dataLength: 2 });
    const next = pointer("touch", 6);
    act(() => {
      awaiting.onPointerDown(next);
      awaiting.onPointerUp?.(next);
      awaiting.onPointerLeave(pointer("touch", 6));
    });
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
  });

  it("covers short and expired synthetic mouseleave grace for an unmoved touch gesture", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", { dataLength: 1 });
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const touch = pointer("touch", 7);
    act(() => {
      bound.onPointerDown(touch);
      bound.onPointerLeave(pointer("touch", 7));
      bound.onMouseLeave({ relatedTarget: null, clientX: 200, clientY: 200 } as never);
    });
    expect(result.current.bind("chart").tooltipProps.active).toBeFalsy();
    now += 3000;
    act(() => bound.onMouseLeave({ relatedTarget: null, clientX: 200, clientY: 200 } as never));
  });

  it("clears Escape dismissal through keyboard selection and ignores unrelated keys", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const bound = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: selection,
    });
    act(() => bound.onClick());
    const otherKey = {
      key: "ArrowDown",
      preventDefault: vi.fn(),
      currentTarget: { getBoundingClientRect: () => new DOMRect(0, 0, 20, 20) },
    } as unknown as ReactKeyboardEvent<HTMLElement>;
    act(() => bound.onKeyDown?.(otherKey));
    expect(otherKey.preventDefault).not.toHaveBeenCalled();
    act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(result.current.bind("chart").tooltipProps.active).toBe(false);
    const enter = {
      key: "Enter",
      preventDefault: vi.fn(),
      currentTarget: { getBoundingClientRect: () => new DOMRect(0, 0, 20, 20) },
    } as unknown as ReactKeyboardEvent<HTMLElement>;
    const afterEscape = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: selection,
    });
    act(() => afterEscape.onKeyDown?.(enter));
    expect(enter.preventDefault).toHaveBeenCalled();
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("keeps null resolver keyboard selections pending until an unlabeled payload arrives", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: () => null,
    });
    const otherKey = {
      key: "Tab",
      preventDefault: vi.fn(),
      currentTarget: { getBoundingClientRect: () => new DOMRect(0, 0, 20, 20) },
    } as unknown as ReactKeyboardEvent<HTMLElement>;
    act(() => bound.onKeyDown?.(otherKey));
    expect(otherKey.preventDefault).not.toHaveBeenCalled();
    const enter = { ...otherKey, key: " " } as ReactKeyboardEvent<HTMLElement>;
    act(() => bound.onKeyDown?.(enter));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
    act(() => bound.onClick({ activePayload: [], activeTooltipIndex: 1 }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("keeps a fine-pointer keyboard selection pending when its chart click has no payload", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const bound = result.current.bind("chart", {
      dataLength: 2,
      selectionPayloadAtIndex: () => null,
    });
    const enter = {
      key: "Enter",
      preventDefault: vi.fn(),
      currentTarget: { getBoundingClientRect: () => new DOMRect(0, 0, 20, 20) },
    } as unknown as ReactKeyboardEvent<HTMLElement>;
    act(() => bound.onKeyDown?.(enter));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);

    act(() => bound.onClick());
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);

    act(() => bound.onClick({ activePayload: [], activeTooltipIndex: 1 }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("does not create a keyboard selection when the bound chart has no rows", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("empty", {
      dataLength: 0,
      selectionPayloadAtIndex: selection,
    });
    const enter = {
      key: "Enter",
      preventDefault: vi.fn(),
      currentTarget: { getBoundingClientRect: () => new DOMRect(0, 0, 20, 20) },
    } as unknown as ReactKeyboardEvent<HTMLElement>;
    act(() => bound.onKeyDown?.(enter));
    expect(enter.preventDefault).toHaveBeenCalled();
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
  });

  it("commits an indexed pending payload when Recharts omits its tooltip index", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", { dataLength: 2 });
    const touch = pointer("touch", 31);
    act(() => {
      bound.onPointerDown(touch);
      bound.onPointerUp?.(touch);
    });
    act(() =>
      bound.onClick({
        activePayload: [{ dataKey: "value", name: "Value", value: 4, payload: { value: 4 } }],
        activeLabel: "payload-label",
        activeTooltipIndex: "not-an-index",
      }),
    );
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("does not resolve an out-of-range pending click index", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const resolve = vi.fn(selection);
    const bound = result.current.bind("chart", { dataLength: 2, selectionPayloadAtIndex: resolve });
    const touch = pointer("touch", 32);
    act(() => {
      bound.onPointerDown(touch);
      bound.onPointerUp?.(touch);
      bound.onClick({ activeTooltipIndex: 2 });
    });
    expect(resolve).not.toHaveBeenCalled();
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
    act(() => bound.onClick({ activeTooltipIndex: 1 }));
    expect(resolve).toHaveBeenCalledWith(1);
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("uses the zero-length fallback for a pending Recharts click index", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart");
    const touch = pointer("touch", 42);
    act(() => {
      bound.onPointerDown(touch);
      bound.onPointerUp?.(touch);
    });
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
    // No chart hover index was published; the click index is valid but the bind omitted dataLength.
    act(() => bound.onClick({ activeTooltipIndex: 0 }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(false);
    act(() => bound.onClick({ activePayload: [], activeTooltipIndex: 0 }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("consumes an incoming tooltip snapshot and takes the consumed branch of its callback", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", { dataLength: 1 });
    const touch = pointer("touch", 33);
    act(() => {
      bound.onPointerDown(touch);
      bound.onChartMouseMove({ activeTooltipIndex: 0 });
      bound.onPointerUp?.(touch);
    });
    const snapshot = bound.tooltipProps.content as ReactElement<{
      onPayloadSnapshot?: (payload: never[], label?: string) => void;
    }>;
    act(() => snapshot.props.onPayloadSnapshot?.([], "snapshot-label"));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });

  it("uses the legacy drawer-disabled payload callback path on touch input", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("legacy-touch", {
      dataLength: 2,
      drawerEnabled: false,
      selectionPayloadAtIndex: selection,
    });
    act(() => {
      bound.onClick();
      (
        bound.tooltipProps.content as ReactElement<{
          onPayloadSnapshot?: (payload: never[], label?: string) => void;
        }>
      ).props.onPayloadSnapshot?.([], "label-1");
    });
    expect(result.current.bind("legacy-touch", { dataLength: 2 }).tooltipProps.defaultIndex).toBe(
      1,
    );
  });

  it("dismisses drawer-enabled inline content without setting the legacy dismissal guard", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", { dataLength: 1 });
    const content = bound.tooltipProps.content as ReactElement<{ onDismiss?: () => void }>;
    act(() => content.props.onDismiss?.());
    const legacyMode = result.current.bind("chart", { dataLength: 1, drawerEnabled: false });
    expect(
      (legacyMode.tooltipProps.content as ReactElement<{ suppressInline?: boolean }>).props
        .suppressInline,
    ).toBe(false);
  });

  it("exercises legacy payload index fallback and no-chart return focus", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: false, suppressed: false }),
    );
    const initialDrawer = result.current.drawer;
    const content = (
      initialDrawer.props as { children: ReactElement<{ finalFocus: () => HTMLElement | null }> }
    ).children;
    expect(content.props.finalFocus()).toBeNull();
    const bound = result.current.bind("chart", {
      selectionPayloadAtIndex: selection,
      drawerEnabled: false,
    });
    act(() => {
      bound.onClick();
      (
        bound.tooltipProps.content as ReactElement<{
          onPayloadSnapshot?: (payload: never[], label?: string) => void;
        }>
      ).props.onPayloadSnapshot?.([], "label-2");
      (
        bound.tooltipProps.content as ReactElement<{
          onPayloadSnapshot?: (payload: never[], label?: string) => void;
        }>
      ).props.onPayloadSnapshot?.([], "missing-label");
    });
    expect(result.current.bind("chart").tooltipProps.defaultIndex).toBeUndefined();

    const indexed = result.current.bind("chart", {
      dataLength: 3,
      drawerEnabled: false,
      selectionPayloadAtIndex: selection,
    });
    act(() => {
      indexed.onClick();
      (
        indexed.tooltipProps.content as ReactElement<{
          onPayloadSnapshot?: (payload: never[], label?: string) => void;
        }>
      ).props.onPayloadSnapshot?.([], "label-2");
      (
        indexed.tooltipProps.content as ReactElement<{
          onPayloadSnapshot?: (payload: never[], label?: string) => void;
        }>
      ).props.onPayloadSnapshot?.([], "label-2");
    });
    expect(result.current.bind("chart", { dataLength: 3 }).tooltipProps.defaultIndex).toBe(2);
  });

  it("rejects a legacy touch release when no chart index is available", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    const bound = result.current.bind("chart", { dataLength: 1, drawerEnabled: false });
    const touch = pointer("touch", 21);
    let outcome: string | undefined;
    act(() => {
      bound.onPointerDown(touch);
      outcome = bound.onPointerUp?.(touch);
    });
    expect(outcome).toBe("rejected-no-selection");
  });

  it("preserves an open drawer for guarded outside presses and exercises open callbacks", () => {
    const { result } = renderHook(() =>
      useChartTooltipController({ isTouch: true, suppressed: false }),
    );
    openDrawer(result);
    const drawer = result.current.drawer;
    const openChange = (
      drawer.props as { onOpenChange: (open: boolean, details: { reason: string }) => void }
    ).onOpenChange;
    act(() => openChange(true, { reason: "trigger-press" }));
    act(() => openChange(false, { reason: "outside-press" }));
    expect((result.current.drawer.props as { open: boolean }).open).toBe(true);
  });
});
