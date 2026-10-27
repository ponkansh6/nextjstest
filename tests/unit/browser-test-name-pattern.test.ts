import { describe, expect, it } from "vitest";
import { makeTestNamePattern } from "../../scripts/browser-test-name-pattern.mjs";

describe("browser test name patterns", () => {
  it("matches the leaf title of a hierarchical Vitest catalog entry", () => {
    const pattern = new RegExp(makeTestNamePattern(["outer suite > inner suite > selected test"]));

    expect(pattern.test("outer suite > inner suite > selected test (chromium)")).toBe(true);
    expect(pattern.test("other test")).toBe(false);
  });

  it("escapes regex characters in selected titles", () => {
    const chromium = new RegExp(makeTestNamePattern(["suite > test [A+B]"]));

    expect(chromium.test("outer suite > test [A+B] in browser")).toBe(true);
    expect(chromium.test("outer suite > test A+B in browser")).toBe(false);
  });
});
