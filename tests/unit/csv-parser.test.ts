import { describe, expect, it } from "vitest";
import { parseCsv } from "../helpers/csv-download-parser";

describe("parseCsv", () => {
  it("rejects malformed CSV records", () => {
    const malformedCsv = [
      "a,b\na,b\n",
      "a,b\r\na,b",
      'a,b\r\n"unterminated,b\r\n',
      'a,b\r\n"bad"x,c\r\n',
      "a,b\r\na\r\n",
      "a,b\r\na,b\r\n\r\n",
    ];

    for (const csv of malformedCsv) {
      expect(() => parseCsv(csv)).toThrow();
    }
  });

  it("strips a leading UTF-8 BOM before parsing", () => {
    expect(parseCsv("\uFEFFa,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
