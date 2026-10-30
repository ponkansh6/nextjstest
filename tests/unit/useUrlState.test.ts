import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useUrlState } from "../../src/hooks/useUrlState";

const mockSearchParams = vi.hoisted(() => vi.fn());

// Mock next/navigation useSearchParams
vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    const mockedParams = mockSearchParams();
    if (mockedParams) return mockedParams;

    const search = window.location.search;
    const params = new URLSearchParams(search);
    return {
      get: (key: string) => params.get(key),
      has: (key: string) => params.has(key),
    };
  },
}));

describe("useUrlState current URL state contract", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockSearchParams.mockReset();
    window.history.replaceState({}, "", "/");
  });

  it("reads from/to/hidden while ignoring legacy adv links", () => {
    window.history.replaceState({}, "", "/?from=2012&to=2024&hidden=食料,,住居&adv=1");

    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current).toMatchObject({
      from: 2012,
      to: 2024,
      hiddenKeys: ["食料", "住居"],
    });
  });

  it("uses the existing defaults when from/to/hidden are omitted", () => {
    window.history.replaceState({}, "", "/");

    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current).toMatchObject({
      from: 2005,
      to: 2026,
      hiddenKeys: [],
    });
  });

  it("defaults malformed ranges and rejects numeric prefixes", () => {
    window.history.replaceState(
      {},
      "",
      "/?from=not-a-number&to=2024tail&hidden=%2C%E9%A3%9F%E6%96%99%2C&adv=0",
    );

    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current.from).toBe(2005);
    expect(result.current.to).toBe(2026);
    expect(result.current.hiddenKeys).toEqual(["食料"]);

    window.history.replaceState({}, "", "/?from=1900&to=9999");
    const outOfRange = renderHook(() => useUrlState(2005, 2026));

    expect(outOfRange.result.current.from).toBe(2005);
    expect(outOfRange.result.current.to).toBe(2026);
  });

  it("defaults the full range for digit-only years outside the safe integer range", () => {
    window.history.replaceState({}, "", "/?from=9007199254740992&to=2024");

    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current.from).toBe(2005);
    expect(result.current.to).toBe(2026);
  });

  it("clamps valid out-of-range years and defaults reversed ranges", () => {
    window.history.replaceState({}, "", "/?from=1900&to=2024");
    const clampedStart = renderHook(() => useUrlState(2005, 2026));
    expect(clampedStart.result.current).toMatchObject({ from: 2005, to: 2024 });

    window.history.replaceState({}, "", "/?from=2024&to=9999");
    const clampedEnd = renderHook(() => useUrlState(2005, 2026));
    expect(clampedEnd.result.current).toMatchObject({ from: 2024, to: 2026 });

    window.history.replaceState({}, "", "/?from=2025&to=2010");
    const reversed = renderHook(() => useUrlState(2005, 2026));
    expect(reversed.result.current).toMatchObject({ from: 2005, to: 2026 });
  });

  it("uses the finite defaults when the available data range is empty", () => {
    window.history.replaceState({}, "", "/?from=1900&to=9999");
    const { result } = renderHook(() => useUrlState(2025, 2025));
    expect(result.current).toMatchObject({ from: 2025, to: 2025 });
  });

  it("writes from/to/hidden and removes deprecated adv while preserving other params", () => {
    window.history.replaceState({}, "", "/?keep=1&section=prices");
    const { result } = renderHook(() => useUrlState(2005, 2026, ["prices", "wages"]));

    result.current.updateUrl(2012, 2024, ["食料", "住居"]);

    expect(window.location.search).toBe(
      "?keep=1&section=prices&from=2012&to=2024&hidden=%E9%A3%9F%E6%96%99%2C%E4%BD%8F%E5%B1%85",
    );
  });

  it("retains existing query parameters while synchronizing with replaceState", () => {
    window.history.replaceState({}, "", "/dashboard?keep=1&section=prices&adv=1");
    const { result } = renderHook(() => useUrlState(2005, 2026, ["prices", "wages"]));
    const replaceState = vi.spyOn(window.history, "replaceState");

    result.current.updateUrl(2012, 2024, []);

    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("?keep=1&section=prices&from=2012&to=2024");
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0]?.[2]).toBe(
      "/dashboard?keep=1&section=prices&from=2012&to=2024",
    );
    replaceState.mockRestore();
  });

  it("restores filters and section from the URL snapshot on popstate without writing history", () => {
    window.history.replaceState(
      {},
      "",
      "/dashboard?from=2012&to=2024&hidden=%E9%A3%9F%E6%96%99&keep=1&section=prices",
    );
    const { result } = renderHook(() => useUrlState(2005, 2026, ["prices", "wages"]));
    expect(result.current).toMatchObject({
      from: 2012,
      to: 2024,
      hiddenKeys: ["食料"],
      section: "prices",
    });

    const replaceState = vi.spyOn(window.history, "replaceState");
    window.history.pushState(
      {},
      "",
      "/dashboard?from=2010&to=2021&hidden=%E4%BD%8F%E5%B1%85&keep=2&section=wages",
    );
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(result.current).toMatchObject({
      from: 2010,
      to: 2021,
      hiddenKeys: ["住居"],
      section: "wages",
    });
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe(
      "?from=2010&to=2021&hidden=%E4%BD%8F%E5%B1%85&keep=2&section=wages",
    );
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("keeps the popstate snapshot while Next still exposes a stale query", () => {
    window.history.replaceState({}, "", "/dashboard?from=2012&to=2024");
    const { result } = renderHook(() => useUrlState(2005, 2026));
    mockSearchParams.mockReturnValue({
      toString: () => "from=2000&to=2001",
      get: (key: string) => (key === "from" ? "2000" : key === "to" ? "2001" : null),
      has: () => false,
    });

    act(() => {
      window.history.pushState({}, "", "/dashboard?from=2010&to=2021");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current).toMatchObject({ from: 2010, to: 2021 });
    expect(window.location.search).toBe("?from=2010&to=2021");
  });

  it("retires a popstate snapshot after the pathname changes before React reads it", () => {
    window.history.replaceState({}, "", "/before?from=2012&to=2024");
    const { result } = renderHook(() => useUrlState(2005, 2026));

    act(() => {
      window.history.pushState({}, "", "/restored?from=2010&to=2021");
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.history.replaceState({}, "", "/after?from=2015&to=2020");
    });

    expect(result.current).toMatchObject({ from: 2015, to: 2020 });
    expect(window.location.pathname).toBe("/after");
  });

  it("canonicalizes an invalid section on initial load and preserves the rest of the URL", () => {
    window.history.replaceState(
      { marker: "keep" },
      "",
      "/dashboard?from=2012&keep=1&section=unknown#chart",
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useUrlState(2005, 2026, ["prices", "wages"]));

    expect(result.current.section).toBe("prices");
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("?from=2012&keep=1");
    expect(window.location.hash).toBe("#chart");
    expect(window.history.state).toEqual({ marker: "keep" });
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0]?.[2]).toBe("/dashboard?from=2012&keep=1#chart");
  });

  it("removes an invalid section when no section ids are configured", () => {
    window.history.replaceState({ marker: "keep" }, "", "/empty?section=unknown#chart");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current.section).toBe("");
    expect(window.location.pathname).toBe("/empty");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#chart");
    expect(window.history.state).toEqual({ marker: "keep" });
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("uses empty browser snapshots during server rendering when search params are opaque", async () => {
    mockSearchParams.mockReturnValue({
      toString: () => "[object Object]",
      get: () => null,
      has: () => false,
    });
    vi.resetModules();
    vi.stubGlobal("window", undefined);
    try {
      const [{ createElement: createSsrElement }, { renderToString: renderSsrToString }, module] =
        await Promise.all([
          import("react"),
          import("react-dom/server"),
          import("../../src/hooks/useUrlState"),
        ]);
      const markup = renderSsrToString(
        createSsrElement(() => {
          const state = module.useUrlState(2005, 2026, ["prices"]);
          return createSsrElement("output", null, `${state.from}/${state.to}/${state.section}`);
        }),
      );

      expect(markup).toContain("2005/2026/prices");
    } finally {
      vi.unstubAllGlobals();
      mockSearchParams.mockReset();
    }
  });

  it("falls back on-screen for an invalid section restored by popstate without rewriting the URL", () => {
    window.history.replaceState({}, "", "/dashboard?keep=1&section=prices");
    const { result } = renderHook(() => useUrlState(2005, 2026, ["prices", "wages"]));
    const replaceState = vi.spyOn(window.history, "replaceState");

    window.history.pushState({}, "", "/dashboard?keep=2&section=unknown#chart");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(result.current.section).toBe("prices");
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("?keep=2&section=unknown");
    expect(window.location.hash).toBe("#chart");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("does not canonicalize the initial section when popstate arrives before initial effects finish", () => {
    const sectionIds = ["prices", "wages"] as const;
    window.history.replaceState({}, "", "/dashboard?keep=1&section=unknown#chart");

    const nativeAddEventListener = window.addEventListener.bind(window);
    let dispatchedPopState = false;
    const addEventListener = vi.spyOn(window, "addEventListener");
    addEventListener.mockImplementation((type, listener, options) => {
      nativeAddEventListener(type, listener, options);
      if (type !== "popstate" || dispatchedPopState) return;

      dispatchedPopState = true;
      window.history.pushState({}, "", "/dashboard?keep=2&section=wages#chart");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const replaceState = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => useUrlState(2005, 2026, sectionIds));

    expect(dispatchedPopState).toBe(true);
    expect(result.current.section).toBe("wages");
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("?keep=2&section=wages");
    expect(window.location.hash).toBe("#chart");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("removes a legacy adv param on URL synchronization", () => {
    window.history.replaceState({}, "", "/?adv=1");
    const { result } = renderHook(() => useUrlState(2005, 2026));
    result.current.updateUrl(2005, 2026, []);
    expect(window.location.search).not.toContain("adv");
  });

  it("normalizes legacy adv on initial load without changing shared state", () => {
    window.history.replaceState(
      { marker: "keep" },
      "",
      "/dashboard?from=2012&to=2024&hidden=食料&keep=1&adv=1#chart",
    );
    const replaceState = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current).toMatchObject({
      from: 2012,
      to: 2024,
      hiddenKeys: ["食料"],
    });
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("?from=2012&to=2024&hidden=%E9%A3%9F%E6%96%99&keep=1");
    expect(window.location.hash).toBe("#chart");
    expect(window.history.state).toEqual({ marker: "keep" });
    expect(replaceState).toHaveBeenCalledTimes(1);
    replaceState.mockRestore();
  });

  it("does not rewrite the current history entry when legacy adv is absent", () => {
    window.history.replaceState({ marker: "keep" }, "", "/dashboard?from=2012&keep=1#chart");
    const replaceState = vi.spyOn(window.history, "replaceState");

    renderHook(() => useUrlState(2005, 2026));

    expect(window.location.search).toBe("?from=2012&keep=1");
    expect(window.location.hash).toBe("#chart");
    expect(window.history.state).toEqual({ marker: "keep" });
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it("does not rewrite when Next still reports legacy adv but the current URL no longer has it", () => {
    window.history.replaceState({ marker: "keep" }, "", "/dashboard?from=2012&keep=1#chart");
    mockSearchParams.mockReturnValue({
      toString: () => "adv=1",
      get: (key: string) => (key === "from" ? "2012" : null),
      has: (key: string) => key === "adv",
    });
    const replaceState = vi.spyOn(window.history, "replaceState");

    renderHook(() => useUrlState(2005, 2026));

    expect(window.location.search).toBe("?from=2012&keep=1");
    expect(window.location.hash).toBe("#chart");
    expect(window.history.state).toEqual({ marker: "keep" });
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
    mockSearchParams.mockReset();
  });
});
