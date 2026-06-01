import { describe, it, expect, vi } from "vitest";
import { GET } from "../../../src/app/api/earnings/route";
import * as dataLoader from "../../../server/lib/dataLoader";

vi.mock("../../../server/lib/dataLoader");

describe("API /api/earnings", () => {
  it("should return data on success", async () => {
    const mockData = [{ 年月: "2020年1月", 所定内給与: 100 }];
    vi.spyOn(dataLoader, "loadTotalEarningData").mockResolvedValue(mockData as any);
    
    const response = await GET();
    const json = await response.json();
    
    expect(response.status).toBe(200);
    expect(json).toEqual(mockData);
  });

  it("should return 500 on error", async () => {
    vi.spyOn(dataLoader, "loadTotalEarningData").mockRejectedValue(new Error("Loader error"));
    
    const response = await GET();
    const json = await response.json();
    
    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to load earnings data");
  });
});
