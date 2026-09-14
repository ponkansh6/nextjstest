import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUrlState } from "../../src/hooks/useUrlState";

// Mock next/navigation useSearchParams
vi.mock("next/navigation", () => ({
  useSearchParams: () => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    return {
      get: (key: string) => params.get(key),
    };
  },
}));

describe("useUrlState current URL state contract", () => {
  it("restores the current from/to/hidden/adv URL contract as one state", () => {
    window.history.replaceState({}, "", "/?from=2012&to=2024&hidden=食料,,住居&adv=1");

    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current).toMatchObject({
      from: 2012,
      to: 2024,
      hiddenKeys: ["食料", "住居"],
      adv: true,
    });
  });

  it("uses the existing defaults when from/to/hidden/adv are omitted", () => {
    window.history.replaceState({}, "", "/");

    const { result } = renderHook(() => useUrlState(2005, 2026));

    expect(result.current).toMatchObject({
      from: 2005,
      to: 2026,
      hiddenKeys: [],
      adv: false,
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
    expect(result.current.adv).toBe(false);

    window.history.replaceState({}, "", "/?from=1900&to=9999");
    const outOfRange = renderHook(() => useUrlState(2005, 2026));

    expect(outOfRange.result.current.from).toBe(1900);
    expect(outOfRange.result.current.to).toBe(9999);
  });

  it("writes the current from/to/hidden/adv URL contract together", () => {
    window.history.replaceState({}, "", "/?keep=1");
    const { result } = renderHook(() => useUrlState(2005, 2026));

    result.current.updateUrl(2012, 2024, ["食料", "住居"], true);

    expect(window.location.search).toBe(
      "?keep=1&from=2012&to=2024&hidden=%E9%A3%9F%E6%96%99%2C%E4%BD%8F%E5%B1%85&adv=1",
    );
  });

  it("retains existing query parameters while synchronizing with replaceState", () => {
    window.history.replaceState({}, "", "/dashboard?keep=1");
    const { result } = renderHook(() => useUrlState(2005, 2026));
    const replaceState = vi.spyOn(window.history, "replaceState");

    result.current.updateUrl(2012, 2024, [], false);

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
      adv: true,
    });
  });

  it("reads adv=1 as true", () => {
    window.history.replaceState({}, "", "/?adv=1");
    const { result } = renderHook(() => useUrlState(2005, 2026));
    expect(result.current.adv).toBe(true);
  });

  it("reads missing adv as false", () => {
    window.history.replaceState({}, "", "/");
    const { result } = renderHook(() => useUrlState(2005, 2026));
    expect(result.current.adv).toBe(false);
  });

  it("updates url with adv=1 when updateUrl is called with true", () => {
    window.history.replaceState({}, "", "/");
    const { result } = renderHook(() => useUrlState(2005, 2026));
    result.current.updateUrl(2005, 2026, [], true);
    expect(window.location.search).toContain("adv=1");
  });

  it("removes adv from url when updateUrl is called with false", () => {
    window.history.replaceState({}, "", "/?adv=1");
    const { result } = renderHook(() => useUrlState(2005, 2026));
    result.current.updateUrl(2005, 2026, [], false);
    expect(window.location.search).not.toContain("adv");
  });
});
