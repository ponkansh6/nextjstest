import { expect, it, describe } from "vitest";
import fs from "fs";
import path from "path";
import { nominalKeys, realKeys } from "../src/lib/chartConstants";

describe("CSV Header Integrity", () => {
  it("should match all keys defined in nominalKeys and realKeys with CSV header", () => {
    const csvPath = path.resolve(__dirname, "../public/cti_data.csv");
    const content = fs.readFileSync(csvPath, "utf-8");
    const headerLine = content.split("\n")[2];
    const headers = headerLine.split(",").map((h) => h.trim());

    nominalKeys.forEach((key) => {
      expect(headers, `Key '${key}' not found in CSV headers`).toContain(key);
    });

    realKeys.forEach((key) => {
      // CSVにはこれらのキーがないため、除外して検証
      expect(headers, `Key '${key}' not found in CSV headers`).toContain(key);
    });
  });
});
