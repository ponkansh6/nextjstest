import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = (path: string) => readFileSync(join(projectRoot, path), "utf8");
const filesUnder = (path: string): string[] =>
  readdirSync(join(projectRoot, path), { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : /\.(ts|tsx)$/.test(entry.name) ? [child] : [];
  });

const withoutCommentsAndStrings = (content: string): string => {
  let result = "";
  let index = 0;
  let mode: "code" | "lineComment" | "blockComment" | "singleQuote" | "doubleQuote" | "template" =
    "code";

  while (index < content.length) {
    const character = content[index];
    const next = content[index + 1];

    if (mode === "code") {
      if (character === "/" && next === "/") {
        result += "  ";
        index += 2;
        mode = "lineComment";
      } else if (character === "/" && next === "*") {
        result += "  ";
        index += 2;
        mode = "blockComment";
      } else if (character === "'") {
        result += " ";
        index += 1;
        mode = "singleQuote";
      } else if (character === '"') {
        result += " ";
        index += 1;
        mode = "doubleQuote";
      } else if (character === "`") {
        result += " ";
        index += 1;
        mode = "template";
      } else {
        result += character;
        index += 1;
      }
    } else if (mode === "lineComment") {
      result += character === "\n" ? "\n" : " ";
      index += 1;
      if (character === "\n") mode = "code";
    } else if (mode === "blockComment") {
      result += character === "\n" ? "\n" : " ";
      index += 1;
      if (character === "*" && next === "/") {
        result += " ";
        index += 1;
        mode = "code";
      }
    } else {
      result += character === "\n" ? "\n" : " ";
      index += 1;
      if (character === "\\") {
        result += index < content.length && content[index] === "\n" ? "\n" : " ";
        index += 1;
      } else if (
        (mode === "singleQuote" && character === "'") ||
        (mode === "doubleQuote" && character === '"') ||
        (mode === "template" && character === "`")
      ) {
        mode = "code";
      }
    }
  }

  return result;
};

describe("shared math dependency boundaries", () => {
  it("keeps client calculations environment-independent", () => {
    for (const file of [...filesUnder("src/lib/math"), "src/lib/clientCalculations.ts"]) {
      const content = source(file);
      const code = withoutCommentsAndStrings(content);
      expect(code, file).not.toMatch(/(?:server\/|@server)/);
      expect(content, file).not.toMatch(/\bfrom\s+["'](?:next|react|node:)[^"']*["']/);
      expect(code, file).not.toMatch(/\b(?:next|react|node:)\b/);
      expect(code, file).not.toMatch(/\b(?:window|localStorage|sessionStorage)\b/);
    }
  });

  it("keeps client and server on their allowed shared math boundaries", () => {
    const clientCalculations = source("src/lib/clientCalculations.ts");
    expect(clientCalculations).toMatch(/from\s+["']\.\/math\/clientCalculations["']/);
    expect(clientCalculations).not.toMatch(/from\s+["'][^"']*supportSeries[^"']*["']/);

    for (const file of filesUnder("src/lib/math")) {
      const content = source(file);
      expect(content, file).not.toMatch(
        /from\s+["'][^"']*(?:clientCalculations|server\/)[^"']*["']|import\s+["'][^"']*(?:clientCalculations|server\/)[^"']*["']/,
      );
    }

    for (const file of [
      "server/lib/data-loader/gdpSupport.ts",
      "server/lib/math/supportSeries.ts",
    ]) {
      const content = source(file);
      expect(content, file).toMatch(
        /(?:\.\.\/)+\.\.\/src\/lib\/math\/supportSeries|@\/lib\/math\/supportSeries/,
      );
      expect(content, file).not.toMatch(/from\s+["'][^"']*server\/lib\/math\/supportSeries/);
    }
  });
});
