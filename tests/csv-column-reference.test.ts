import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("CSV Column Reference Validation", () => {
  it("should verify critical columns exist in total_earning.csv", () => {
    const csvPath = path.join(__dirname, "../public/total_earning.csv");
    const content = fs.readFileSync(csvPath, "utf-8");
    const header = content.split("\n")[0];
    
    // 必要なカラムの定義例
    const requiredColumns = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
    
    requiredColumns.forEach(col => {
      expect(header.includes(col), `Column "${col}" missing in total_earning.csv`).toBe(true);
    });
  });
});
