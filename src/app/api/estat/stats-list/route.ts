import { getStatsList } from "@server/lib/estat";
import { errorResponse, queryFromRequest } from "../_shared";

export async function GET(request: Request) {
  try {
    return Response.json(await getStatsList(queryFromRequest(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
