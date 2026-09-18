import { describe, expect, it } from "vitest";
import { parseYearMonth, toCanonicalYearMonth } from "../../src/lib/yearMonth";

describe("toCanonicalYearMonth", () => {
  it.each([
    ["2025年1月", "2025-01"],
    ["2025年01月", "2025-01"],
    ["2025-01", "2025-01"],
    ["2025/1", "2025-01"],
    ["2025/01", "2025-01"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(toCanonicalYearMonth(input)).toBe(expected);
    expect(parseYearMonth(input)).toEqual({ year: 2025, month: 1 });
  });

  it("rejects invalid or non-month keys without guessing", () => {
    expect(toCanonicalYearMonth("2025年13月")).toBeNull();
    expect(toCanonicalYearMonth("2025Q1")).toBeNull();
  });
});
