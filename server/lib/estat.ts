const ESTAT_API_BASE_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/";
const DEFAULT_TIMEOUT_MS = 10_000;

type QueryValue = string | number | boolean | undefined | null;

export type EStatQuery = Record<string, QueryValue>;

export interface EStatResult {
  STATUS: number | string;
  ERROR_MSG?: string;
  DATE?: string;
  [key: string]: unknown;
}

export interface EStatStatsListResponse {
  GET_STATS_LIST: {
    RESULT: EStatResult;
    DATALIST_INF?: {
      TABLE_INF?: EStatTableInfo | EStatTableInfo[];
      NEXT_KEY?: string | number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface EStatTableInfo {
  [key: string]: unknown;
}

export interface EStatMetaInfoResponse {
  GET_META_INFO: {
    RESULT: EStatResult;
    METADATA_INF?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface EStatStatsDataResponse {
  GET_STATS_DATA: {
    RESULT: EStatResult;
    STATISTICAL_DATA?: {
      DATA_INF?: {
        VALUE?: EStatValue | EStatValue[];
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface EStatValue {
  [key: string]: unknown;
}

export class EStatError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EStatError";
  }
}

function getAppId(): string {
  const appId = process.env.ESTAT_APP_ID?.trim();
  if (!appId) {
    throw new EStatError("ESTAT_APP_ID is not configured on the server.", 500);
  }
  return appId;
}

function buildUrl(operation: string, query: EStatQuery): URL {
  const url = new URL(operation, ESTAT_API_BASE_URL);
  url.searchParams.set("appId", getAppId());

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && key !== "appId") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function getResult(payload: Record<string, unknown>): EStatResult | undefined {
  const body = Object.values(payload).find(
    (value): value is Record<string, unknown> =>
      typeof value === "object" && value !== null && "RESULT" in value,
  );
  return body?.RESULT as EStatResult | undefined;
}

function sanitizePayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sanitizePayload) as T;
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key.toLowerCase() !== "appid")
        .map(([key, nestedValue]) => [key, sanitizePayload(nestedValue)]),
    ) as T;
  }

  return value;
}

async function fetchEStat<T>(
  operation: "getStatsList" | "getMetaInfo" | "getStatsData",
  query: EStatQuery,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(operation, query), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new EStatError(
        `e-Stat API request failed with HTTP ${response.status}.`,
        response.status >= 400 && response.status < 500 ? 502 : 503,
      );
    }

    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new EStatError("e-Stat API returned an invalid JSON response.", 502);
    }

    const result = getResult(payload as Record<string, unknown>);
    const resultStatus = Number(result?.STATUS);
    if (!result || !Number.isFinite(resultStatus)) {
      throw new EStatError("e-Stat API response did not contain a valid RESULT.STATUS.", 502);
    }
    if (resultStatus >= 100) {
      throw new EStatError(result.ERROR_MSG ?? `e-Stat API returned status ${resultStatus}.`, 502);
    }

    return sanitizePayload(payload) as T;
  } catch (error) {
    if (error instanceof EStatError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EStatError("e-Stat API request timed out.", 504, error);
    }
    throw new EStatError("Unable to reach the e-Stat API.", 503, error);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeStatsData(response: EStatStatsDataResponse): EStatStatsDataResponse {
  const dataInfo = response.GET_STATS_DATA.STATISTICAL_DATA?.DATA_INF;
  if (dataInfo?.VALUE && !Array.isArray(dataInfo.VALUE)) {
    dataInfo.VALUE = [dataInfo.VALUE];
  }
  return response;
}

export function getStatsList(query: EStatQuery) {
  return fetchEStat<EStatStatsListResponse>("getStatsList", query);
}

export function getMetaInfo(query: EStatQuery) {
  return fetchEStat<EStatMetaInfoResponse>("getMetaInfo", query);
}

export async function getStatsData(query: EStatQuery) {
  return normalizeStatsData(await fetchEStat<EStatStatsDataResponse>("getStatsData", query));
}

export async function getStatsListPages(query: EStatQuery): Promise<EStatStatsListResponse[]> {
  const pages: EStatStatsListResponse[] = [];
  let startPosition: string | number | undefined;

  do {
    const page = await getStatsList({
      ...query,
      ...(startPosition !== undefined ? { startPosition } : {}),
    });
    pages.push(page);
    const value = page.GET_STATS_LIST.DATALIST_INF?.NEXT_KEY;
    startPosition = value === undefined || value === "" ? undefined : value;
  } while (startPosition !== undefined);

  return pages;
}
