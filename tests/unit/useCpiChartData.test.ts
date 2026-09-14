import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCpiChartData } from "../../src/hooks/useCpiChartData";

describe("useCpiChartData hidden quarter contract", () => {
  it("starts with no hidden quarters and toggles the same quarter on and off", () => {
    const { result } = renderHook(() => useCpiChartData());

    expect(result.current.hiddenQuarters).toEqual([]);

    act(() => result.current.toggleQuarter(2));
    expect(result.current.hiddenQuarters).toEqual([2]);

    act(() => result.current.toggleQuarter(2));
    expect(result.current.hiddenQuarters).toEqual([]);
  });

  it("keeps distinct quarter selections while preserving insertion order", () => {
    const { result } = renderHook(() => useCpiChartData());

    act(() => {
      result.current.toggleQuarter(4);
      result.current.toggleQuarter(1);
    });

    expect(result.current.hiddenQuarters).toEqual([4, 1]);
  });
});
