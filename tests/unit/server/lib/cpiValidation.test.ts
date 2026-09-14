import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import { validateCpiFiles, type CpiPair } from "../../../../server/lib/data-loader/cpiValidation";

vi.mock("node:fs", () => ({ existsSync: vi.fn(), readFileSync: vi.fn() }));

const pair: CpiPair = {
  baseYear: 2020,
  pair: "2020",
  mainPath: "index.csv",
  contributionPath: "contribution.csv",
};

describe("cpiValidation", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a validated CPI pair for valid contribution and index files", () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((file: string) =>
      file === "contribution.csv"
        ? "類・品目,総合,食料\nウエイト,10000,2000"
        : "年月,総合,食料\n2004年1月,100,200",
    );

    expect(validateCpiFiles(pair)).toEqual({
      weights: { 総合: 10000, 食料: 2000 },
      data: [{ 年月: "2004年1月", 総合: 100, 食料: 200 }],
    });
  });

  it.each([
    [
      "missing 年月",
      "類・品目,総合\nウエイト,10000",
      "総合\n100",
      "missing required index header: 年月",
    ],
    [
      "missing 総合",
      "類・品目,総合\nウエイト,10000",
      "年月,別系列\n2004年1月,100",
      "missing required index headers: 総合",
    ],
    [
      "missing content",
      "類・品目,総合\nウエイト,10000",
      "年月,総合\n2003年1月,100",
      "index contains no valid 年月 rows",
    ],
    [
      "duplicate contribution headers",
      "類・品目,総合,総合\nウエイト,100,100",
      "年月,総合\n2004年1月,100",
      "duplicate contribution headers",
    ],
    [
      "NaN weight",
      "類・品目,総合\nウエイト,NaN",
      "年月,総合\n2004年1月,100",
      "missing or invalid weights: 総合",
    ],
  ])("rejects %s", (_name, contribution, index, expected) => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((file: string) =>
      file === "contribution.csv" ? contribution : index,
    );
    expect(validateCpiFiles(pair)).toBe(expected);
  });
});
