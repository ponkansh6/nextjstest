import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
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

  it("keeps the current parse behavior for invalid and out-of-range values", () => {
    window.history.replaceState(
      {},
      "",
      "/?from=not-a-number&to=2024tail&hidden=%2C%E9%A3%9F%E6%96%99%2C&adv=0",
    );

    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current.from).toBeNaN();
    expect(result.current.to).toBe(2024);
    expect(result.current.hiddenKeys).toEqual(["食料"]);

    window.history.replaceState({}, "", "/?from=1900&to=9999");
    const outOfRange = renderHook(() => useUrlState(2005, 2026));

    expect(outOfRange.result.current.from).toBe(1900);
    expect(outOfRange.result.current.to).toBe(9999);
  });

  it("writes from/to/hidden and removes deprecated adv while preserving other params", () => {
    window.history.replaceState({}, "", "/?keep=1");
    const { result } = renderHook(() => useUrlState(2005, 2026));

    result.current.updateUrl(2012, 2024, ["食料", "住居"]);

    expect(window.location.search).toBe(
      "?keep=1&from=2012&to=2024&hidden=%E9%A3%9F%E6%96%99%2C%E4%BD%8F%E5%B1%85",
    );
  });

  it("retains existing query parameters while synchronizing with replaceState", () => {
    window.history.replaceState({}, "", "/dashboard?keep=1&adv=1");
    const { result } = renderHook(() => useUrlState(2005, 2026));
    const replaceState = vi.spyOn(window.history, "replaceState");

    result.current.updateUrl(2012, 2024, []);

    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("?keep=1&from=2012&to=2024");
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0]?.[2]).toBe("?keep=1&from=2012&to=2024");
    replaceState.mockRestore();
  });

  it("keeps the initial URL snapshot after a popstate event", () => {
    window.history.replaceState({}, "", "/?from=2012&to=2024&adv=1");
    const { result } = renderHook(() => useUrlState(2005, 2026));

    window.history.pushState({}, "", "/?from=1990&to=9999&adv=0");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(result.current).toMatchObject({
      from: 2012,
      to: 2024,
    });
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
