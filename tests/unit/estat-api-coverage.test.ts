import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EStatError,
  getMetaInfo,
  getStatsData,
  getStatsList,
  getStatsListPages,
} from "@server/lib/estat";
import { GET as getStatsDataRoute } from "@/app/api/estat/data/route";
import { GET as getMetaInfoRoute } from "@/app/api/estat/meta/route";
import { GET as getStatsListRoute } from "@/app/api/estat/stats-list/route";
import { errorResponse, queryFromRequest } from "@/app/api/estat/_shared";

const appIdForTest = "dummy";
const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

const statsListPayload = (extra: Record<string, unknown> = {}) => ({
  GET_STATS_LIST: {
    RESULT: { STATUS: 0 },
    DATALIST_INF: { TABLE_INF: [{ id: "table-1" }], ...extra },
  },
});

describe("e-Stat API boundary", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    vi.stubEnv("ESTAT_APP_ID", appIdForTest);
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards supported query values, adds server credentials, and strips credentials from nested results", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        GET_STATS_LIST: {
          RESULT: { STATUS: "0" },
          request: { APPID: appIdForTest },
          DATALIST_INF: { TABLE_INF: [{ appId: appIdForTest, value: 9 }] },
        },
        trace: [{ appid: appIdForTest, keep: true }],
      }),
    );

    const result = await getStatsList({
      appId: "attacker-value",
      lang: "E",
      nullValue: null,
      omitted: undefined,
    });
    const [input, init] = fetchMock.mock.calls[0]!;
    const url = new URL(input instanceof Request ? input.url : String(input));

    expect(url.origin).toBe("https://api.e-stat.go.jp");
    expect(url.pathname).toBe("/rest/3.0/app/json/getStatsList");
    expect(url.searchParams.get("appId")).toBe(appIdForTest);
    expect(url.searchParams.get("lang")).toBe("E");
    expect(url.searchParams.has("nullValue")).toBe(false);
    expect(url.searchParams.has("omitted")).toBe(false);
    expect(url.searchParams.get("appId")).not.toBe("attacker-value");
    expect(init?.headers).toEqual({ Accept: "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      GET_STATS_LIST: {
        RESULT: { STATUS: "0" },
        request: {},
        DATALIST_INF: { TABLE_INF: [{ value: 9 }] },
      },
      trace: [{ keep: true }],
    });
  });

  it("normalizes one data value and follows numeric or string pagination keys", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          GET_STATS_DATA: {
            RESULT: { STATUS: 0 },
            STATISTICAL_DATA: { DATA_INF: { VALUE: { id: "v1" } } },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          GET_STATS_DATA: {
            RESULT: { STATUS: 0 },
            STATISTICAL_DATA: { DATA_INF: { VALUE: [{ id: "v1" }, { id: "v2" }] } },
          },
        }),
      )
      .mockResolvedValueOnce(response(statsListPayload({ NEXT_KEY: 2 })))
      .mockResolvedValueOnce(response(statsListPayload({ NEXT_KEY: "3" })))
      .mockResolvedValueOnce(response(statsListPayload({ NEXT_KEY: "" })));

    const [singleValueData, multipleValueData] = await Promise.all([
      getStatsData({ statsDataId: "data-1" }),
      getStatsData({ statsDataId: "data-2" }),
    ]);
    const pages = await getStatsListPages({ limit: 10 });

    expect(singleValueData.GET_STATS_DATA.STATISTICAL_DATA?.DATA_INF?.VALUE).toEqual([
      { id: "v1" },
    ]);
    expect(multipleValueData.GET_STATS_DATA.STATISTICAL_DATA?.DATA_INF?.VALUE).toEqual([
      { id: "v1" },
      { id: "v2" },
    ]);
    expect(pages).toHaveLength(3);
    expect(
      fetchMock.mock.calls
        .slice(2)
        .map(([input]) => new URL(String(input)).searchParams.get("startPosition")),
    ).toEqual([null, "2", "3"]);

    fetchMock.mockResolvedValueOnce(response(statsListPayload()));
    await expect(getStatsListPages({})).resolves.toHaveLength(1);
  });

  it("rejects a missing server API key before making a request", async () => {
    vi.stubEnv("ESTAT_APP_ID", "  ");

    await expect(getMetaInfo({ statsDataId: "meta-1" })).rejects.toMatchObject({
      name: "EStatError",
      statusCode: 500,
      message: "ESTAT_APP_ID is not configured on the server.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["client failure", 429, 502],
    ["upstream failure", 503, 503],
  ])(
    "maps an upstream %s into the service error contract",
    async (_label, upstreamStatus, expectedStatus) => {
      fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: upstreamStatus }));

      await expect(getStatsList({})).rejects.toMatchObject({
        name: "EStatError",
        statusCode: expectedStatus,
        message: `e-Stat API request failed with HTTP ${upstreamStatus}.`,
      });
    },
  );

  it.each([
    ["array body", []],
    ["null body", null],
    ["missing result", { GET_STATS_LIST: { DATALIST_INF: {} } }],
    ["non-numeric status", { GET_STATS_LIST: { RESULT: { STATUS: "unknown" } } }],
  ])(
    "rejects an invalid upstream %s rather than serving an unusable payload",
    async (_label, payload) => {
      fetchMock.mockResolvedValueOnce(response(payload));

      await expect(getStatsList({})).rejects.toMatchObject({ name: "EStatError", statusCode: 502 });
    },
  );

  it("surfaces e-Stat domain errors and supplies a status message when none is provided", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ GET_STATS_LIST: { RESULT: { STATUS: 101, ERROR_MSG: "No such table" } } }),
      )
      .mockResolvedValueOnce(response({ GET_STATS_LIST: { RESULT: { STATUS: 102 } } }));

    await expect(getStatsList({})).rejects.toMatchObject({
      statusCode: 502,
      message: "No such table",
    });
    await expect(getStatsList({})).rejects.toMatchObject({
      statusCode: 502,
      message: "e-Stat API returned status 102.",
    });
  });

  it("distinguishes an aborted request from other transport failures", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockImplementationOnce(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      )
      .mockRejectedValueOnce(new TypeError("connection reset"));

    const timedOutRequest = getStatsList({});
    const timedOutExpectation = expect(timedOutRequest).rejects.toMatchObject({
      statusCode: 504,
      message: "e-Stat API request timed out.",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await timedOutExpectation;
    await expect(getStatsList({})).rejects.toMatchObject({
      statusCode: 503,
      message: "Unable to reach the e-Stat API.",
    });
  });

  it("treats a non-JSON success response as an upstream transport failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 200 }));

    await expect(getStatsList({})).rejects.toMatchObject({
      statusCode: 503,
      message: "Unable to reach the e-Stat API.",
    });
  });

  it("requires identifiers on meta and data endpoints and rejects invalid list pagination", async () => {
    for (const path of ["/api/estat/meta", "/api/estat/data"]) {
      expect(() =>
        queryFromRequest(new Request(`https://local.test${path}?statsDataId=%20`)),
      ).toThrow("Either statsDataId or dataSetId is required.");
    }
    for (const key of ["limit", "startPosition"]) {
      for (const value of ["0", "-2", "1.5", "1e2"]) {
        expect(() =>
          queryFromRequest(
            new Request(
              `https://local.test/api/estat/stats-list?${key}=${encodeURIComponent(value)}`,
            ),
          ),
        ).toThrow(`${key} must be a positive integer.`);
      }
    }

    expect(
      queryFromRequest(
        new Request("https://local.test/api/estat/meta?statsDataId=ok&appId=untrusted"),
      ),
    ).toEqual({ statsDataId: "ok" });
    expect(
      queryFromRequest(
        new Request("https://local.test/api/estat/stats-list?limit=20&startPosition=4"),
      ),
    ).toEqual({ limit: "20", startPosition: "4" });
  });

  it("returns consistent JSON errors for validation, typed failures, and unexpected failures", async () => {
    const typed = errorResponse(new EStatError("missing id", 400));
    const unexpected = errorResponse(new Error("internal detail"));

    expect(typed.status).toBe(400);
    await expect(typed.json()).resolves.toEqual({ error: "missing id" });
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({ error: "Unexpected server error." });
  });

  it("serves each route through the shared query handling and translates route errors", async () => {
    fetchMock
      .mockResolvedValueOnce(response(statsListPayload()))
      .mockResolvedValueOnce(
        response({ GET_META_INFO: { RESULT: { STATUS: 0 }, METADATA_INF: { CLASS_INF: {} } } }),
      )
      .mockResolvedValueOnce(
        response({ GET_STATS_DATA: { RESULT: { STATUS: 0 }, STATISTICAL_DATA: {} } }),
      );

    const routes = [
      [getStatsListRoute, "/api/estat/stats-list?limit=5"],
      [getMetaInfoRoute, "/api/estat/meta?statsDataId=table-1"],
      [getStatsDataRoute, "/api/estat/data?dataSetId=table-1"],
    ] as const;
    const expectedPayloads = [
      { GET_STATS_LIST: { DATALIST_INF: { TABLE_INF: [{ id: "table-1" }] } } },
      { GET_META_INFO: { METADATA_INF: { CLASS_INF: {} } } },
      { GET_STATS_DATA: { STATISTICAL_DATA: {} } },
    ];
    for (const [index, [handler, path]] of routes.entries()) {
      const result = await handler(new Request(`https://local.test${path}`));
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject(expectedPayloads[index]);
    }

    const invalid = await getStatsDataRoute(new Request("https://local.test/api/estat/data"));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "Either statsDataId or dataSetId is required.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      "/rest/3.0/app/json/getStatsList",
      "/rest/3.0/app/json/getMetaInfo",
      "/rest/3.0/app/json/getStatsData",
    ]);

    fetchMock
      .mockRejectedValueOnce(new TypeError("upstream unavailable"))
      .mockRejectedValueOnce(new TypeError("upstream unavailable"));
    for (const [handler, path] of [
      [getStatsListRoute, "/api/estat/stats-list"],
      [getMetaInfoRoute, "/api/estat/meta?statsDataId=table-1"],
    ] as const) {
      const failed = await handler(new Request(`https://local.test${path}`));
      expect(failed.status).toBe(503);
      await expect(failed.json()).resolves.toEqual({ error: "Unable to reach the e-Stat API." });
    }
  });
});
