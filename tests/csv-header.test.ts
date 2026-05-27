import { expect, it, describe } from "vitest";
import fs from "fs";
import path from "path";
import { nominalKeys, realKeys } from "../src/lib/chartConstants";

describe("CSV Header Integrity", () => {
  it("should match all keys defined in nominalKeys and realKeys with CSV header", () => {
    const csvPath = path.resolve(__dirname, "../public/cti_data.csv");
    const content = fs.readFileSync(csvPath, "utf-8");
    const headerLine = content.split("\n")[2]; // 3行目がヘッダー
    const headers = headerLine.split(",").map((h) => h.trim());

    // 検証: nominalKeys の各キーがヘッダーに存在すること
    nominalKeys.forEach((key) => {
      expect(headers, `Key '${key}' not found in CSV headers`).toContain(key);
    });

    // 検証: realKeys の各キーがヘッダーに存在すること
    realKeys.forEach((key) => {
      expect(headers, `Key '${key}' not found in CSV headers`).toContain(key);
    });
  });
});
