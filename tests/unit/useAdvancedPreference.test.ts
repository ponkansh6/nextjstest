import { renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdvancedPreference } from "../../src/hooks/useAdvancedPreference";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useAdvancedPreference storage contract", () => {
  it("does not read localStorage on mount and preserves the React state", () => {
    window.localStorage.setItem("newGraphShowAdvanced", "1");
    const getItem = vi.spyOn(window.localStorage, "getItem");

    const { result } = renderHook(() => {
      const [showAdvanced] = useState(false);
      useAdvancedPreference(showAdvanced, 2000, 2024, []);
      return showAdvanced;
    });

    expect(getItem).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
    expect(window.localStorage.getItem("newGraphShowAdvanced")).toBe("0");
  });

  it("keeps the React adv=1 state when storage already contains 0 and leaves the URL unchanged", () => {
    window.localStorage.setItem("newGraphShowAdvanced", "0");
    window.history.replaceState({}, "", "/dashboard?adv=1&keep=1");
    const replaceState = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => {
      const [showAdvanced] = useState(true);
      useAdvancedPreference(showAdvanced, 2000, 2024, []);
      return showAdvanced;
    });

    expect(result.current).toBe(true);
    expect(window.location.search).toBe("?adv=1&keep=1");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("does not restore newGraphShowAdvanced after an unmount and remount", () => {
    window.localStorage.setItem("newGraphShowAdvanced", "1");

    const mounted = renderHook(() => {
      const [showAdvanced] = useState(false);
      useAdvancedPreference(showAdvanced, 2000, 2024, []);
      return showAdvanced;
    });
    mounted.unmount();

    const remounted = renderHook(() => {
      const [showAdvanced] = useState(false);
      useAdvancedPreference(showAdvanced, 2000, 2024, []);
      return showAdvanced;
    });

    expect(remounted.result.current).toBe(false);
    expect(window.localStorage.getItem("newGraphShowAdvanced")).toBe("0");
  });

  it.each([
    { showAdvanced: true, storedValue: "1" },
    { showAdvanced: false, storedValue: "0" },
  ])("persists showAdvanced=$showAdvanced as $storedValue", ({ showAdvanced, storedValue }) => {
    renderHook(() => useAdvancedPreference(showAdvanced, 2000, 2024, []));

    expect(window.localStorage.getItem("newGraphShowAdvanced")).toBe(storedValue);
  });

  it("reruns the persistence effect when the range or hidden keys change", async () => {
    const setItem = vi.spyOn(window.localStorage, "setItem");
    const { rerender } = renderHook(
      ({ startYear, endYear, hiddenKeys }) =>
        useAdvancedPreference(true, startYear, endYear, hiddenKeys),
      {
        initialProps: {
          startYear: 2000,
          endYear: 2024,
          hiddenKeys: [] as string[],
        },
      },
    );

    await waitFor(() => {
      expect(setItem).toHaveBeenCalledTimes(1);
    });
    setItem.mockClear();

    rerender({ startYear: 2001, endYear: 2024, hiddenKeys: [] });
    await waitFor(() => {
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(setItem).toHaveBeenCalledWith("newGraphShowAdvanced", "1");
    });
    setItem.mockClear();

    rerender({ startYear: 2001, endYear: 2025, hiddenKeys: [] });
    await waitFor(() => {
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(setItem).toHaveBeenCalledWith("newGraphShowAdvanced", "1");
    });
    setItem.mockClear();

    rerender({ startYear: 2001, endYear: 2025, hiddenKeys: ["food"] });
    await waitFor(() => {
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(setItem).toHaveBeenCalledWith("newGraphShowAdvanced", "1");
    });
  });

  it("only changes newGraphShowAdvanced and does not change the URL", () => {
    window.localStorage.clear();
    window.localStorage.setItem("unrelated", "keep");
    window.history.replaceState({}, "", "/dashboard?keep=1");
    const setItem = vi.spyOn(window.localStorage, "setItem");

    renderHook(() => useAdvancedPreference(false, 2000, 2024, []));

    expect(window.localStorage.getItem("unrelated")).toBe("keep");
    expect(window.localStorage.getItem("newGraphShowAdvanced")).toBe("0");
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith("newGraphShowAdvanced", "0");
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("?keep=1");
  });

  it("swallows localStorage setItem errors from the advanced save effect", async () => {
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => {
      renderHook(() => useAdvancedPreference(true, 2000, 2024, []));
    }).not.toThrow();

    await waitFor(() => {
      expect(setItem).toHaveBeenCalledTimes(1);
    });
  });
});
