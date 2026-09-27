import { useState } from "react";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ChartFilters } from "../../src/app/components/ChartFilters";
import { renderBrowserComponent } from "./renderBrowserComponent";

function MaxRangeFixture() {
  const [startYear, setStartYear] = useState(2015);
  const [endYear, setEndYear] = useState(2020);

  return (
    <ChartFilters
      allYears={[2005, 2010, 2015, 2020, 2025]}
      startYear={startYear}
      endYear={endYear}
      setStartYear={setStartYear}
      setEndYear={setEndYear}
    />
  );
}

describe("ChartFilters maximum range in Chromium", () => {
  it("P45 max range values", async () => {
    renderBrowserComponent(<MaxRangeFixture />);

    // Button visibility is additive here; the production-route P42-477 assertion remains in E2E.
    const maxButton = page.getByRole("button", { name: "最大期間" });
    await expect.element(maxButton).toBeVisible();
    await userEvent.click(await maxButton.element());

    const startYear = (await page.getByLabelText("開始年:").element()) as HTMLSelectElement;
    const endYear = (await page.getByLabelText("終了年:").element()) as HTMLSelectElement;
    expect(startYear.value).toBe("2005");
    expect(endYear.value).toBe("2025");
  });
});
