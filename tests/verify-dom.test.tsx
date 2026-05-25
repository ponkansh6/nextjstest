/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";

it("verifies dom environment", () => {
  expect(typeof window).toBe("object");
  expect(document).toBeDefined();
});
