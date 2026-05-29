import { loadCpiData } from "../../../../server/lib/dataLoader";

export async function GET() {
  try {
    const cleanData = await loadCpiData();
    return Response.json(cleanData);
  } catch (error) {
    console.error("Error reading or parsing CSV:", error);
    return Response.json({ error: "Failed to load CPI data" }, { status: 500 });
  }
}
