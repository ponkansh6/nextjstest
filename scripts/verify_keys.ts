import { loadCtiData } from "@server/lib/dataLoader";

async function check() {
  const ctiData = await loadCtiData();
  if (ctiData.length === 0) {
    console.log("No data");
    return;
  }
  const row = ctiData[0];
  const keys = Object.keys(row);
  console.log("Data keys found:", keys);
  console.log("Includes '民間最終消費支出':", keys.includes("民間最終消費支出"));
}
check();
