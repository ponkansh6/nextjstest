(async () => {
  const { loadTotalEarningData } = await import("./src/lib/cpiData.js");

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
            年月: lastEntry.年月,
            所定内給与: lastEntry.所定内給与,
            所定外給与: lastEntry.所定外給与,
            特別給与: lastEntry.特別給与,
            調整済み特別給与: lastEntry["調整済み特別給与"],
            調整済み時間当たり給与: lastEntry["調整済み時間当たり給与"],
            調整済み一人当たり給与: lastEntry["調整済み一人当たり給与"],
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
