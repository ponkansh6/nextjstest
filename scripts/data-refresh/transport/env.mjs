import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export async function loadRefreshEnv({ cwd = process.cwd(), env = process.env, envFile } = {}) {
  const explicit = envFile ?? env.ESTAT_ENV_FILE;
  const candidates = explicit
    ? [path.resolve(cwd, explicit)]
    : [
        ...new Set(
          [cwd, scriptRoot].flatMap((start) => {
            const parents = [];
            for (let current = path.resolve(start); ; current = path.dirname(current)) {
              parents.push(path.join(current, ".env.local"));
              if (path.dirname(current) === current) break;
            }
            return parents;
          }),
        ),
      ];

  let contents = "";
  for (const candidate of candidates) {
    try {
      contents = await readFile(candidate, "utf8");
      break;
    } catch (error) {
      if (error?.code !== "ENOENT")
        throw new Error("Unable to read configured e-Stat environment file.");
    }
  }
  const fromFile = parseEnv(contents);
  return {
    appId: env.ESTAT_APP_ID || fromFile.ESTAT_APP_ID,
    sourceFileLoaded: Boolean(contents),
  };
}

function parseEnv(contents) {
  const parsed = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?ESTAT_APP_ID\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[1];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    parsed.ESTAT_APP_ID = value;
  }
  return parsed;
}
