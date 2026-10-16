import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function semanticFingerprint(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function rawSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
