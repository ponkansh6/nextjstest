import { describe, expect, it } from "vitest";
import {
  fetchDataCatalog,
  fetchMetaInfo,
  fetchStatsData,
  fetchStatsList,
  resolveCatalogResource,
} from "../../../scripts/data-refresh/transport/estat-api.mjs";

const jsonResponse = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("e-Stat API transport v3 response contract", () => {
  it("paginates getStatsList candidates and normalizes singleton and array table envelopes", async () => {
    const requests = [];
    const fetchImpl = async (url) => {
      requests.push(new URL(url));
      const start = url.searchParams.get("startPosition");
      const table = (id) => ({ "@id": id, TITLE: "fixture CPI table" });
      return start === "1"
        ? jsonResponse({
            GET_STATS_LIST: {
              RESULT: { STATUS: "0" },
              DATALIST_INF: {
                RESULT_INF: { TOTAL_NUMBER: "2", FROM_NUMBER: "1", TO_NUMBER: "1", NEXT_KEY: "2" },
                TABLE_INF: table("0004052037"),
              },
            },
          })
        : jsonResponse({
            GET_STATS_LIST: {
              RESULT: { STATUS: 0 },
              DATALIST_INF: {
                RESULT_INF: { TOTAL_NUMBER: "2", FROM_NUMBER: "2", TO_NUMBER: "2" },
                TABLE_INF: [table("0004052038")],
              },
            },
          });
    };
    const result = await fetchStatsList({
      appId: "fixture-secret",
      fetchImpl,
      limit: 1,
      retryBaseMs: 0,
      query: { searchWord: "消費者物価指数", statsField: "2", surveyYears: "2025" },
    });
    expect(result).toMatchObject({ candidateCount: 2, pageCount: 2, declaredTotal: 2 });
    expect(result.candidates.map((item) => item["@id"])).toEqual(["0004052037", "0004052038"]);
    expect(requests.map((url) => url.searchParams.get("startPosition"))).toEqual(["1", "2"]);
    for (const url of requests) {
      expect(url.pathname).toBe("/rest/3.0/app/json/getStatsList");
      expect(url.searchParams.get("searchWord")).toBe("消費者物価指数");
      expect(url.searchParams.get("statsField")).toBe("2");
      expect(url.searchParams.get("surveyYears")).toBe("2025");
    }
  });

  it("fails closed on repeated getStatsList pagination keys", async () => {
    let calls = 0;
    await expect(
      fetchStatsList({
        appId: "fixture-secret",
        limit: 1,
        retryBaseMs: 0,
        fetchImpl: async () => {
          calls += 1;
          return calls === 1
            ? jsonResponse({
                GET_STATS_LIST: {
                  RESULT: { STATUS: "0" },
                  DATALIST_INF: {
                    RESULT_INF: {
                      TOTAL_NUMBER: "3",
                      FROM_NUMBER: "1",
                      TO_NUMBER: "1",
                      NEXT_KEY: "2",
                    },
                    TABLE_INF: { "@id": "0004052037" },
                  },
                },
              })
            : jsonResponse({
                GET_STATS_LIST: {
                  RESULT: { STATUS: "0" },
                  DATALIST_INF: {
                    RESULT_INF: {
                      TOTAL_NUMBER: "3",
                      FROM_NUMBER: "2",
                      TO_NUMBER: "2",
                      NEXT_KEY: "2",
                    },
                    TABLE_INF: { "@id": "0004052038" },
                  },
                },
              });
        },
      }),
    ).rejects.toMatchObject({ code: "api-paging-loop" });
  });

  it("paginates catalog datasets across singleton and array envelopes and preserves explicit URL identity", async () => {
    let calls = 0;
    const fetchImpl = async (url) => {
      calls += 1;
      const urlFor = (id) =>
        `https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=${id}`;
      const dataset = (id) => ({
        TITLE: "世帯消費動向指数 二人以上の世帯 2025 月次 原数値",
        RELEASE_DATE: "2026-09-01",
        LAST_MODIFIED_DATE: id === "000040499070" ? "2026-10-01" : "2026-09-15",
        RESOURCE: { "@id": `resource-${id}`, TITLE: "月次 XLSX", URL: urlFor(id), FORMAT: "XLSX" },
      });
      const current = dataset(calls === 1 ? "000040499070" : "000040499082");
      return calls === 1
        ? jsonResponse({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: 0 },
              DATA_CATALOG: {
                RESULT_INF: { TOTAL_NUMBER: 2, FROM_NUMBER: 1, TO_NUMBER: 1, NEXT_KEY: "2" },
                DATASET: current,
              },
            },
          })
        : jsonResponse({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: "0" },
              DATA_CATALOG: {
                RESULT_INF: { TOTAL_NUMBER: 2, FROM_NUMBER: 2, TO_NUMBER: 2 },
                DATASET: [current],
              },
            },
          });
    };
    const result = await fetchDataCatalog({
      appId: "fixture-secret",
      fetchImpl,
      limit: 1,
      retryBaseMs: 0,
      query: { searchWord: "世帯消費動向指数", dataType: "XLS" },
    });
    expect(result).toMatchObject({ datasetCount: 2, pageCount: 2, declaredTotal: 2 });
    const picked = resolveCatalogResource(result.datasets, {
      statInfId: "000040499070",
      expectedFormat: "XLSX",
      titleIncludes: ["世帯消費動向指数", "二人以上の世帯"],
      datasetIncludes: ["世帯消費動向指数"],
      resourceIncludes: ["月次"],
      yearIncludes: ["2025"],
    });
    expect(picked).toMatchObject({
      candidateCount: 2,
      format: "XLSX",
      lastModifiedDate: "2026-10-01",
    });
  });

  it("fails closed for missing or ambiguous file identities and resolves legacy IDs dynamically", () => {
    const make = (id, updated = "2026-10-01") => ({
      TITLE: "CTI 世帯消費動向指数 二人以上の世帯 2025 月次",
      RELEASE_DATE: "2026-09-01",
      LAST_MODIFIED_DATE: updated,
      RESOURCE: {
        "@id": `resource-${id}-${updated}`,
        TITLE: "月次 XLSX",
        FORMAT: "XLSX",
        URL: `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${id}`,
      },
    });
    const options = {
      statInfId: "000040499070",
      expectedFormat: "XLSX",
      titleIncludes: ["世帯消費動向指数"],
      datasetIncludes: ["世帯消費動向指数"],
      yearIncludes: ["2025"],
    };
    expect(() => resolveCatalogResource([], options)).toThrow(
      expect.objectContaining({ code: "candidate-resolution-pending" }),
    );
    expect(() =>
      resolveCatalogResource([make("000040499070"), make("000040499070")], options),
    ).toThrow(expect.objectContaining({ code: "candidate-resolution-pending" }));
    expect(resolveCatalogResource([make("000040499071")], options).legacyStatInfId).toBe(
      "000040499071",
    );
    expect(
      resolveCatalogResource(
        [make("000040499070", "2026-09-01"), make("000040499070", "2026-10-01")],
        options,
      ).lastModifiedDate,
    ).toBe("2026-10-01");
  });

  it("selects a newer semantically equivalent catalog resource with a changed ID and rejects non-allowlisted hosts", () => {
    const make = (resourceId, legacyId, updated, catalogFormat = "XLSX") => ({
      TITLE: "CTI 世帯消費動向指数 二人以上の世帯 2025 月次",
      RELEASE_DATE: "2026-09-01",
      LAST_MODIFIED_DATE: updated,
      RESOURCE: {
        "@id": resourceId,
        TITLE: `世帯消費動向指数 二人以上の世帯 月次 2025 ${catalogFormat}`,
        FORMAT: catalogFormat,
        URL: `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${legacyId}`,
      },
    });
    const options = {
      statInfId: "000040499070",
      expectedFormat: "XLSX",
      titleIncludes: ["世帯消費動向指数", "二人以上の世帯"],
      datasetIncludes: ["世帯消費動向指数"],
      resourceIncludes: ["二人以上の世帯"],
      categoryIncludes: ["二人以上の世帯"],
      periodIncludes: ["月次"],
      yearIncludes: ["2025"],
    };
    const picked = resolveCatalogResource(
      [
        make("res-old", "000040499070", "2026-09-15"),
        make("res-new", "000040499099", "2026-10-01"),
      ],
      options,
    );
    expect(picked).toMatchObject({
      catalogResourceId: "res-new",
      legacyStatInfId: "000040499099",
      candidateCount: 2,
    });
    expect(
      resolveCatalogResource([make("res-xls", "000040499099", "2026-10-02", "XLS")], options),
    ).toMatchObject({ catalogResourceId: "res-xls", format: "XLSX", catalogFormat: "XLS" });
    const evil = make("res-evil", "000040499099", "2026-10-02");
    evil.RESOURCE.URL = evil.RESOURCE.URL.replace("www.e-stat.go.jp", "attacker.example");
    expect(() => resolveCatalogResource([evil], options)).toThrow(
      expect.objectContaining({ code: "candidate-resolution-pending" }),
    );
    expect(() =>
      resolveCatalogResource(
        [make("res-a", "000040499099", "2026-10-01"), make("res-b", "000040499098", "2026-10-01")],
        options,
      ),
    ).toThrow(expect.objectContaining({ code: "candidate-resolution-pending" }));
  });

  it("paginates filtered VALUE records using RESULT_INF and sends the official filter names", async () => {
    const requests = [];
    const fetchImpl = async (url) => {
      requests.push(new URL(url));
      const start = url.searchParams.get("startPosition");
      if (start === "1")
        return jsonResponse({
          GET_STATS_DATA: {
            RESULT: { STATUS: 0 },
            STATISTICAL_DATA: {
              RESULT_INF: { TOTAL_NUMBER: "3", NEXT_KEY: "3", FROM_NUMBER: "1", TO_NUMBER: "2" },
              DATA_INF: {
                VALUE: [
                  {
                    "@area": "00000",
                    "@tab": "1",
                    "@time": "202501",
                    "@cat01": "0001",
                    "@unit": "2025年=100",
                    $: "99.9",
                  },
                  {
                    "@area": "00000",
                    "@tab": "1",
                    "@time": "202502",
                    "@cat01": "0001",
                    "@unit": "2025年=100",
                    $: "100.1",
                  },
                ],
              },
            },
          },
        });
      return jsonResponse({
        GET_STATS_DATA: {
          RESULT: { STATUS: "0" },
          STATISTICAL_DATA: {
            RESULT_INF: { TOTAL_NUMBER: "3", FROM_NUMBER: "3", TO_NUMBER: "3" },
            DATA_INF: {
              VALUE: {
                "@area": "00000",
                "@tab": "1",
                "@time": "202503",
                "@cat01": "0001",
                "@unit": "2025年=100",
                $: "100.0",
              },
            },
          },
        },
      });
    };
    const result = await fetchStatsData({
      statsDataId: "0004052037",
      appId: "fixture-secret",
      fetchImpl,
      limit: 2,
      retryBaseMs: 0,
      filters: { cdArea: "00000", cdTab: "1", cdTimeFrom: "197001" },
    });

    expect(result.records).toHaveLength(3);
    expect(result.declaredTotal).toBe(3);
    expect(result.pageCount).toBe(2);
    expect(requests.map((url) => url.searchParams.get("startPosition"))).toEqual(["1", "3"]);
    for (const url of requests) {
      expect(url.searchParams.get("cdArea")).toBe("00000");
      expect(url.searchParams.get("cdTab")).toBe("1");
      expect(url.searchParams.get("cdTimeFrom")).toBe("197001");
      expect(url.searchParams.has("startTime")).toBe(false);
      expect(url.searchParams.has("cdAreaSelect")).toBe(false);
      expect(url.searchParams.has("cdTabSelect")).toBe(false);
      expect(url.searchParams.has("cntGetFlg")).toBe(false);
      expect(url.searchParams.get("appId")).toBe("fixture-secret");
    }
  });

  it("keeps metadata singleton shapes and rejects business errors without exposing payload secrets", async () => {
    const payload = {
      GET_META_INFO: {
        RESULT: { STATUS: "0" },
        METADATA_INF: {
          TABLE_INF: {
            "@id": "0004052037",
            TITLE: { $: "CPI" },
            CLASS_INF: {
              CLASS_OBJ: { "@id": "area", CLASS: { "@code": "00000", "@name": "全国" } },
            },
          },
        },
      },
    };
    const metadata = await fetchMetaInfo({
      statsDataId: "0004052037",
      appId: "fixture-secret",
      fetchImpl: async () => jsonResponse(payload),
    });
    expect(metadata.GET_META_INFO.METADATA_INF.TABLE_INF.TITLE.$).toBe("CPI");

    const failingFetch = async () =>
      jsonResponse({
        GET_META_INFO: {
          RESULT: { STATUS: 123, ERROR_MSG: "fixture-secret-must-not-leak" },
          METADATA_INF: {},
        },
      });
    let error;
    try {
      await fetchMetaInfo({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        fetchImpl: failingFetch,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error?.message).toMatch(/123/);
    expect(error?.message).not.toContain("fixture-secret");
  });
});
