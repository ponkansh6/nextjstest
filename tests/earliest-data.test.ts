import { loadTotalEarningData } from "../src/lib/cpiData";

describe("earliest data consistency", () => {
  it("verifies wage and residual values at the start of the series are valid", async () => {
    const rawData = await loadTotalEarningData();
    const data = rawData.filter(d => parseInt(d.年月.split("年")[0]) >= 2005);
    expect(data.length).toBeGreaterThan(0);

    const firstMonth = data[0];
    
    const scheduled = (firstMonth["所定内給与"] as number) || 0;
    const overtime = (firstMonth["所定外給与"] as number) || 0;
    const special = (firstMonth["特別給与"] as number) || 0;

    // Check ranges based on historical data distribution
    expect(scheduled).toBeGreaterThan(70);
    expect(scheduled).toBeLessThan(100);
    expect(overtime).toBeGreaterThan(5);
    expect(overtime).toBeLessThan(15);
    expect(special).toBeGreaterThan(10);
    expect(special).toBeLessThan(30);
    
    expect(firstMonth.年月).toBeDefined();
    expect(firstMonth.年月.startsWith("2005")).toBe(true);
  });

  it("verifies wage and residual values at the end of the series are valid", async () => {
    const rawData = await loadTotalEarningData();
    const data = rawData.filter(d => parseInt(d.年月.split("年")[0]) >= 2005);
    expect(data.length).toBeGreaterThan(0);

    const lastMonth = data[data.length - 1];
    
    const scheduled = (lastMonth["所定内給与"] as number) || 0;
    const overtime = (lastMonth["所定外給与"] as number) || 0;
    const special = (lastMonth["特別給与"] as number) || 0;

    expect(scheduled).toBeGreaterThan(70);
    expect(scheduled).toBeLessThan(100);
    expect(overtime).toBeGreaterThan(5);
    expect(overtime).toBeLessThan(15);
    expect(special).toBeGreaterThan(10);
    expect(special).toBeLessThan(30);
    
    expect(lastMonth.年月).toBeDefined();
  });
});
