import { loadTotalEarningData } from "../src/lib/cpiData";

it("check smoothed components transition", async () => {
  const data = await loadTotalEarningData();
  const d200412 = data.find(d => d.年月 === "2004年12月");
  const d200501 = data.find(d => d.年月 === "2005年1月");

  console.log("2004-12 Raw Components (for verification):", {
    所定内: d200412!["所定内給与"],
    所定外: d200412!["所定外給与"],
    特別: d200412!["特別給与"]
  });
  console.log("2005-01 Raw Components (for verification):", {
    所定内: d200501!["所定内給与"],
    所定外: d200501!["所定外給与"],
    特別: d200501!["特別給与"]
  });
});
