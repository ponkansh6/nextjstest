import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { nominalKeys } from "../src/lib/chartConstants";

describe("CSV Header to Constant Integrity", () => {
  it("should verify that all nominalKeys exist in cti_data.csv", () => {
    const csvPath = path.join(__dirname, "../public/cti_data.csv");
    const content = fs.readFileSync(csvPath, "utf-8");
    const header = content.split("\n")[2]; // cti_data.csv のヘッダーは3行目
    
    nominalKeys.forEach(key => {
      // (名目)を取り除いた名称がヘッダーにあるか確認
      const cleanKey = key.replace("（名目）", "");
      expect(header.includes(cleanKey), `Column "${key}" (as "${cleanKey}") missing in cti_data.csv`).toBe(true);
    });
  });
});
