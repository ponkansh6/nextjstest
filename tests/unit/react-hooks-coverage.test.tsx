import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCagrState } from "../../src/hooks/useCagrState";
import { useChartTheme } from "../../src/hooks/useChartTheme";
import { useFocusTrap } from "../../src/hooks/useFocusTrap";
import { useSectionNavigation } from "../../src/hooks/useSectionNavigation";
import { useToggleSet } from "../../src/hooks/useToggleSet";
import { MOBILE_BREAKPOINT_PX } from "../../src/lib/breakpoints";
import type { CpiData } from "../../src/types";

const cpiRows: CpiData[] = [
  {
    年月: "2020年1月",
    総合: 100,
    生鮮食品を除く総合: 100,
    持家の帰属家賃を除く総合: 100,
    "消費支出（参考）": null,
    "CPI総合(参考)": 100,
    住居: 100,
  },
  {
    年月: "2025年1月",
    総合: 110,
    生鮮食品を除く総合: 110,
    持家の帰属家賃を除く総合: 110,
    "消費支出（参考）": null,
    "CPI総合(参考)": 110,
    住居: 110,
  },
];
const noHiddenKeys: string[] = [];
const cagrStackedKeys = ["住居"];

describe("React hook coverage", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("useCagrState initializes period, calculates, reports invalid periods, and clears stale results", () => {
    const { result } = renderHook(() =>
      useCagrState({
        initialStartYear: 2020,
        initialEndYear: 2025,
        chartData: cpiRows,
        stackedHiddenKeys: noHiddenKeys,
        stackedKeys: cagrStackedKeys,
      }),
    );
    expect(result.current).toMatchObject({
      cagrStartYear: 2020,
      cagrEndYear: 2025,
      cagrMonth: 1,
      cagrResult: null,
      cagrError: null,
    });

    act(() => result.current.calculateCAGR());
    expect(result.current.cagrResult).toBeCloseTo(0.019244876, 7);
    act(() => result.current.setCagrMonth(2));
    expect(result.current.cagrResult).toBeNull();
    act(() => result.current.calculateCAGR());
    expect(result.current.cagrError).toContain("開始年月のデータが見つかりません: 2020年02月");

    act(() => {
      result.current.setCagrMonth(1);
      result.current.setCagrStartYear(2020);
      result.current.setCagrEndYear(2020);
    });
    act(() => result.current.calculateCAGR());
    expect(result.current.cagrError).toContain("同じ年は指定できません");
  });

  it("useCagrState uses initial years for NaN and distinguishes missing end data", () => {
    const { result } = renderHook(() =>
      useCagrState({
        initialStartYear: 2020,
        initialEndYear: 2025,
        chartData: cpiRows,
        stackedHiddenKeys: noHiddenKeys,
        stackedKeys: cagrStackedKeys,
      }),
    );
    act(() => {
      result.current.setCagrStartYear(Number.NaN);
      result.current.setCagrEndYear(2030);
    });
    act(() => result.current.calculateCAGR());
    expect(result.current.cagrError).toContain("終了年月のデータが見つかりません: 2030年01月");
  });

  it("useCagrState uses the configured initial end year when the selected end year is NaN", () => {
    const { result } = renderHook(() =>
      useCagrState({
        initialStartYear: 2020,
        initialEndYear: 2025,
        chartData: cpiRows,
        stackedHiddenKeys: noHiddenKeys,
        stackedKeys: cagrStackedKeys,
      }),
    );
    act(() => result.current.setCagrEndYear(Number.NaN));
    act(() => result.current.calculateCAGR());
    expect(result.current.cagrError).toBeNull();
    expect(result.current.cagrResult).toBeCloseTo(0.019244876, 7);
  });

  it("useToggleSet supports add/remove and functional replacement", () => {
    const { result } = renderHook(() => useToggleSet<string>(["a"]));
    const [, toggle, setHidden] = result.current;
    act(() => toggle("b"));
    expect(result.current[0]).toEqual(["a", "b"]);
    act(() => toggle("a"));
    expect(result.current[0]).toEqual(["b"]);
    act(() => setHidden((previous) => [...previous, "c"]));
    expect(result.current[0]).toEqual(["b", "c"]);
  });

  it("useChartTheme reads media query snapshots and removes both subscriptions", () => {
    const subscriptions = new Map<string, Set<EventListener>>();
    const mobileQuery = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
    const matches = new Map<string, boolean>([
      [mobileQuery, false],
      ["(pointer: coarse)", false],
    ]);
    const matchMedia = vi.fn(
      (query: string) =>
        ({
          get matches() {
            return matches.get(query) ?? false;
          },
          media: query,
          onchange: null,
          addEventListener: (_type: string, callback: EventListener) => {
            const listeners = subscriptions.get(query) ?? new Set<EventListener>();
            listeners.add(callback);
            subscriptions.set(query, listeners);
          },
          removeEventListener: (_type: string, callback: EventListener) =>
            subscriptions.get(query)?.delete(callback),
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => true,
        }) as MediaQueryList,
    );
    vi.stubGlobal("matchMedia", matchMedia);
    const { result, unmount } = renderHook(() => useChartTheme());
    expect(result.current).toMatchObject({ isMobile: false, isTouch: false });
    matches.set(mobileQuery, true);
    act(() => subscriptions.get(mobileQuery)?.forEach((listener) => listener(new Event("change"))));
    expect(result.current.isMobile).toBe(true);
    matches.set("(pointer: coarse)", true);
    act(() =>
      subscriptions.get("(pointer: coarse)")?.forEach((listener) => listener(new Event("change"))),
    );
    expect(result.current.isTouch).toBe(true);
    unmount();
    expect([...subscriptions.values()].every((listeners) => listeners.size === 0)).toBe(true);
  });

  it("useChartTheme uses false server snapshots without reading browser media queries", () => {
    const serverSnapshot = renderToString(
      createElement(() => {
        const theme = useChartTheme();
        return createElement("output", null, `${theme.isMobile}/${theme.isTouch}`);
      }),
    );
    expect(serverSnapshot).toContain("false/false");
  });

  it("useFocusTrap focuses first and last elements, ignores non-Tab keys, and restores the requested target", () => {
    const restore = document.createElement("button");
    document.body.append(restore);
    const container = document.createElement("div");
    container.id = "trap";
    container.innerHTML = '<button id="first">First</button><button id="last">Last</button>';
    document.body.append(container);
    const openTrap = renderHook(
      ({ open }: { open: boolean }) => {
        const ref = { current: document.getElementById("trap") as HTMLElement | null };
        useFocusTrap(ref, open, { current: restore });
      },
      { initialProps: { open: true } },
    );
    const first = container.querySelector("#first") as HTMLButtonElement;
    const last = container.querySelector("#last") as HTMLButtonElement;
    expect(document.activeElement).toBe(first);
    const other = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    document.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    const backwards = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    first.focus();
    document.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    const backwardsWithinBounds = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(backwardsWithinBounds);
    expect(backwardsWithinBounds.defaultPrevented).toBe(false);
    first.focus();
    const withinBounds = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(withinBounds);
    expect(withinBounds.defaultPrevented).toBe(false);
    const forwards = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.focus();
    document.dispatchEvent(forwards);
    expect(forwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    openTrap.rerender({ open: false });
    expect(document.activeElement).toBe(restore);
    openTrap.rerender({ open: true });
    expect(document.activeElement).toBe(first);
    openTrap.rerender({ open: false });
    expect(document.activeElement).toBe(restore);
    openTrap.unmount();
    container.remove();
    restore.remove();
  });

  it("useFocusTrap handles empty and absent containers and excludes tabindex=-1 from cycling", () => {
    const { rerender, unmount } = renderHook(
      ({ enabled, ref }: { enabled: boolean; ref: React.RefObject<HTMLElement | null> }) =>
        useFocusTrap(ref, enabled),
      {
        initialProps: {
          enabled: false,
          ref: { current: null } as React.RefObject<HTMLElement | null>,
        },
      },
    );
    rerender({ enabled: true, ref: { current: null } });
    const container = document.createElement("div");
    container.tabIndex = -1;
    container.innerHTML = '<div tabindex="-1">ignored</div>';
    document.body.append(container);
    rerender({ enabled: true, ref: { current: container } });
    expect(document.activeElement).toBe(container);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    unmount();
    container.remove();
  });

  it("useFocusTrap safely closes when the document has no active element to restore", () => {
    vi.spyOn(document, "activeElement", "get").mockReturnValue(null);
    const container = document.createElement("div");
    const focusContainer = vi.spyOn(container, "focus");
    document.body.append(container);
    const { rerender, unmount } = renderHook(
      ({ open }: { open: boolean }) => {
        useFocusTrap({ current: container }, open);
      },
      { initialProps: { open: true } },
    );

    rerender({ open: false });
    expect(focusContainer).toHaveBeenCalledTimes(1);
    unmount();
    container.remove();
  });

  it("useSectionNavigation follows scroll position, selects lazy sections, and clears suppression on scrollend", () => {
    vi.useFakeTimers();
    const sections = [{ id: "first" }, { id: "second" }, { id: "missing" }] as const;
    const first = document.createElement("section");
    const second = document.createElement("section");
    first.id = "first";
    second.id = "second";
    Object.defineProperties(first, { offsetTop: { value: 0 }, offsetHeight: { value: 300 } });
    Object.defineProperties(second, { offsetTop: { value: 300 }, offsetHeight: { value: 500 } });
    document.body.append(first, second);
    vi.stubGlobal("scrollY", 300);
    vi.stubGlobal("innerHeight", 100);
    const rafs: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafs.push(callback);
      return rafs.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(first, "scrollIntoView").mockImplementation(() => undefined);
    vi.spyOn(second, "scrollIntoView").mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useSectionNavigation({ sections }));
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(result.current.activeId).toBe("second");
    act(() => result.current.handleSelectSection("missing"));
    expect(result.current.activeId).toBe("missing");
    expect(result.current.isProgrammaticScroll).toBe(false);

    const lazy = document.createElement("section");
    lazy.dataset.lazySection = "lazy";
    let lazyTop = 10;
    const lazyIntoView = vi.spyOn(lazy, "scrollIntoView").mockImplementation(() => undefined);
    vi.spyOn(lazy, "getBoundingClientRect").mockImplementation(() => ({ top: lazyTop }) as DOMRect);
    document.body.append(lazy);
    act(() => result.current.handleSelectSection("lazy"));
    expect(result.current.isProgrammaticScroll).toBe(true);
    expect(lazyIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });

    // The chase waits while a lazy section is temporarily detached.
    lazy.remove();
    const missingFrame = rafs.shift();
    if (missingFrame) act(() => missingFrame(0));
    document.body.append(lazy);

    // Moving targets are re-scrolled when far away; movement within two pixels is tolerated.
    lazyTop = 5;
    const changedFrame = rafs.shift();
    if (changedFrame) act(() => changedFrame(16));
    expect(lazyIntoView).toHaveBeenLastCalledWith({ behavior: "auto", block: "start" });
    lazyTop = 2;
    const nearFrame = rafs.shift();
    if (nearFrame) act(() => nearFrame(32));
    expect(lazyIntoView).toHaveBeenCalledTimes(2);

    act(() => window.dispatchEvent(new Event("scroll")));
    expect(result.current.activeId).toBe("lazy");

    // Keep the target stationary until the stability threshold ends the chase.
    for (let frame = 0; frame < 30; frame++) {
      const callback = rafs.shift();
      if (callback) act(() => callback(48 + 16 * frame));
    }
    act(() => window.dispatchEvent(new Event("scrollend")));
    act(() => vi.advanceTimersByTime(150));
    expect(result.current.isProgrammaticScroll).toBe(false);
    vi.stubGlobal("scrollY", 1_000);
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(result.current.activeId).toBe("lazy");
    unmount();
    first.remove();
    second.remove();
    lazy.remove();
  });

  it("useSectionNavigation tolerates empty sections and cancels scheduled animation frames on unmount", () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const rafs: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafs.push(callback);
      return rafs.length + 10;
    });
    const target = document.createElement("section");
    target.id = "jump";
    vi.spyOn(target, "scrollIntoView").mockImplementation(() => undefined);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 50 } as DOMRect);
    document.body.append(target);
    const { result, unmount } = renderHook(() => useSectionNavigation({ sections: [] }));
    expect(result.current.activeId).toBe("");
    act(() => result.current.handleSelectSection("jump"));
    expect(result.current.isProgrammaticScroll).toBe(true);
    unmount();
    expect(cancel).toHaveBeenCalledWith(11);
    target.remove();
  });

  it("useSectionNavigation ends a moving-target chase at its maximum frame count", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const target = document.createElement("section");
    target.id = "temporary";
    const scrollIntoView = vi.spyOn(target, "scrollIntoView").mockImplementation(() => undefined);
    let movingTop = 0;
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(
      () => ({ top: movingTop }) as DOMRect,
    );
    document.body.append(target);
    const { result, unmount } = renderHook(() =>
      useSectionNavigation({ sections: [{ id: "temporary" }] }),
    );
    act(() => result.current.handleSelectSection("temporary"));

    for (let frameNumber = 0; frameNumber < 181; frameNumber++) {
      movingTop += 5;
      const frame = frames.shift();
      if (frame) act(() => frame(frameNumber * 16));
    }

    expect(frames).toHaveLength(0);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    act(() => vi.advanceTimersByTime(150));
    expect(result.current.isProgrammaticScroll).toBe(false);
    unmount();
  });
});
