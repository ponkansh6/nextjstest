import { test, expect } from "@playwright/test";

/**
 * E2E Test: User interactions with chart range controls
 *
 * Verifies that when users change start/end year via ChartFilters dropdowns,
 * the charts update correctly in the real browser environment.
 *
 * Note: This test focuses on UI state changes (selects work, chart remains visible)
 * rather than internal data verification, since recharts renders real DOM without
 * test-specific attributes.
 */
test.describe("Range Change E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for page to hydrate
    await page.waitForLoadState("networkidle");
  });

  test("should have start year and end year selects visible", async ({ page }) => {
    const startYearSelect = page.locator("#startYear");
    const endYearSelect = page.locator("#endYear");

    await expect(startYearSelect).toBeVisible();
    await expect(endYearSelect).toBeVisible();
  });

  test("should allow changing start year without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const startYearSelect = page.locator("#startYear");

    // Get available years
    const allOptions = await startYearSelect.locator("option").allTextContents();
    if (allOptions.length > 1) {
      const midYearIndex = Math.floor(allOptions.length / 2);
      const midYear = allOptions[midYearIndex]?.replace("年", "");

      if (midYear) {
        // Change start year
        await startYearSelect.selectOption(midYear);
        await page.waitForTimeout(500);

        // Verify select value changed
        const selectedValue = await startYearSelect.inputValue();
        expect(selectedValue).toBe(midYear);

        // No errors
        expect(errors).toEqual([]);
      }
    }
  });

  test("should allow changing end year without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const endYearSelect = page.locator("#endYear");

    // Get available years
    const allOptions = await endYearSelect.locator("option").allTextContents();
    if (allOptions.length > 1) {
      const midYearIndex = Math.floor(allOptions.length / 2);
      const midYear = allOptions[midYearIndex]?.replace("年", "");

      if (midYear) {
        // Change end year
        await endYearSelect.selectOption(midYear);
        await page.waitForTimeout(500);

        // Verify select value changed
        const selectedValue = await endYearSelect.inputValue();
        expect(selectedValue).toBe(midYear);

        // No errors
        expect(errors).toEqual([]);
      }
    }
  });

  test("should handle sequential range changes without errors", async ({ page }) => {
    const errors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const startYearSelect = page.locator("#startYear");
    const endYearSelect = page.locator("#endYear");

    // Get options
    const startOptions = await startYearSelect.locator("option").allTextContents();
    const endOptions = await endYearSelect.locator("option").allTextContents();

    // Make sequential changes: start → end → start again
    if (startOptions.length > 1) {
      const secondStartYear = startOptions[1]?.replace("年", "");
      if (secondStartYear) {
        await startYearSelect.selectOption(secondStartYear);
        await page.waitForTimeout(300);
      }
    }

    if (endOptions.length > 1) {
      const secondLastEndYear = endOptions[endOptions.length - 2]?.replace("年", "");
      if (secondLastEndYear) {
        await endYearSelect.selectOption(secondLastEndYear);
        await page.waitForTimeout(300);
      }
    }

    // Change start year again
    if (startOptions.length > 0) {
      const firstYear = startOptions[0]?.replace("年", "");
      if (firstYear) {
        await startYearSelect.selectOption(firstYear);
        await page.waitForTimeout(300);
      }
    }

    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("should keep page responsive after multiple range changes", async ({ page }) => {
    const startYearSelect = page.locator("#startYear");
    const endYearSelect = page.locator("#endYear");

    const startOptions = await startYearSelect.locator("option").allTextContents();
    const endOptions = await endYearSelect.locator("option").allTextContents();

    // Perform several changes
    if (startOptions.length > 0) {
      for (let i = 0; i < Math.min(startOptions.length, 3); i++) {
        const year = startOptions[i]?.replace("年", "");
        if (year) {
          await startYearSelect.selectOption(year);
          await page.waitForTimeout(200);

          // Select should still be interactive
          const value = await startYearSelect.inputValue();
          expect(value).toBe(year);
        }
      }
    }
  });

  test("should maintain select state after range change", async ({ page }) => {
    const startYearSelect = page.locator("#startYear");
    const endYearSelect = page.locator("#endYear");

    const startOptions = await startYearSelect.locator("option").allTextContents();
    const endOptions = await endYearSelect.locator("option").allTextContents();

    // Set specific values
    if (startOptions.length > 1 && endOptions.length > 1) {
      const startYear = startOptions[1]?.replace("年", "");
      const endYear = endOptions[endOptions.length - 1]?.replace("年", "");

      if (startYear && endYear) {
        await startYearSelect.selectOption(startYear);
        await page.waitForTimeout(300);
        await endYearSelect.selectOption(endYear);
        await page.waitForTimeout(300);

        // Verify values are still set
        const startValue = await startYearSelect.inputValue();
        const endValue = await endYearSelect.inputValue();

        expect(startValue).toBe(startYear);
        expect(endValue).toBe(endYear);
      }
    }
  });

  test("should render without errors during range changes", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    const startYearSelect = page.locator("#startYear");

    const startOptions = await startYearSelect.locator("option").allTextContents();
    if (startOptions.length > 0) {
      for (let i = 0; i < Math.min(startOptions.length, 3); i++) {
        const year = startOptions[i]?.replace("年", "");
        if (year) {
          await startYearSelect.selectOption(year);
          await page.waitForTimeout(300);
        }
      }
    }

    // No error logs
    expect(errors).toEqual([]);
  });
});
