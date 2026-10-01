import { describe, expect, it } from "vitest";
import { loadQuarterlyPublicData } from "../../server/lib/view-models/quarterlyProjection";
import { CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY } from "../../src/lib/chartConstants";

describe("real consumption data contract", () => {
  it("derives a real CTI total from nominal CTI and CPI from 2005 through 2016", async () => {
    const { real } = await loadQuarterlyPublicData();
    const rows = real.filter((row) => row.年 >= 2005 && row.年 <= 2016);

    expect(rows).toHaveLength(48);
    expect(
      rows.every((row) => Number(row[CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY]) > 0),
      `${CTI_NOMINAL_DERIVED_REAL_TOTAL_KEY} should be positive for every quarter from 2005 through 2016`,
    ).toBe(true);
    expect(rows.every((row) => !("民間最終消費支出（実質）" in row))).toBe(true);
  });
});
