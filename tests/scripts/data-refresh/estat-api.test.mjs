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
  it("attaches only the allowlisted operation phase to schema failures", async () => {
    const failures = await Promise.all([
      fetchDataCatalog({
        appId: "fixture-secret",
        fetchImpl: async () =>
          jsonResponse({ GET_DATA_CATALOG: { RESULT: { STATUS: 0 }, private: "do-not-report" } }),
      }).catch((error) => error),
      fetchStatsList({
        appId: "fixture-secret",
        fetchImpl: async () =>
          jsonResponse({ GET_STATS_LIST: { RESULT: { STATUS: 0 }, private: "do-not-report" } }),
      }).catch((error) => error),
      fetchStatsData({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        fetchImpl: async () =>
          jsonResponse({ GET_STATS_DATA: { RESULT: { STATUS: 0 }, private: "do-not-report" } }),
      }).catch((error) => error),
      fetchMetaInfo({
        statsDataId: "0004052037",
        appId: "fixture-secret",
        fetchImpl: async () =>
          jsonResponse({ GET_META_INFO: { RESULT: { STATUS: 0 }, METADATA_INF: "do-not-report" } }),
      }).catch((error) => error),
    ]);
    expect(failures.map(({ code, apiPhase }) => ({ code, apiPhase }))).toEqual([
      { code: "api-invalid-schema", apiPhase: "catalog" },
      { code: "api-invalid-schema", apiPhase: "table-list" },
      { code: "api-invalid-schema", apiPhase: "stats-data" },
      { code: "api-invalid-schema", apiPhase: "metadata" },
    ]);
    expect(
      failures.every(
        (error) =>
          !error.message.includes("do-not-report") && !error.message.includes("fixture-secret"),
      ),
    ).toBe(true);
  });

  it("distinguishes table-list schema failures using fixed codes", async () => {
    const failures = await Promise.all([
      fetchStatsList({
        appId: "fixture-secret",
        fetchImpl: async () => jsonResponse("unexpected payload"),
      }).catch((error) => error),
      fetchStatsList({
        appId: "fixture-secret",
        fetchImpl: async () =>
          jsonResponse({ GET_STATS_LIST: { RESULT: { STATUS: 0 }, DATALIST_INF: {} } }),
      }).catch((error) => error),
      fetchStatsList({
        appId: "fixture-secret",
        fetchImpl: async () =>
          jsonResponse({
            GET_STATS_LIST: {
              RESULT: { STATUS: 0 },
              DATALIST_INF: { NUMBER: "invalid", RESULT_INF: {} },
            },
          }),
      }).catch((error) => error),
    ]);
    expect(
      failures.map(({ code, apiPhase, apiSchemaFailureCode }) => ({
        code,
        apiPhase,
        apiSchemaFailureCode,
      })),
    ).toEqual([
      {
        code: "api-invalid-schema",
        apiPhase: "table-list",
        apiSchemaFailureCode: "payload-not-object",
      },
      {
        code: "api-invalid-schema",
        apiPhase: "table-list",
        apiSchemaFailureCode: "paging-metadata-missing",
      },
      { code: "api-invalid-schema", apiPhase: "table-list", apiSchemaFailureCode: "total-invalid" },
    ]);
  });

  it("distinguishes catalog schema failures using fixed codes", async () => {
    const failures = await Promise.all([
      fetchDataCatalog({
        appId: "fixture-secret",
        fetchImpl: async () => jsonResponse("unexpected payload"),
      }).catch((error) => error),
      fetchDataCatalog({
        appId: "fixture-secret",
        fetchImpl: async () => jsonResponse({ GET_DATA_CATALOG: { RESULT: { STATUS: 0 } } }),
      }).catch((error) => error),
      fetchDataCatalog({
        appId: "fixture-secret",
        fetchImpl: async () =>
          jsonResponse({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: 0 },
              DATA_CATALOG_LIST_INF: { NUMBER: "invalid", RESULT_INF: {} },
            },
          }),
      }).catch((error) => error),
    ]);
    expect(
      failures.map(({ code, apiPhase, apiSchemaFailureCode }) => ({
        code,
        apiPhase,
        apiSchemaFailureCode,
      })),
    ).toEqual([
      {
        code: "api-invalid-schema",
        apiPhase: "catalog",
        apiSchemaFailureCode: "payload-not-object",
      },
      {
        code: "api-invalid-schema",
        apiPhase: "catalog",
        apiSchemaFailureCode: "paging-metadata-missing",
      },
      { code: "api-invalid-schema", apiPhase: "catalog", apiSchemaFailureCode: "total-invalid" },
    ]);
  });

  it("rejects malformed catalog entries and totals that change across pages", async () => {
    await expect(
      fetchDataCatalog({
        appId: "fixture-secret",
        fetchImpl: async () =>
          jsonResponse({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: "0" },
              DATA_CATALOG_LIST_INF: {
                NUMBER: "1",
                RESULT_INF: { FROM_NUMBER: "1", TO_NUMBER: "1" },
                DATA_CATALOG_INF: {
                  DATASET: { TITLE: "fixture" },
                  RESOURCES: {},
                },
              },
            },
          }),
      }),
    ).rejects.toMatchObject({ code: "api-invalid-schema", apiPhase: "catalog" });

    let calls = 0;
    await expect(
      fetchDataCatalog({
        appId: "fixture-secret",
        limit: 1,
        retryBaseMs: 0,
        fetchImpl: async () => {
          calls += 1;
          const firstPage = calls === 1;
          const catalog = {
            DATASET: { TITLE: "fixture" },
            RESOURCES: { RESOURCE: { "@id": "resource-1" } },
          };
          return jsonResponse({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: "0" },
              DATA_CATALOG_LIST_INF: {
                NUMBER: firstPage ? "2" : "3",
                RESULT_INF: firstPage
                  ? { FROM_NUMBER: "1", TO_NUMBER: "1", NEXT_KEY: "2" }
                  : { FROM_NUMBER: "2", TO_NUMBER: "2" },
                DATA_CATALOG_INF: catalog,
              },
            },
          });
        },
      }),
    ).rejects.toMatchObject({
      code: "api-invalid-schema",
      apiPhase: "catalog",
      apiSchemaFailureCode: "total-invalid",
    });
  });

  it("normalizes official nested catalog titles and matches dataset, resource, and table names separately", async () => {
    const datasetTitle = {
      NAME: { $: "2025年基準消費者物価指数 長期時系列データ 品目別価格指数 全国 月次" },
    };
    const resourceTitle = {
      NAME: { $: "品目別価格指数（1970年1月～最新月）" },
      TABLE_NAME: { $: "品目別価格指数（1970年1月～最新月）" },
    };
    const result = await fetchDataCatalog({
      appId: "fixture-secret",
      retryBaseMs: 0,
      fetchImpl: async () =>
        jsonResponse({
          GET_DATA_CATALOG: {
            RESULT: { STATUS: "0" },
            DATA_CATALOG_LIST_INF: {
              NUMBER: "1",
              RESULT_INF: { FROM_NUMBER: "1", TO_NUMBER: "1" },
              DATA_CATALOG_INF: {
                DATASET: {
                  TITLE: datasetTitle,
                  RELEASE_DATE: "2026-08-21",
                  LAST_MODIFIED_DATE: "2026-09-19",
                },
                RESOURCES: {
                  RESOURCE: {
                    "@id": "cpi-resource-2025",
                    TITLE: resourceTitle,
                    FORMAT: "CSV",
                    URL: "https://www.e-stat.go.jp/stat-search/file-download?fileKind=1&statInfId=000040482945",
                  },
                },
              },
            },
          },
        }),
    });
    expect(result.datasets[0].TITLE).toEqual(datasetTitle);
    const selected = resolveCatalogResource(result.datasets, {
      statInfId: "000040482945",
      expectedFormat: "CSV",
      titleIncludes: ["消費者物価指数", "2025年基準"],
      datasetIncludes: ["2025年基準消費者物価指数"],
      resourceIncludes: ["品目別価格指数"],
      tableIncludes: ["品目別価格指数（1970年1月～最新月）"],
      categoryIncludes: ["品目別価格指数"],
      periodIncludes: ["月次"],
      yearIncludes: ["2025"],
    });
    expect(selected).toMatchObject({
      datasetTitle: "2025年基準消費者物価指数 長期時系列データ 品目別価格指数 全国 月次",
      resourceTitle: "品目別価格指数（1970年1月～最新月）",
      tableTitle: "品目別価格指数（1970年1月～最新月）",
      legacyStatInfId: "000040482945",
      catalogResourceId: "cpi-resource-2025",
    });
  });

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
                NUMBER: "2",
                RESULT_INF: { FROM_NUMBER: "1", TO_NUMBER: "1", NEXT_KEY: "2" },
                TABLE_INF: table("0004052037"),
              },
            },
          })
        : jsonResponse({
            GET_STATS_LIST: {
              RESULT: { STATUS: 0 },
              DATALIST_INF: {
                NUMBER: "2",
                RESULT_INF: { FROM_NUMBER: "2", TO_NUMBER: "2" },
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
      query: { searchWord: "消費者物価指数", statsField: "0703", surveyYears: "2025" },
    });
    expect(result).toMatchObject({ candidateCount: 2, pageCount: 2, declaredTotal: 2 });
    expect(result.candidates.map((item) => item["@id"])).toEqual(["0004052037", "0004052038"]);
    expect(requests.map((url) => url.searchParams.get("startPosition"))).toEqual(["1", "2"]);
    for (const url of requests) {
      expect(url.pathname).toBe("/rest/3.0/app/json/getStatsList");
      expect(url.searchParams.get("searchWord")).toBe("消費者物価指数");
      expect(url.searchParams.get("statsField")).toBe("0703");
      expect(url.searchParams.get("surveyYears")).toBe("2025");
    }
  });

  it("rejects a GET_STATS_LIST count that changes between pages", async () => {
    const fetchImpl = async (url) => {
      const firstPage = url.searchParams.get("startPosition") === "1";
      return jsonResponse({
        GET_STATS_LIST: {
          RESULT: { STATUS: "0" },
          DATALIST_INF: {
            NUMBER: firstPage ? "2" : "3",
            RESULT_INF: firstPage
              ? { FROM_NUMBER: "1", TO_NUMBER: "1", NEXT_KEY: "2" }
              : { FROM_NUMBER: "2", TO_NUMBER: "2" },
            TABLE_INF: { "@id": firstPage ? "0004052037" : "0004052038" },
          },
        },
      });
    };

    await expect(
      fetchStatsList({ appId: "fixture-secret", fetchImpl, limit: 1, retryBaseMs: 0 }),
    ).rejects.toMatchObject({
      code: "api-invalid-schema",
      apiPhase: "table-list",
      apiSchemaFailureCode: "total-invalid",
    });
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
                    NUMBER: "3",
                    RESULT_INF: {
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
                    NUMBER: "3",
                    RESULT_INF: {
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
      const catalogEntry = (id, resources) => ({
        DATASET: {
          TITLE: "2025年基準消費動向指数_最新結果_2026年",
          RELEASE_DATE: "2026-09-01",
          LAST_MODIFIED_DATE: id === "000040499070" ? "2026-10-01" : "2026-09-15",
        },
        RESOURCES: { RESOURCE: resources },
      });
      const resource = (id, format = "XLSX") => ({
        "@id": `resource-${id}-${format}`,
        TITLE: {
          NAME: { $: "世帯消費動向指数_1-1-1_基本系列（原数値）_二人以上の世帯 月次" },
          TABLE_NAME: { $: "基本系列（原数値）" },
          TABLE_CATEGORY: { $: "二人以上の世帯" },
        },
        URL: urlFor(id),
        FORMAT: format,
      });
      return calls === 1
        ? jsonResponse({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: 0 },
              DATA_CATALOG_LIST_INF: {
                NUMBER: "2",
                RESULT_INF: { FROM_NUMBER: 1, TO_NUMBER: 1, NEXT_KEY: "2" },
                DATA_CATALOG_INF: catalogEntry("000040499070", resource("000040499070")),
              },
            },
          })
        : jsonResponse({
            GET_DATA_CATALOG: {
              RESULT: { STATUS: "0" },
              DATA_CATALOG_LIST_INF: {
                NUMBER: "2",
                RESULT_INF: { FROM_NUMBER: 2, TO_NUMBER: 2 },
                DATA_CATALOG_INF: [
                  catalogEntry("000040499082", [
                    resource("000040499082"),
                    resource("000040499082", "CSV"),
                  ]),
                ],
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
      datasetIncludes: ["2025年基準消費動向指数"],
      resourceIncludes: ["二人以上の世帯"],
      tableIncludes: ["基本系列（原数値）"],
      categoryIncludes: ["二人以上の世帯"],
      periodIncludes: ["月次"],
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
      TITLE: "2025年基準消費動向指数_最新結果_2026年",
      RELEASE_DATE: "2026-09-01",
      LAST_MODIFIED_DATE: updated,
      RESOURCE: {
        "@id": `resource-${id}-${updated}`,
        TITLE: "世帯消費動向指数 二人以上の世帯 月次 XLSX",
        FORMAT: "XLSX",
        URL: `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${id}`,
      },
    });
    const options = {
      statInfId: "000040499070",
      expectedFormat: "XLSX",
      titleIncludes: ["世帯消費動向指数"],
      datasetIncludes: ["2025年基準消費動向指数"],
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

  it("requires the configured legacy file ID when exact-ID mode is enabled", () => {
    const make = (id, updated) => ({
      TITLE: "2025年基準消費動向指数_最新結果_2026年",
      RELEASE_DATE: "2026-09-01",
      LAST_MODIFIED_DATE: updated,
      RESOURCE: {
        "@id": `resource-${id}-${updated}`,
        TITLE: "世帯消費動向指数 二人以上の世帯 月次 XLSX",
        FORMAT: "XLSX",
        URL: `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${id}`,
      },
    });
    const options = {
      statInfId: "000040499070",
      requiredStatInfId: "000040499070",
      expectedFormat: "XLSX",
      titleIncludes: ["世帯消費動向指数"],
      datasetIncludes: ["2025年基準消費動向指数"],
      yearIncludes: ["2025"],
    };
    expect(
      resolveCatalogResource(
        [make("000040499070", "2026-09-15"), make("000040499099", "2026-10-01")],
        options,
      ),
    ).toMatchObject({
      legacyStatInfId: "000040499070",
      lastModifiedDate: "2026-09-15",
      candidateCount: 1,
    });
    expect(() => resolveCatalogResource([make("000040499099", "2026-10-01")], options)).toThrow(
      expect.objectContaining({ code: "candidate-resolution-pending" }),
    );
  });

  it("attaches fixed numeric diagnostics to catalog candidate resolution failures", () => {
    const options = {
      statInfId: "000040499070",
      expectedFormat: "XLSX",
      titleIncludes: ["CTI"],
      datasetIncludes: ["CTI"],
      resourceIncludes: ["月次"],
    };
    const dataset = (host, id = "000040499070") => ({
      TITLE: "CTI 2025 月次",
      RELEASE_DATE: "2026-09-01",
      LAST_MODIFIED_DATE: "2026-10-01",
      RESOURCE: {
        "@id": "resource-one",
        TITLE: "月次 XLSX",
        FORMAT: "XLSX",
        URL: `https://${host}/file?statInfId=${id}`,
      },
    });

    let noMatch;
    try {
      resolveCatalogResource([dataset("attacker.example")], options);
    } catch (error) {
      noMatch = error;
    }
    expect(noMatch).toMatchObject({ code: "candidate-resolution-pending", apiPhase: "catalog" });
    expect(noMatch.candidateDiagnostics).toEqual({
      catalogRows: 1,
      datasetRows: 1,
      resourceRows: 1,
      expectedIdMatches: 1,
      allowedFormatMatches: 1,
      httpsOfficialHostMatches: 0,
      datasetTitleMarkerMatches: 1,
      resourceTitleMarkerMatches: 1,
      parseableDateMatches: 1,
      fullMatches: 0,
      latestTieCount: 0,
    });
    expect(JSON.stringify(noMatch.candidateDiagnostics)).not.toContain("attacker.example");

    let tied;
    try {
      resolveCatalogResource([dataset("www.e-stat.go.jp"), dataset("www.e-stat.go.jp")], options);
    } catch (error) {
      tied = error;
    }
    expect(tied).toMatchObject({
      code: "candidate-resolution-pending",
      apiPhase: "catalog",
      candidateDiagnostics: { fullMatches: 2, latestTieCount: 2 },
    });
  });

  it("selects a newer semantically equivalent catalog resource with a changed ID and rejects non-allowlisted hosts", () => {
    const make = (resourceId, legacyId, updated, catalogFormat = "XLSX") => ({
      TITLE: "2025年基準消費動向指数_最新結果_2026年",
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
      datasetIncludes: ["2025年基準消費動向指数"],
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
      filters: { cdArea: "00000", cdTab: "1", cdTimeFrom: "197001", cdCat01: "0001,0002" },
    });

    expect(result.records).toHaveLength(3);
    expect(result.declaredTotal).toBe(3);
    expect(result.pageCount).toBe(2);
    expect(requests.map((url) => url.searchParams.get("startPosition"))).toEqual(["1", "3"]);
    for (const url of requests) {
      expect(url.searchParams.get("cdArea")).toBe("00000");
      expect(url.searchParams.get("cdTab")).toBe("1");
      expect(url.searchParams.get("cdTimeFrom")).toBe("197001");
      expect(url.searchParams.get("cdCat01")).toBe("0001,0002");
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
    expect(error).toMatchObject({ apiPhase: "metadata", apiStatus: 123 });
    expect(error?.message).not.toMatch(/123/);
    expect(error?.message).not.toContain("fixture-secret");
  });
});
