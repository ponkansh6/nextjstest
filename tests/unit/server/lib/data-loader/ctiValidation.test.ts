import { describe, expect, it } from "vitest";
import { buildCtiFilePaths } from "../../../../../server/lib/dataIo";
import {
  isContinuousMonths,
  selectCtiPair,
  validateCtiMetadata,
  validateCtiLegacySupport,
  validateCtiLegacySupportPair,
  validateCtiPair,
  mapCtiReasonToCode,
} from "../../../../../server/lib/data-loader/ctiValidation";

describe("CTI validation boundary", () => {
  it("rejects a discontinuous candidate before selection", () => {
    expect(isContinuousMonths(["2025年1月", "2025年3月"])).toBe(false);
    expect(isContinuousMonths(["2025年1月", "2025年2月"])).toBe(true);
  });

  it("supports automatic 2025 selection and fail-closed metadata", () => {
    const selected = selectCtiPair({ source: "auto" });
    expect(selected).toMatchObject({ pair: { baseYear: 2025, pair: "2025" } });
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

  it("accepts matching 2025 nominal and real support periods", () => {
    const support = (first: number, second: number) =>
      [
        '"統計名：","四半期別ＧＤＰ速報"',
        "時間軸（四半期）,別系列,民間最終消費支出",
        `2025年1～3月期,999,"${first}"`,
        `2025年4～6月期,999,"${second}"`,
      ].join("\n");

    expect(validateCtiLegacySupportPair(support(100, 101), support(98, 99))).toEqual({
      nominal: new Map([
        ["2025年1～3月期", 100],
        ["2025年4～6月期", 101],
      ]),
      real: new Map([
        ["2025年1～3月期", 98],
        ["2025年4～6月期", 99],
      ]),
    });
  });

  it("validateCtiPair accepts the valid 2025 candidate with matching nominal and real support sets", () => {
    const paths = buildCtiFilePaths();
    const pair = {
      baseYear: 2025 as const,
      pair: "2025" as const,
      mainPath: paths.candidateMain,
      supportNominalPath: paths.quarterlySupportNominal,
      supportRealPath: paths.quarterlySupportReal,
    };
    const supportPair = validateCtiLegacySupportPair(
      [
        '"統計名：","四半期別ＧＤＰ速報"',
        "時間軸（四半期）,別系列,民間最終消費支出",
        '2025年1～3月期,999,"100"',
        '2025年4～6月期,999,"101"',
      ].join("\n"),
      [
        '"統計名：","四半期別ＧＤＰ速報"',
        "時間軸（四半期）,別系列,民間最終消費支出",
        '2025年1～3月期,999,"98"',
        '2025年4～6月期,999,"99"',
      ].join("\n"),
    );

    expect(supportPair).toMatchObject({
      nominal: new Map([
        ["2025年1～3月期", 100],
        ["2025年4～6月期", 101],
      ]),
      real: new Map([
        ["2025年1～3月期", 98],
        ["2025年4～6月期", 99],
      ]),
    });
    expect(validateCtiPair(pair, paths)).toEqual(pair);
  });

  it.each([
    ["missing metadata", "cti_source_missing"],
    ["missing required CTI set file", "cti_source_missing"],
    ["missing CTI 年月 header", "cti_source_missing"],
    ["metadata is not ready for 2025", "cti_metadata_invalid"],
    ["metadata file pairing mismatch", "cti_metadata_invalid"],
    ["invalid metadata", "cti_metadata_invalid"],
    ["invalid 2025 series map headers", "cti_metadata_invalid"],
    ["invalid 2025 official snapshot headers", "cti_metadata_invalid"],
    ["2025 CTI metadata basis fields are missing", "cti_metadata_invalid"],
    ["metadata SHA-256 is missing or invalid", "cti_hash_mismatch"],
    ["metadata SHA-256 mismatch", "cti_hash_mismatch"],
    ["invalid or duplicate CTI support period", "cti_schema_invalid"],
    ["invalid CTI support value", "cti_schema_invalid"],
    ["CTI nominal/real support period set mismatch", "cti_schema_invalid"],
    ["missing required CTI total headers", "cti_schema_invalid"],
    ["invalid CTI required numeric value", "cti_schema_invalid"],
    ["invalid or duplicate 2025 series map rows", "cti_schema_invalid"],
    ["invalid or duplicate 2025 official snapshot rows", "cti_schema_invalid"],
    ["2025 series map and official snapshot code set mismatch", "cti_schema_invalid"],
    ["CTI support periods are not continuous", "cti_period_invalid"],
    ["invalid or discontinuous CTI 年月", "cti_period_invalid"],
    ["invalid or duplicate CTI 年月", "cti_period_invalid"],
    ["2025 CTI metadata period mismatch", "cti_period_invalid"],
    ["incomplete 2025 CTI calendar year", "cti_period_invalid"],
    ["missing CTI support period or series header", "cti_required_support_unavailable"],
    ["CTI support contains no values", "cti_required_support_unavailable"],
    ["missing official quarterly source workbook", "cti_required_support_unavailable"],
    ["unrecognized validation reason", "cti_fail_closed"],
  ] as const)("maps %s to %s", (validation, code) => {
    expect(mapCtiReasonToCode(validation)).toBe(code);
  });
});
