import { EStatError, type EStatQuery } from "@server/lib/estat";
import { NextResponse } from "next/server";

export function queryFromRequest(request: Request): EStatQuery {
  const query: EStatQuery = {};
  const url = new URL(request.url);

  if (
    (url.pathname.endsWith("/meta") || url.pathname.endsWith("/data")) &&
    !url.searchParams.get("statsDataId")?.trim() &&
    !url.searchParams.get("dataSetId")?.trim()
  ) {
    throw new EStatError("Either statsDataId or dataSetId is required.", 400);
  }

  for (const [key, value] of url.searchParams) {
    if (key !== "appId") query[key] = value;
  }

  if (url.pathname.endsWith("/stats-list")) {
    for (const key of ["limit", "startPosition"]) {
      const value = query[key];
      if (value !== undefined && (!/^\d+$/.test(String(value)) || Number(value) < 1)) {
        throw new EStatError(`${key} must be a positive integer.`, 400);
      }
    }
  }

  return query;
}

export function errorResponse(error: unknown) {
  if (error instanceof EStatError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}
