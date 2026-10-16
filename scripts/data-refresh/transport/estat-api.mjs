import { RefreshError, invariant } from "../lib/errors.mjs";

const OFFICIAL_RESOURCE_HOSTS = Object.freeze(["www.e-stat.go.jp"]);

const DEFAULT_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";
const DEFAULT_META_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo";
const DEFAULT_LIST_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList";
const DEFAULT_CATALOG_ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getDataCatalog";

function safeStatus(response) {
  return `HTTP ${response.status}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? [value] : [];
}

function recordsFrom(payload) {
  return asArray(payload?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE);
}

function listRecordsFrom(payload) {
  const value = payload?.GET_STATS_LIST?.DATALIST_INF?.TABLE_INF;
  return asArray(value);
}

function catalogDatasetsFrom(payload) {
  const root =
    payload?.GET_DATA_CATALOG?.DATA_CATALOG ??
    payload?.GET_DATA_CATALOG?.CATALOG_INF ??
    payload?.GET_DATA_CATALOG;
  return asArray(root?.DATASET ?? root?.DATASET_INF ?? root?.CATALOG);
}

/** Resolve an official file resource by semantic identity, keeping catalog and legacy IDs distinct. */
export function resolveCatalogResource(
  datasets,
  {
    statInfId,
    expectedFormat,
    titleIncludes = [],
    datasetIncludes = [],
    resourceIncludes = [],
    tableIncludes = [],
    categoryIncludes = [],
    periodIncludes = [],
    yearIncludes = [],
  } = {},
) {
  if (
    !Array.isArray(datasets) ||
    (statInfId !== undefined && !/^\d{8,16}$/.test(statInfId)) ||
    !["CSV", "XLS", "XLSX"].includes(String(expectedFormat).toUpperCase()) ||
    ![
      titleIncludes,
      datasetIncludes,
      resourceIncludes,
      tableIncludes,
      categoryIncludes,
      periodIncludes,
      yearIncludes,
    ].every(Array.isArray)
  ) {
    throw new RefreshError(
      "candidate-resolution-pending",
      "Data-catalog identity contract is incomplete.",
    );
  }
  const semantic = [];
  for (const dataset of datasets) {
    const datasetTitle = catalogTitle(dataset?.TITLE);
    const releaseDate = catalogText(dataset?.RELEASE_DATE);
    const lastModifiedDate = catalogText(dataset?.LAST_MODIFIED_DATE);
    const resources = asArray(dataset?.RESOURCE);
    for (const resource of resources) {
      const title = catalogTitle(resource?.TITLE);
      const url = catalogText(resource?.URL);
      const format = catalogText(resource?.FORMAT).toUpperCase();
      const normalizedFormat =
        format === "XLS" && String(expectedFormat).toUpperCase() === "XLSX" ? "XLSX" : format;
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        continue;
      }
      const combinedTitle = `${datasetTitle} ${title}`;
      const legacyStatInfId = parsed.searchParams.get("statInfId");
      const resourceId = catalogText(resource?.["@id"] ?? resource?.ID);
      const fullTitleMarkers = [
        ...titleIncludes,
        ...tableIncludes,
        ...categoryIncludes,
        ...periodIncludes,
        ...yearIncludes,
      ];
      if (
        (legacyStatInfId !== null && !/^\d{8,16}$/.test(legacyStatInfId)) ||
        !resourceId ||
        !/^[A-Za-z0-9._-]{1,128}$/.test(resourceId) ||
        normalizedFormat !== String(expectedFormat).toUpperCase() ||
        !datasetTitle ||
        !title ||
        !releaseDate ||
        !lastModifiedDate ||
        !fullTitleMarkers.every((marker) => combinedTitle.includes(marker)) ||
        !datasetIncludes.every((marker) => datasetTitle.includes(marker)) ||
        !resourceIncludes.every((marker) => title.includes(marker))
      )
        continue;
      if (parsed.protocol !== "https:" || !OFFICIAL_RESOURCE_HOSTS.includes(parsed.hostname))
        continue;
      semantic.push({
        datasetTitle,
        resourceTitle: title,
        url: parsed.toString(),
        format: normalizedFormat,
        catalogFormat: format,
        releaseDate,
        lastModifiedDate,
        catalogResourceId: resourceId || undefined,
        legacyStatInfId: legacyStatInfId || undefined,
      });
    }
  }
  if (!semantic.length)
    throw new RefreshError(
      "candidate-resolution-pending",
      "No DataCatalog resource matches the complete semantic file identity and format.",
    );
  const latestDate = (candidate) =>
    Math.max(dateValue(candidate.releaseDate), dateValue(candidate.lastModifiedDate));
  if (semantic.some((candidate) => !Number.isFinite(latestDate(candidate))))
    throw new RefreshError(
      "candidate-resolution-pending",
      "DataCatalog candidate dates are not comparable.",
    );
  semantic.sort((a, b) => latestDate(b) - latestDate(a));
  const newest = semantic.filter((candidate) => latestDate(candidate) === latestDate(semantic[0]));
  if (newest.length !== 1)
    throw new RefreshError(
      "candidate-resolution-pending",
      "Multiple equally recent DataCatalog resources match the required file identity.",
    );
  const selected = newest[0];
  return { ...selected, candidateCount: semantic.length };
}

function catalogText(value) {
  const text = String(value?.$ ?? value ?? "").trim();
  const hasControl = [...text].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  return text.length <= 500 && !hasControl ? text : "";
}

function catalogTitle(value) {
  const text = catalogText(value);
  return text && !/(?:https?:\/\/|appId\s*=|api.?key|token\s*=)/i.test(text) ? text : "";
}

function dateValue(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Enumerates bounded DataCatalog dataset candidates without interpreting their resources. */
export async function fetchDataCatalog({
  appId,
  fetchImpl = fetch,
  endpoint = DEFAULT_CATALOG_ENDPOINT,
  limit = 100,
  timeoutMs = 30_000,
  maxRetries = 3,
  maxPages = 100,
  retryBaseMs = 250,
  query = {},
} = {}) {
  invariant(
    typeof appId === "string" && appId.trim(),
    "missing-api-key",
    "ESTAT_APP_ID is required for e-Stat API transport.",
  );
  invariant(
    Number.isInteger(limit) && limit > 0 && Number.isInteger(maxPages) && maxPages > 0,
    "invalid-transport-config",
    "Data-catalog pagination limits must be positive integers.",
  );
  const datasets = [];
  const seen = new Set();
  let startPosition = 1;
  let expectedTotal;
  let pageCount = 0;
  while (pageCount < maxPages) {
    pageCount += 1;
    const url = new URL(endpoint);
    url.searchParams.set("appId", appId);
    url.searchParams.set("startPosition", String(startPosition));
    url.searchParams.set("limit", String(limit));
    for (const [key, value] of Object.entries(query)) {
      if (!["statsCode", "searchWord", "dataType"].includes(key))
        throw new RefreshError(
          "invalid-data-catalog-query",
          "e-Stat data-catalog discovery contains an unsupported query field.",
        );
      if (value !== undefined && value !== null && String(value).trim())
        url.searchParams.set(key, String(value));
    }
    const { response, payload } = await requestWithRetry({
      fetchImpl,
      url,
      timeoutMs,
      maxRetries,
      retryBaseMs,
    });
    if (!response.ok)
      throw new RefreshError(
        "api-http-error",
        `e-Stat data-catalog request failed (${safeStatus(response)}).`,
      );
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new RefreshError(
        "api-invalid-schema",
        "e-Stat data-catalog response has an unexpected schema.",
      );
    const root = payload.GET_DATA_CATALOG;
    const result = root?.RESULT;
    if (!result || String(result.STATUS) !== "0")
      throw new RefreshError(
        "api-business-error",
        `e-Stat data-catalog API reported a business status ${String(result?.STATUS ?? "missing")}.`,
      );
    const catalog = root.DATA_CATALOG ?? root.CATALOG_INF ?? root;
    const resultInf = catalog?.RESULT_INF ?? root.RESULT_INF;
    if (!resultInf || typeof resultInf !== "object")
      throw new RefreshError(
        "api-invalid-schema",
        "e-Stat data-catalog response is missing paging metadata.",
      );
    const total = Number(resultInf.TOTAL_NUMBER);
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      (expectedTotal !== undefined && total !== expectedTotal)
    )
      throw new RefreshError(
        "api-invalid-schema",
        "e-Stat data-catalog total is invalid or changed between pages.",
      );
    expectedTotal = total;
    const page = catalogDatasetsFrom(payload);
    if (page.length > limit)
      throw new RefreshError(
        "api-limit-exceeded",
        "e-Stat data-catalog returned more datasets than requested.",
      );
    const from = Number(resultInf.FROM_NUMBER);
    const to = Number(resultInf.TO_NUMBER);
    if (
      page.length &&
      (!Number.isSafeInteger(from) ||
        !Number.isSafeInteger(to) ||
        from !== startPosition ||
        to !== startPosition + page.length - 1)
    )
      throw new RefreshError(
        "api-page-range-mismatch",
        "e-Stat data-catalog page range does not match the request.",
      );
    datasets.push(...page);
    const next = String(resultInf.NEXT_KEY ?? "").trim();
    if (next) {
      if (seen.has(next))
        throw new RefreshError("api-paging-loop", "e-Stat data-catalog repeated a paging token.");
      seen.add(next);
      const nextPosition = Number(next);
      if (
        !Number.isSafeInteger(nextPosition) ||
        nextPosition !== startPosition + page.length ||
        page.length === 0
      )
        throw new RefreshError(
          "api-invalid-next-key",
          "e-Stat data-catalog returned an invalid continuation key.",
        );
      startPosition = nextPosition;
      continue;
    }
    if (datasets.length !== expectedTotal)
      throw new RefreshError(
        "api-incomplete-result",
        "e-Stat data-catalog dataset count does not match its declared total.",
      );
    return { datasets, datasetCount: datasets.length, pageCount, declaredTotal: expectedTotal };
  }
  throw new RefreshError(
    "api-page-limit",
    "e-Stat data-catalog discovery exceeded the configured maximum page count.",
  );
}

/** Fetch the complete bounded set of table candidates returned by getStatsList. */
export async function fetchStatsList({
  appId,
  fetchImpl = fetch,
  endpoint = DEFAULT_LIST_ENDPOINT,
  limit = 100,
  timeoutMs = 30_000,
  maxRetries = 3,
  maxPages = 100,
  retryBaseMs = 250,
  query = {},
} = {}) {
  invariant(
    typeof appId === "string" && appId.trim(),
    "missing-api-key",
    "ESTAT_APP_ID is required for e-Stat API transport.",
  );
  invariant(
    Number.isInteger(limit) && limit > 0 && Number.isInteger(maxPages) && maxPages > 0,
    "invalid-transport-config",
    "Stats-list pagination limits must be positive integers.",
  );
  const candidates = [];
  const seen = new Set();
  let startPosition = 1;
  let expectedTotal;
  let pageCount = 0;
  while (pageCount < maxPages) {
    pageCount += 1;
    const url = new URL(endpoint);
    url.searchParams.set("appId", appId);
    url.searchParams.set("startPosition", String(startPosition));
    url.searchParams.set("limit", String(limit));
    for (const [key, value] of Object.entries(query)) {
      if (
        ![
          "statsCode",
          "searchWord",
          "statsField",
          "surveyYears",
          "openYears",
          "updatedDate",
        ].includes(key)
      ) {
        throw new RefreshError(
          "invalid-stats-list-query",
          "e-Stat table discovery contains an unsupported query field.",
        );
      }
      if (value !== undefined && value !== null && String(value).trim())
        url.searchParams.set(key, String(value));
    }
    const { response, payload } = await requestWithRetry({
      fetchImpl,
      url,
      timeoutMs,
      maxRetries,
      retryBaseMs,
    });
    if (!response.ok)
      throw new RefreshError(
        "api-http-error",
        `e-Stat table-list request failed (${safeStatus(response)}).`,
      );
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new RefreshError(
        "api-invalid-schema",
        "e-Stat table-list response has an unexpected schema.",
      );
    const root = payload.GET_STATS_LIST;
    const result = root?.RESULT;
    if (!result || String(result.STATUS) !== "0")
      throw new RefreshError(
        "api-business-error",
        `e-Stat table-list API reported a business status ${String(result?.STATUS ?? "missing")}.`,
      );
    const list = root?.DATALIST_INF;
    const resultInf = list?.RESULT_INF;
    if (!list || typeof list !== "object" || !resultInf || typeof resultInf !== "object")
      throw new RefreshError(
        "api-invalid-schema",
        "e-Stat table-list response is missing paging metadata.",
      );
    const total = Number(resultInf.TOTAL_NUMBER);
    if (
      !Number.isSafeInteger(total) ||
      total < 0 ||
      (expectedTotal !== undefined && total !== expectedTotal)
    )
      throw new RefreshError(
        "api-invalid-schema",
        "e-Stat table-list total is invalid or changed between pages.",
      );
    expectedTotal = total;
    const page = listRecordsFrom(payload);
    if (page.length > limit)
      throw new RefreshError(
        "api-limit-exceeded",
        "e-Stat table-list returned more candidates than requested.",
      );
    const from = Number(resultInf.FROM_NUMBER);
    const to = Number(resultInf.TO_NUMBER);
    if (
      page.length &&
      (!Number.isSafeInteger(from) ||
        !Number.isSafeInteger(to) ||
        from !== startPosition ||
        to !== startPosition + page.length - 1)
    )
      throw new RefreshError(
        "api-page-range-mismatch",
        "e-Stat table-list page range does not match the request.",
      );
    candidates.push(...page);
    const next = String(resultInf.NEXT_KEY ?? "").trim();
    if (next) {
      if (seen.has(next))
        throw new RefreshError("api-paging-loop", "e-Stat table-list repeated a paging token.");
      seen.add(next);
      const nextPosition = Number(next);
      if (
        !Number.isSafeInteger(nextPosition) ||
        nextPosition !== startPosition + page.length ||
        page.length === 0
      )
        throw new RefreshError(
          "api-invalid-next-key",
          "e-Stat table-list returned an invalid continuation key.",
        );
      startPosition = nextPosition;
      continue;
    }
    if (candidates.length !== expectedTotal)
      throw new RefreshError(
        "api-incomplete-result",
        "e-Stat table-list candidate count does not match its declared total.",
      );
    return {
      candidates,
      candidateCount: candidates.length,
      pageCount,
      declaredTotal: expectedTotal,
    };
  }
  throw new RefreshError(
    "api-page-limit",
    "e-Stat table discovery exceeded the configured maximum page count.",
  );
}

export async function fetchStatsData({
  statsDataId,
  appId,
  fetchImpl = fetch,
  endpoint = DEFAULT_ENDPOINT,
  limit = 100_000,
  timeoutMs = 30_000,
  maxRetries = 3,
  maxPages = 10_000,
  retryBaseMs = 250,
  onPage = () => {},
  filters = {},
} = {}) {
  invariant(
    typeof statsDataId === "string" && /^\d{8,16}$/.test(statsDataId),
    "invalid-identity",
    "A valid API statsDataId is required.",
  );
  invariant(
    typeof appId === "string" && appId.trim(),
    "missing-api-key",
    "ESTAT_APP_ID is required for e-Stat API transport.",
  );
  invariant(
    Number.isInteger(limit) && limit > 0,
    "invalid-transport-config",
    "API limit must be a positive integer.",
  );
  const allRecords = [];
  const seenTokens = new Set();
  let startPosition = 1;
  let pageNumber = 0;
  let expectedTotal;

  while (pageNumber < maxPages) {
    pageNumber += 1;
    const url = new URL(endpoint);
    url.searchParams.set("appId", appId);
    url.searchParams.set("statsDataId", statsDataId);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("startPosition", String(startPosition));
    url.searchParams.set("metaGetFlg", "Y");
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && String(value) !== "")
        url.searchParams.set(key, String(value));
    }

    const { response, payload } = await requestWithRetry({
      fetchImpl,
      url,
      timeoutMs,
      maxRetries,
      retryBaseMs,
    });
    if (!response.ok)
      throw new RefreshError(
        "api-http-error",
        `e-Stat API request failed (${safeStatus(response)}).`,
      );
    const contentType = response.headers?.get?.("content-type") || "";
    if (contentType && !/json/i.test(contentType))
      throw new RefreshError("api-invalid-content", "e-Stat API returned a non-JSON response.");
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new RefreshError("api-invalid-schema", "e-Stat API response has an unexpected schema.");
    const result = payload?.GET_STATS_DATA?.RESULT;
    if (!result || String(result.STATUS) !== "0")
      throw new RefreshError(
        "api-business-error",
        `e-Stat API reported a business status ${String(result?.STATUS ?? "missing")}.`,
      );
    const statisticalData = payload?.GET_STATS_DATA?.STATISTICAL_DATA;
    const dataInf = statisticalData?.DATA_INF;
    const resultInf = statisticalData?.RESULT_INF;
    if (!dataInf || typeof dataInf !== "object" || !resultInf || typeof resultInf !== "object")
      throw new RefreshError(
        "api-invalid-schema",
        "e-Stat API response is missing statistical data or paging metadata.",
      );
    const records = recordsFrom(payload);
    const total = Number(resultInf.TOTAL_NUMBER);
    if (!Number.isSafeInteger(total) || total < 0)
      throw new RefreshError(
        "api-invalid-schema",
        "e-Stat API returned an invalid filtered total count.",
      );
    if (expectedTotal !== undefined && total !== expectedTotal)
      throw new RefreshError(
        "api-inconsistent-total",
        "e-Stat filtered total count changed between pages.",
      );
    expectedTotal = total;
    if (records.length > limit)
      throw new RefreshError(
        "api-limit-exceeded",
        "e-Stat API returned more records than the requested page limit.",
      );
    const from = Number(resultInf.FROM_NUMBER);
    const to = Number(resultInf.TO_NUMBER);
    if (
      records.length > 0 &&
      (!Number.isSafeInteger(from) ||
        !Number.isSafeInteger(to) ||
        from !== startPosition ||
        to !== startPosition + records.length - 1)
    ) {
      throw new RefreshError(
        "api-page-range-mismatch",
        "e-Stat page range metadata does not match the requested page.",
      );
    }
    allRecords.push(...records);
    onPage({
      endpointId: "estat:getStatsData",
      page: pageNumber,
      records: records.length,
      cumulativeRecords: allRecords.length,
    });

    const nextKey = resultInf.NEXT_KEY;
    if (nextKey && String(nextKey).trim()) {
      const token = String(nextKey).trim();
      if (seenTokens.has(token))
        throw new RefreshError("api-paging-loop", "e-Stat API repeated a paging token.");
      seenTokens.add(token);
      const nextPosition = Number(token);
      if (!Number.isSafeInteger(nextPosition) || nextPosition <= startPosition)
        throw new RefreshError(
          "api-invalid-next-key",
          "e-Stat API returned an invalid paging continuation key.",
        );
      startPosition = nextPosition;
      if (records.length === 0)
        throw new RefreshError(
          "api-incomplete-page",
          "e-Stat API paging advanced without returning records.",
        );
      continue;
    }
    if (allRecords.length !== expectedTotal) {
      throw new RefreshError(
        "api-incomplete-result",
        "e-Stat API result count does not match its declared total.",
      );
    }
    return {
      records: allRecords,
      recordCount: allRecords.length,
      pageCount: pageNumber,
      declaredTotal: expectedTotal,
    };
  }
  throw new RefreshError(
    "api-page-limit",
    "e-Stat API exceeded the configured maximum page count.",
  );
}

export async function fetchMetaInfo({
  statsDataId,
  appId,
  fetchImpl = fetch,
  endpoint = DEFAULT_META_ENDPOINT,
  timeoutMs = 30_000,
  maxRetries = 3,
  retryBaseMs = 250,
} = {}) {
  invariant(
    typeof statsDataId === "string" && /^\d{8,16}$/.test(statsDataId),
    "invalid-identity",
    "A valid API statsDataId is required.",
  );
  invariant(
    typeof appId === "string" && appId.trim(),
    "missing-api-key",
    "ESTAT_APP_ID is required for e-Stat API transport.",
  );
  const url = new URL(endpoint);
  url.searchParams.set("appId", appId);
  url.searchParams.set("statsDataId", statsDataId);
  const { response, payload } = await requestWithRetry({
    fetchImpl,
    url,
    timeoutMs,
    maxRetries,
    retryBaseMs,
  });
  if (!response.ok)
    throw new RefreshError(
      "api-http-error",
      `e-Stat metadata request failed (${safeStatus(response)}).`,
    );
  const result = payload?.GET_META_INFO?.RESULT;
  const metadata = payload?.GET_META_INFO?.METADATA_INF;
  if (!result || String(result.STATUS) !== "0")
    throw new RefreshError(
      "api-business-error",
      `e-Stat metadata API reported a business status ${String(result?.STATUS ?? "missing")}.`,
    );
  if (!metadata || typeof metadata !== "object")
    throw new RefreshError(
      "api-invalid-schema",
      "e-Stat metadata response has an unexpected schema.",
    );
  return payload;
}

async function requestWithRetry({ fetchImpl, url, timeoutMs, maxRetries, retryBaseMs }) {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, { signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof RefreshError) throw error;
      if (error?.name === "AbortError")
        throw new RefreshError("api-timeout", "e-Stat API request timed out.");
      if (attempt >= maxRetries)
        throw new RefreshError(
          "api-network-error",
          "e-Stat API request failed after the retry limit.",
        );
      await delay(retryBaseMs * 2 ** attempt);
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      clearTimeout(timer);
      await delay(retryBaseMs * 2 ** attempt);
      continue;
    }
    if (!response.ok) {
      clearTimeout(timer);
      return { response };
    }
    const contentType = response.headers?.get?.("content-type") || "";
    if (contentType && !/json/i.test(contentType)) {
      clearTimeout(timer);
      throw new RefreshError("api-invalid-content", "e-Stat API returned a non-JSON response.");
    }
    try {
      const payload = await response.json();
      clearTimeout(timer);
      return { response, payload };
    } catch (error) {
      clearTimeout(timer);
      if (error?.name === "AbortError")
        throw new RefreshError("api-timeout", "e-Stat API request timed out.");
      throw new RefreshError("api-invalid-json", "e-Stat API returned invalid JSON.");
    }
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
