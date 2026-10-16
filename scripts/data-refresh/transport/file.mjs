import { RefreshError, invariant } from "../lib/errors.mjs";

export const OFFICIAL_ESTAT_FILE_HOSTS = Object.freeze(["www.e-stat.go.jp"]);

export async function fetchOfficialFile({
  url,
  allowedHosts,
  fetchImpl = fetch,
  timeoutMs = 30_000,
  maxBytes = 100 * 1024 * 1024,
  maxRetries = 3,
  retryBaseMs = 250,
  maxRetryAfterMs = 5_000,
} = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new RefreshError("invalid-file-url", "Official file URL is invalid.");
  }
  invariant(
    parsed.protocol === "https:" && !parsed.username && !parsed.password,
    "invalid-file-url",
    "Official file downloads require an HTTPS URL without credentials.",
  );
  invariant(
    Array.isArray(allowedHosts) &&
      allowedHosts.length > 0 &&
      allowedHosts.every((host) => typeof host === "string" && /^[a-z0-9.-]+$/.test(host)),
    "file-host-allowlist-required",
    "Official file downloads require an explicit host allowlist.",
  );
  invariant(
    allowedHosts.every((host) => OFFICIAL_ESTAT_FILE_HOSTS.includes(host)),
    "file-host-not-allowlisted",
    "Configured file host is outside the fixed official host allowlist.",
  );
  invariant(
    allowedHosts.includes(parsed.hostname),
    "file-host-not-allowlisted",
    "Official file host is not allowlisted.",
  );
  invariant(
    Number.isInteger(maxRetries) &&
      maxRetries >= 0 &&
      Number.isFinite(retryBaseMs) &&
      retryBaseMs >= 0 &&
      Number.isFinite(maxRetryAfterMs) &&
      maxRetryAfterMs >= 0,
    "invalid-transport-config",
    "File retry limits are invalid.",
  );
  let lastStatus;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(parsed, { signal: controller.signal, redirect: "manual" });
    } catch (error) {
      clearTimeout(timer);
      if (attempt === maxRetries) {
        throw new RefreshError(
          error?.name === "AbortError" ? "file-timeout" : "file-network-error",
          "Official file download failed after the retry limit.",
        );
      }
      await delay(Math.min(retryBaseMs * 2 ** attempt, maxRetryAfterMs));
      continue;
    }
    clearTimeout(timer);
    if (response.status === 429 || response.status >= 500) {
      lastStatus = response.status;
      if (attempt < maxRetries) {
        const retryDelay = retryAfterMs(response.headers?.get?.("retry-after"), Date.now());
        await delay(
          retryDelay === undefined
            ? Math.min(retryBaseMs * 2 ** attempt, maxRetryAfterMs)
            : Math.min(retryDelay, maxRetryAfterMs),
        );
        continue;
      }
      throw new RefreshError(
        "file-http-error",
        `Official file download failed after retries (HTTP ${lastStatus}).`,
      );
    }
    if (!response.ok)
      throw new RefreshError(
        "file-http-error",
        `Official file download failed (HTTP ${response.status}).`,
      );
    try {
      const contentType = response.headers?.get?.("content-type") || "";
      if (/text\/html/i.test(contentType))
        throw new RefreshError("file-invalid-content", "Official file endpoint returned HTML.");
      const declaredLength = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
        throw new RefreshError(
          "file-too-large",
          "Official file exceeds the configured size limit.",
        );
      const bytes = await readBounded(response, maxBytes);
      if (bytes.byteLength === 0)
        throw new RefreshError("file-empty", "Official file download was empty.");
      const prefix = new TextDecoder()
        .decode(bytes.subarray(0, Math.min(bytes.length, 512)))
        .trimStart()
        .slice(0, 128)
        .toLowerCase();
      if (prefix.startsWith("<!doctype html") || prefix.startsWith("<html"))
        throw new RefreshError("file-invalid-content", "Official file endpoint returned HTML.");
      return { bytes, sha256Input: bytes, contentType: contentType || "application/octet-stream" };
    } catch (error) {
      if (error instanceof RefreshError) throw error;
      if (attempt < maxRetries) {
        await delay(Math.min(retryBaseMs * 2 ** attempt, maxRetryAfterMs));
        continue;
      }
      throw new RefreshError(
        "file-network-error",
        "Official file response could not be read after the retry limit.",
      );
    }
  }
  throw new RefreshError(
    "file-http-error",
    `Official file download failed (HTTP ${lastStatus ?? "unknown"}).`,
  );
}

function retryAfterMs(header, now) {
  if (typeof header !== "string" || !header.trim()) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

async function readBounded(response, maxBytes) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes)
      throw new RefreshError("file-too-large", "Official file exceeds the configured size limit.");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RefreshError(
          "file-too-large",
          "Official file exceeds the configured size limit.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
