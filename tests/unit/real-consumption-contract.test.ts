import { describe, expect, it } from "vitest";
import { loadQuarterlyPublicData } from "../../server/lib/view-models/quarterlyProjection";
import { SUPPORT_SERIES_KEY_REAL } from "../../src/lib/chartConstants";

describe("real consumption data contract", () => {
  it("keeps real support values positive from 2005 through 2016", async () => {
    const { real } = await loadQuarterlyPublicData();
    const rows = real.filter((row) => row.年 >= 2005 && row.年 <= 2016);

    expect(rows).toHaveLength(48);
    expect(
      rows.every((row) => Number(row[SUPPORT_SERIES_KEY_REAL]) > 0),
      `${SUPPORT_SERIES_KEY_REAL} should be positive for every quarter from 2005 through 2016`,
    ).toBe(true);
  });
});
