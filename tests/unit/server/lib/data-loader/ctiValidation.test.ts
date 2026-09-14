import { describe, expect, it } from "vitest";
import {
  isContinuousMonths,
  selectCtiPair,
  validateCtiMetadata,
  validateCtiLegacySupport,
  validateCtiLegacySupportPair,
} from "../../../../../server/lib/data-loader/ctiValidation";

describe("CTI validation boundary", () => {
  it("rejects a discontinuous candidate before selection", () => {
    expect(isContinuousMonths(["2025年1月", "2025年3月"])).toBe(false);
    expect(isContinuousMonths(["2025年1月", "2025年2月"])).toBe(true);
  });

  it("supports explicit 2020 rollback selection and fail-closed metadata", () => {
    const selected = selectCtiPair({ source: "rollback-2020" });
    expect(selected).toMatchObject({ pair: { baseYear: 2020, pair: "2020" } });
    expect(validateCtiMetadata("/path/that/does/not/exist", "candidate.csv")).toBe(
      "missing metadata",
    );
  });

  it("rejects malformed, non-finite, and incomplete rollback support", () => {
    const header = "時間軸（四半期）,別系列,民間最終消費支出";
    const valid = [
      '"統計名：","四半期別ＧＤＰ速報"',
      header,
      '2020年1～3月期,999,"1,000"',
      '2020年4～6月期,999,"1,001"',
      '2020年7～9月期,999,"1,002"',
    ].join("\n");
    const parsed = validateCtiLegacySupport(valid);
    expect(parsed).toBeInstanceOf(Map);
    expect(parsed).toEqual(
      new Map([
        ["2020年1～3月期", 1000],
        ["2020年4～6月期", 1001],
        ["2020年7～9月期", 1002],
      ]),
    );
    expect(validateCtiLegacySupport(valid.replace('"1,000"', '"NaN"'))).toBe(
      "invalid CTI support value",
    );
    expect(validateCtiLegacySupport(valid.replace('2020年4～6月期,999,"1,001"', ""))).toBe(
      "CTI support periods are not continuous",
    );
    const realWithDifferentPeriods = valid
      .replace('2020年1～3月期,999,"1,000"', '2020年4～6月期,999,"1,000"')
      .replace('2020年4～6月期,999,"1,001"', '2020年7～9月期,999,"1,001"')
      .replace('2020年7～9月期,999,"1,002"', '2020年10～12月期,999,"1,002"');
    expect(validateCtiLegacySupportPair(valid, realWithDifferentPeriods)).toBe(
      "CTI nominal/real support period set mismatch",
    );
  });
});
