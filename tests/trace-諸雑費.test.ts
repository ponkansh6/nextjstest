import { describe, it } from "vitest";
import { loadCpiData } from "../src/lib/cpiData";

describe("CPI 諸雑費 Trace", () => {
  it("should log load and rendering values for 諸雑費", async () => {
    const rawData = await loadCpiData();
    const sample = rawData[rawData.length - 1];
    
    console.log(`--- CPI 諸雑費 VALUE TRACE ---`);
    console.log("Load Value (諸雑費):", sample["諸雑費"]);
    console.log("Rendering Value (諸雑費):", sample["諸雑費"]);
  });
});
