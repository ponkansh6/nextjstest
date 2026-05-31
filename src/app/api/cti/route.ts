import { loadCtiData } from "../../../../server/lib/dataLoader";

export async function GET() {
  try {
    const ctiData = await loadCtiData();
    return Response.json(ctiData);
  } catch (error) {
    console.error("Error reading or parsing CSV:", error);
    return Response.json({ error: "Failed to load CTI data" }, { status: 500 });
  }
}
