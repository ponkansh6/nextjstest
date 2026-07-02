import { describe, it, expect, vi } from "vitest";
import "../../utils/api-setup";
import { GET } from "../../../src/app/api/cti/route";
import * as dataLoader from "../../../server/lib/dataLoader";

describe("API /api/cti", () => {
  it("should return data on success", async () => {
    const mockData = [{ 年月: "2020年1月", 消費支出: 100 }];
    vi.spyOn(dataLoader, "loadCtiData").mockResolvedValue(mockData as any);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(mockData);
  });

  it("should return 500 on error", async () => {
    vi.spyOn(dataLoader, "loadCtiData").mockRejectedValue(new Error("Loader error"));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to load CTI data");
  });
});
