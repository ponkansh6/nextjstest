import { loadTotalEarningData } from "../../../../server/lib/dataLoader";

export async function GET() {
  try {
    const earningsData = await loadTotalEarningData();
    return Response.json(earningsData);
  } catch (error) {
    console.error("Error reading or parsing CSV:", error);
    return Response.json({ error: "Failed to load earnings data" }, { status: 500 });
  }
}
