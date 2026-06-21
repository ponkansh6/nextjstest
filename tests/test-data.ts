import { loadTotalEarningData } from "@server/lib/dataLoader";

(async () => {
  try {
    const data = await loadTotalEarningData();
    if (data.length > 0) {
      const firstEntry = data[0];
      const lastEntry = data[data.length - 1];

      console.log("First entry keys:", Object.keys(firstEntry));
      console.log("\nFirst entry:", JSON.stringify(firstEntry, null, 2));
      console.log("\nLast entry values:");
      console.log(
        JSON.stringify(
          {
            "15歳以上国民一人当たり給与": lastEntry["15歳以上国民一人当たり給与"],
            年月: lastEntry.年月,
            所定内給与: lastEntry.所定内給与,
            所定外給与: lastEntry.所定外給与,
            時間当たり給与: lastEntry["時間当たり給与"],
            特別給与: lastEntry.特別給与,
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error("Error:", error);
  }
})();
