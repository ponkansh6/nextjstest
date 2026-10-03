import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type CssRule = {
  selector: string;
  media: string[];
  declarations: Map<string, string>;
};

function skipComment(css: string, index: number): number {
  if (css.slice(index, index + 2) !== "/*") return index;
  const end = css.indexOf("*/", index + 2);
  if (end < 0) throw new Error("Unclosed CSS comment");
  return end + 2;
}

function findRuleBoundary(css: string, start: number): { index: number; delimiter: string } | null {
  let parentheses = 0;
  let quote = "";
  for (let index = start; index < css.length; index += 1) {
    if (css.slice(index, index + 2) === "/*") {
      index = skipComment(css, index) - 1;
      continue;
    }
    const char = css[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") parentheses += 1;
    else if (char === ")") parentheses -= 1;
    else if (parentheses === 0 && (char === "{" || char === ";")) {
      return { index, delimiter: char };
    }
  }
  return null;
}

function findClosingBrace(css: string, open: number): number {
  let depth = 1;
  let quote = "";
  for (let index = open + 1; index < css.length; index += 1) {
    if (css.slice(index, index + 2) === "/*") {
      index = skipComment(css, index) - 1;
      continue;
    }
    const char = css[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return index;
  }
  throw new Error("Unclosed CSS rule");
}

function stripComments(css: string): string {
  let output = "";
  let quote = "";
  for (let index = 0; index < css.length; index += 1) {
    if (!quote && css.slice(index, index + 2) === "/*") {
      const end = css.indexOf("*/", index + 2);
      if (end < 0) throw new Error("Unclosed CSS comment");
      output += " ".repeat(end + 2 - index);
      index = end + 1;
      continue;
    }
    const char = css[index];
    output += char;
    if (quote) {
      if (char === "\\") {
        output += css[index + 1] ?? "";
        index += 1;
      } else if (char === quote) quote = "";
    } else if (char === "'" || char === '"') quote = char;
  }
  return output;
}

function parseDeclarations(source: string): Map<string, string> {
  const body = stripComments(source);
  const declarations = new Map<string, string>();
  let start = 0;
  let parentheses = 0;
  let quote = "";
  const entries: string[] = [];
  for (let index = 0; index <= body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") parentheses += 1;
    else if (char === ")") parentheses -= 1;
    else if ((char === ";" && parentheses === 0) || index === body.length) {
      entries.push(body.slice(start, index));
      start = index + 1;
    }
  }

  for (const entry of entries) {
    const colon = entry.indexOf(":");
    if (colon < 0) continue;
    const property = entry.slice(0, colon).trim();
    const value = entry.slice(colon + 1).trim();
    if (property && value) declarations.set(property, value);
  }
  return declarations;
}

function parseCss(css: string, media: string[] = []): CssRule[] {
  const rules: CssRule[] = [];
  let cursor = 0;
  while (cursor < css.length) {
    while (cursor < css.length) {
      if (/\s/.test(css[cursor])) cursor += 1;
      else if (css.slice(cursor, cursor + 2) === "/*") cursor = skipComment(css, cursor);
      else break;
    }
    if (cursor >= css.length) break;

    const boundary = findRuleBoundary(css, cursor);
    if (!boundary) break;
    const prelude = css.slice(cursor, boundary.index).trim();
    if (boundary.delimiter === ";") {
      cursor = boundary.index + 1;
      continue;
    }

    const close = findClosingBrace(css, boundary.index);
    const body = css.slice(boundary.index + 1, close);
    if (prelude.startsWith("@media ")) {
      rules.push(...parseCss(body, [...media, prelude.slice("@media ".length).trim()]));
    } else if (!prelude.startsWith("@")) {
      rules.push({ selector: prelude, media, declarations: parseDeclarations(body) });
    }
    cursor = close + 1;
  }
  return rules;
}

const cpiChartRules = parseCss(
  readFileSync(resolve(process.cwd(), "src/app/components/CpiChart.module.css"), "utf8"),
);
const pageRules = parseCss(readFileSync(resolve(process.cwd(), "src/app/page.module.css"), "utf8"));

function declaration(
  rules: CssRule[],
  selector: string,
  property: string,
  mediaQuery?: string,
): string | undefined {
  const applicableRules = rules.filter(
    (rule) =>
      rule.selector === selector &&
      (mediaQuery ? rule.media.includes(mediaQuery) : rule.media.length === 0),
  );
  return applicableRules.at(-1)?.declarations.get(property);
}

describe("source CSS layout contracts", () => {
  it("keeps the theme toggle's declared 44px minimum target", () => {
    expect(declaration(cpiChartRules, ".themeToggleButton", "min-width")).toBe("44px");
    expect(declaration(cpiChartRules, ".themeToggleButton", "min-height")).toBe("44px");
  });

  it("keeps compact mobile legend controls at a 2rem minimum height with compact padding", () => {
    expect(declaration(cpiChartRules, ".legendItem", "min-height", "(max-width: 768px)")).toBe(
      "2rem",
    );
    expect(declaration(cpiChartRules, ".legendItem", "padding", "(max-width: 768px)")).toBe(
      "0.375rem 0.5rem",
    );
  });

  it("declares the 44px minimum height for section tabs", () => {
    expect(declaration(cpiChartRules, ".sectionTab", "min-height")).toBe("44px");
  });

  it("declares the section tab scrollbar and right-edge fade styles", () => {
    expect(declaration(cpiChartRules, ".sectionTabsScroll", "scrollbar-width")).toBe("none");
    expect(declaration(cpiChartRules, ".sectionTabsScroll", "mask-image")).toContain(
      "linear-gradient(to right",
    );
    expect(declaration(cpiChartRules, ".sectionTabsScroll", "-webkit-mask-image")).toContain(
      "linear-gradient(to right",
    );
  });

  it("declares the 768/769px boundary and mobile section spacing", () => {
    expect(declaration(pageRules, ".pageWrapper", "padding-top")).toBe("1.5rem");
    expect(declaration(pageRules, ".pageWrapper", "padding-top", "(min-width: 769px)")).toBe(
      "4rem",
    );
    expect(declaration(cpiChartRules, ".chartWrapper", "aspect-ratio")).toBeUndefined();
    expect(declaration(cpiChartRules, ".chartWrapper", "aspect-ratio", "(min-width: 769px)")).toBe(
      "4 / 3",
    );
    expect(
      declaration(
        cpiChartRules,
        "div.chartSection.spendingChartSection",
        "padding-bottom",
        "(max-width: 768px)",
      ),
    ).toBe("calc(2rem + env(safe-area-inset-bottom, 0px))");
  });

  it("keeps sticky tab compositing and non-wrapping legend summary declarations", () => {
    expect(declaration(cpiChartRules, ".sectionTabs", "position")).toBe("sticky");
    expect(declaration(cpiChartRules, ".sectionTabs", "transform")).toBe("translateZ(0)");
    expect(declaration(cpiChartRules, ".legendAccordionSummary", "white-space")).toBe("nowrap");
  });

  it("keeps the base bottom sheet height budget at 60dvh", () => {
    expect(declaration(cpiChartRules, ".bottomSheet", "max-height")).toBe("60dvh");
  });
});
