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

describe("useUrlState adv parameter", () => {
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
