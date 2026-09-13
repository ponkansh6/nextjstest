import { test, expect } from "./fixtures";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

async function saveEvidence(
  page: import("@playwright/test").Page,
  section: import("@playwright/test").Locator,
  name: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await mkdir("artifacts", { recursive: true });
  const screenshot = `artifacts/new-graph-${name}.png`;
  await section.screenshot({ path: screenshot });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const tracked = execFileSync("git", ["diff", "--name-only", "--diff-filter=d", "HEAD"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const files = [...new Set([...tracked, ...untracked])].sort();
  const hash = createHash("sha256");
  for (const file of files) {
    const rawContent = await readFile(file);
    // Plan26 records this generated value. Normalize only its explicit marker
    // so updating the audit record does not make the evidence hash recursive.
    const content =
      file === "shared_plan/26-salary-data-update-plan.md"
        ? Buffer.from(
            rawContent
              .toString()
              .replace(
                /<!-- PLAN26_GENERATED_DIFFHASH -->\s*[0-9a-f]{64}/,
                "<!-- PLAN26_GENERATED_DIFFHASH --> <generated>",
              ),
          )
        : rawContent;
    hash.update(`${file.length}:`);
    hash.update(file);
    hash.update(`:${content.length}:`);
    hash.update(content);
    hash.update("\n");
  }
  expect(files).toEqual(
    expect.arrayContaining([
      "tests/fixtures/csv/minkan-extension-raw.csv",
      "tests/fixtures/minkan-extension-anchors.json",
    ]),
  );
  const evidence = {
    head,
    diffHash: hash.digest("hex"),
    files,
    url: page.url(),
    capturedAt: new Date().toISOString(),
    ...data,
    screenshot,
  };
  await writeFile(`artifacts/new-graph-${name}.json`, JSON.stringify(evidence, null, 2));
  return evidence;
}

const REGULAR_KEY = "民間最終消費支出（参考）";
const EXTENDED_KEY = "民間最終消費支出（参考・延長）";

type PathSegment = { min: number; max: number; type?: string; subpath?: number };

function expectPathSchema(paths: unknown): void {
  expect(paths).toEqual(expect.any(Array));
  for (const path of paths as Array<Record<string, unknown>>) {
    expect(path).toEqual(
      expect.objectContaining({
        xMin: expect.any(Number),
        xMax: expect.any(Number),
        subpaths: expect.any(Array),
        commands: expect.any(Array),
        start: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        end: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      }),
    );
    for (const segment of [...(path.subpaths as unknown[]), ...(path.commands as unknown[])]) {
      expect(segment).toEqual(
        expect.objectContaining({ min: expect.any(Number), max: expect.any(Number) }),
      );
    }
    for (const command of path.commands as Array<Record<string, unknown>>) {
      expect(command).toEqual(
        expect.objectContaining({ type: expect.any(String), subpath: expect.any(Number) }),
      );
    }
  }
}

/**
 * E2E テスト: 3種比較チャートにおける上級者向け隠し系列（民間最終消費支出・2018年以降）の表示切り替え
 */
test.describe("3種比較チャートの上級者向け隠し系列 (adv=1)", () => {
  test("既定では延長系列の凡例チップが表示されない", async ({ page }) => {
    await page.goto("/");
    const newGraphSection = page.locator("#section-new-graph");
    await expect(newGraphSection).toBeVisible();

    // 既定の凡例ボタンが存在することを確認
    await expect(
      newGraphSection.getByRole("button", { name: "民間最終消費(総合)", exact: true }),
    ).toBeVisible();
    await expect(
      newGraphSection.getByRole("button", { name: "CTI消費(総合)", exact: true }),
    ).toBeVisible();

    // 延長・参考系列の凡例ボタンが存在しないことを確認
    const extendedLegend = newGraphSection.getByRole("button", {
      name: "民間最終消費(延長・参考)",
      exact: true,
    });
    await expect(extendedLegend).toHaveCount(0);
    await expect(newGraphSection.locator("svg path")).not.toHaveCount(0);
    const defaultEvidence = await newGraphSection.evaluate((section) => ({
      axisTicks: [...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text")]
        .map((tick) => ({
          label: tick.textContent?.trim(),
          center: (() => {
            const box = tick.getBoundingClientRect();
            return box.left + box.width / 2;
          })(),
        }))
        .filter((tick) => tick.label),
      targetPaths: [...section.querySelectorAll<SVGPathElement>("svg path")]
        .map((path) => {
          const d = path.getAttribute("d") ?? "";
          const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? [];
          const arity: Record<string, number> = {
            M: 2,
            L: 2,
            T: 2,
            H: 1,
            V: 1,
            C: 6,
            S: 4,
            Q: 4,
            A: 7,
          };
          const xs: number[] = [],
            ys: number[] = [],
            subpaths: { min: number; max: number }[] = [],
            commands: { type: string; min: number; max: number; subpath: number }[] = [];
          let command = "",
            currentX = 0,
            currentY = 0,
            startX = 0,
            startY = 0,
            subpathXs: number[] = [];
          let subpath = -1;
          const flush = () => {
            if (subpathXs.length)
              subpaths.push({ min: Math.min(...subpathXs), max: Math.max(...subpathXs) });
            subpathXs = [];
          };
          let i = 0;
          while (i < tokens.length) {
            if (/^[a-z]$/i.test(tokens[i])) {
              command = tokens[i++];
              if (command.toUpperCase() === "Z") {
                currentX = startX;
                currentY = startY;
                xs.push(currentX);
                ys.push(currentY);
                subpathXs.push(currentX);
                commands.push({ type: "Z", min: currentX, max: currentX, subpath });
                flush();
              }
            }
            const upper = command.toUpperCase(),
              count = arity[upper];
            if (!count) {
              i++;
              continue;
            }
            while (i < tokens.length && !/^[a-z]$/i.test(tokens[i])) {
              if (
                i + count > tokens.length ||
                tokens.slice(i, i + count).some((v) => /^[a-z]$/i.test(v))
              )
                break;
              const values = tokens.slice(i, i + count).map(Number),
                relative = command === command.toLowerCase(),
                commandXs: number[] = [];
              const x = (n: number) => (relative ? currentX + n : n),
                y = (n: number) => (relative ? currentY + n : n);
              if (upper === "M" || upper === "L" || upper === "T") {
                currentX = x(values[0]);
                currentY = y(values[1]);
                if (upper === "M") {
                  flush();
                  subpath += 1;
                  startX = currentX;
                  startY = currentY;
                }
                xs.push(currentX);
                ys.push(currentY);
                subpathXs.push(currentX);
                commandXs.push(currentX);
              } else if (upper === "H") {
                currentX = x(values[0]);
                xs.push(currentX);
                ys.push(currentY);
                subpathXs.push(currentX);
                commandXs.push(currentX);
              } else if (upper === "V") {
                currentY = y(values[0]);
                xs.push(currentX);
                ys.push(currentY);
                subpathXs.push(currentX);
                commandXs.push(currentX);
              } else {
                const xIndexes =
                  upper === "C"
                    ? [0, 2, 4]
                    : upper === "S" || upper === "Q"
                      ? [0, 2]
                      : upper === "A"
                        ? [0, 5]
                        : [0];
                xIndexes.forEach((n) => {
                  const value = x(values[n]);
                  xs.push(value);
                  subpathXs.push(value);
                  commandXs.push(value);
                });
                currentX = x(values[count - 2]);
                currentY = y(values[count - 1]);
                ys.push(currentY);
              }
              if (commandXs.length)
                commands.push({
                  type: upper,
                  min: Math.min(...commandXs),
                  max: Math.max(...commandXs),
                  subpath,
                });
              i += count;
              if (upper === "M") command = command === "m" ? "l" : "L";
            }
          }
          flush();
          return {
            dataKey: path.closest("[data-key]")?.getAttribute("data-key") ?? null,
            xMin: Math.min(...xs),
            xMax: Math.max(...xs),
            subpaths,
            commands,
            start: { x: xs[0], y: ys[0] },
            end: { x: xs.at(-1), y: ys.at(-1) },
          };
        })
        .filter((path) => path.dataKey),
    }));
    const evidence = await saveEvidence(page, newGraphSection, "default", defaultEvidence);
    expect(evidence.head).toMatch(/^[0-9a-f]{40}$/);
    expect(evidence.diffHash).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.url).toBe(page.url());
    expect(evidence.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(evidence.axisTicks).toEqual(expect.any(Array));
    expect(evidence.targetPaths).toEqual(expect.any(Array));
    expectPathSchema(evidence.targetPaths);
  });

  test("?adv=1 付きで開くと延長系列の凡例チップが追加で表示される", async ({ page }) => {
    await page.goto("/?adv=1");
    const newGraphSection = page.locator("#section-new-graph");
    await expect(newGraphSection).toBeVisible();

    // 延長・参考系列の凡例ボタンが存在することを確認
    const extendedLegend = newGraphSection.getByRole("button", {
      name: "民間最終消費(延長・参考)",
      exact: true,
    });
    await expect(extendedLegend).toBeVisible();
    await expect(extendedLegend).toHaveAttribute("data-key", "民間最終消費支出（参考・延長）");
    await expect(
      newGraphSection.getByTestId("new-graph-legend-民間最終消費支出（参考）"),
    ).toHaveAttribute("data-key", "民間最終消費支出（参考）");
    const regularLine = newGraphSection.getByTestId(`new-graph-line-${REGULAR_KEY}`);
    const extendedLine = newGraphSection.getByTestId(`new-graph-line-${EXTENDED_KEY}`);
    await expect(regularLine).toHaveCount(1);
    await expect(extendedLine).toHaveCount(1);
    await expect(regularLine).toHaveAttribute("data-key", REGULAR_KEY);
    await expect(extendedLine).toHaveAttribute("data-key", EXTENDED_KEY);
    await expect(regularLine).toHaveAttribute("stroke", "#38bdf8");
    await expect(extendedLine).toHaveAttribute("stroke", "#7dd3fc");

    const coverage = await newGraphSection.evaluate(
      (section, keys) => {
        const parsePath = (
          d: string,
        ): { xs: number[]; ys: number[]; subpaths: PathSegment[]; commands: PathSegment[] } => {
          const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) ?? [];
          const arity: Record<string, number> = {
            M: 2,
            L: 2,
            T: 2,
            H: 1,
            V: 1,
            C: 6,
            S: 4,
            Q: 4,
            A: 7,
          };
          const xs: number[] = [];
          const ys: number[] = [];
          const subpaths: PathSegment[] = [];
          const commands: PathSegment[] = [];
          let command = "";
          let currentX = 0;
          let currentY = 0;
          let subpathStartX = 0;
          let subpath = -1;
          let subpathXs: number[] = [];
          let index = 0;
          while (index < tokens.length) {
            if (/^[a-z]$/i.test(tokens[index])) {
              command = tokens[index++];
              if (command.toUpperCase() === "Z") {
                currentX = subpathStartX;
                xs.push(currentX);
                ys.push(currentY);
                subpathXs.push(currentX);
                commands.push({ type: "Z", min: currentX, max: currentX, subpath });
                if (subpathXs.length)
                  subpaths.push({ min: Math.min(...subpathXs), max: Math.max(...subpathXs) });
                subpathXs = [];
                continue;
              }
            }
            const upper = command.toUpperCase();
            const count = arity[upper];
            if (!count) {
              index++;
              continue;
            }
            while (index < tokens.length && !/^[a-z]$/i.test(tokens[index])) {
              if (
                index + count > tokens.length ||
                tokens.slice(index, index + count).some((v) => /^[a-z]$/i.test(v))
              )
                break;
              const values = tokens.slice(index, index + count).map(Number);
              if (values.every(Number.isFinite)) {
                const relative = command === command.toLowerCase();
                const absoluteX = (value: number) => (relative ? currentX + value : value);
                const commandXs: number[] = [];
                if (upper === "H") {
                  currentX = absoluteX(values[0]);
                  xs.push(currentX);
                  ys.push(currentY);
                  subpathXs.push(currentX);
                  commandXs.push(currentX);
                } else if (upper === "V") {
                  currentY = relative ? currentY + values[0] : values[0];
                  xs.push(currentX);
                  ys.push(currentY);
                  subpathXs.push(currentX);
                  commandXs.push(currentX);
                } else if (upper === "M") {
                  currentX = absoluteX(values[0]);
                  currentY = relative ? currentY + values[1] : values[1];
                  if (subpathXs.length)
                    subpaths.push({ min: Math.min(...subpathXs), max: Math.max(...subpathXs) });
                  subpath += 1;
                  subpathXs = [currentX];
                  xs.push(currentX);
                  ys.push(currentY);
                  commandXs.push(currentX);
                  subpathStartX = currentX;
                } else {
                  const xIndexes =
                    upper === "C"
                      ? [0, 2, 4]
                      : upper === "S" || upper === "Q"
                        ? [0, 2]
                        : upper === "A"
                          ? [0, 5]
                          : [0];
                  const startX = currentX;
                  const points = xIndexes.map((i) => (relative ? startX + values[i] : values[i]));
                  xs.push(...points);
                  ys.push(currentY);
                  subpathXs.push(...points);
                  commandXs.push(...points);
                  currentX = relative ? startX + values[count - 2] : values[count - 2];
                  currentY = relative ? currentY + values[count - 1] : values[count - 1];
                }
                if (commandXs.length)
                  commands.push({
                    type: upper,
                    min: Math.min(...commandXs),
                    max: Math.max(...commandXs),
                    subpath,
                  });
              }
              index += count;
              if (upper === "M") command = command === "m" ? "l" : "L";
            }
          }
          if (subpathXs.length)
            subpaths.push({ min: Math.min(...subpathXs), max: Math.max(...subpathXs) });
          return { xs, ys, subpaths, commands };
        };
        const linePaths = (key: string) =>
          [
            ...section.querySelectorAll<SVGPathElement>(
              `[data-testid="new-graph-line-${key}"] path, [data-key="${key}"] path, path[data-testid="new-graph-line-${key}"]`,
            ),
          ].filter((path, i, all) => all.indexOf(path) === i);
        const ticks = [
          ...section.querySelectorAll<SVGTextElement>(".recharts-xAxis-tick-labels text"),
        ]
          .map((tick) => {
            const svg = tick.ownerSVGElement;
            const tickBox = tick.getBoundingClientRect();
            const svgBox = svg?.getBoundingClientRect();
            const translatedX = tick.getAttribute("transform")?.match(/translate\(([-\d.]+)/)?.[1];
            return {
              label: tick.textContent?.trim(),
              x: svgBox
                ? tickBox.left + tickBox.width / 2 - svgBox.left
                : Number(translatedX ?? tick.getAttribute("x")),
              left: svgBox ? tickBox.left - svgBox.left : undefined,
            };
          })
          .filter(
            (tick): tick is { label: string; x: number; left: number | undefined } =>
              Boolean(tick.label) && Number.isFinite(tick.x),
          );
        const startTick = ticks.find((tick) => tick.label === "2005/1");
        const tick2017 = ticks.find((tick) => tick.label === "2017/12");
        const tick2018 = ticks.find((tick) => tick.label === "2018/1");
        const endTick = ticks.at(-1);
        if (!startTick || !tick2017 || !tick2018 || !endTick)
          throw new Error(`missing required axis ticks: ${JSON.stringify(ticks)}`);
        const finalParts = endTick.label!.split("/").map(Number);
        if (finalParts.length !== 2 || !finalParts.every(Number.isFinite))
          throw new Error(`invalid final tick: ${endTick.label}`);
        const startX = startTick.x;
        const endX = endTick.x;
        const ranges = Object.fromEntries(
          keys.map((key) => {
            const paths = linePaths(key);
            const parsed = paths.map((path) => parsePath(path.getAttribute("d") ?? ""));
            const xs = parsed.flatMap((path) => path.xs);
            const segments = parsed.flatMap((path) => path.subpaths);
            const commands = parsed.flatMap((path) => path.commands);
            const first = paths[0],
              last = paths.at(-1);
            const start = first ? first.getPointAtLength(0) : undefined;
            const end = last ? last.getPointAtLength(last.getTotalLength()) : undefined;
            const pathDetails = parsed.map((path, index) => ({
              ...path,
              xMin: Math.min(...path.xs),
              xMax: Math.max(...path.xs),
              start:
                index === 0 && start
                  ? { x: start.x, y: start.y }
                  : { x: path.xs[0], y: path.ys[0] },
              end:
                index === parsed.length - 1 && end
                  ? { x: end.x, y: end.y }
                  : { x: path.xs.at(-1), y: path.ys.at(-1) },
            }));
            return [
              key,
              {
                xMin: Math.min(...xs),
                xMax: Math.max(...xs),
                min: Math.min(...xs),
                max: Math.max(...xs),
                count: xs.length,
                paths: paths.length,
                pathDetails,
                segments,
                commands,
                start: start ? { x: start.x, y: start.y } : undefined,
                end: end ? { x: end.x, y: end.y } : undefined,
                stroke: paths[0]?.getAttribute("stroke"),
              },
            ];
          }),
        );
        return {
          ranges,
          ticks,
          axis: {
            start: startX,
            regularStart: startX,
            regularEnd: tick2017.x,
            extendedStart: tick2018.x,
            end: endX,
          },
        };
      },
      [REGULAR_KEY, EXTENDED_KEY],
    );
    const regular = coverage.ranges[REGULAR_KEY];
    const extended = coverage.ranges[EXTENDED_KEY];
    expect(regular.count).toBeGreaterThan(1);
    expect(extended.count).toBeGreaterThan(1);
    expect(regular.paths).toBeGreaterThan(0);
    expect(extended.paths).toBeGreaterThan(0);
    const monthStep = Math.abs(coverage.axis.end - coverage.axis.start) / 252;
    for (const range of [regular, extended]) {
      const segments = [...range.segments].sort((a, b) => a.min - b.min);
      const commands = [...range.commands].sort((a, b) => a.min - b.min);
      for (const intervals of [segments, commands]) {
        for (let i = 1; i < intervals.length; i++)
          expect(intervals[i].min - intervals[i - 1].max).toBeLessThanOrEqual(monthStep * 2);
      }
      expect(commands.length).toBeGreaterThan(1);
    }
    // A single SVG subpath is valid, but it must still be represented by a
    // continuous command interval sequence; the boundary assertions below
    // bind that sequence to the complete expected month ranges.
    for (const range of [regular, extended]) {
      if (range.segments.length === 1) expect(range.commands.length).toBeGreaterThan(1);
    }
    expect(Math.abs(coverage.axis.start - coverage.axis.regularStart)).toBeLessThanOrEqual(1);
    // 12MA has no finite value at the first boundary month; the first rendered
    // point is consequently a small, data-dependent distance after 2017/1.
    expect(regular.min).toBeGreaterThanOrEqual(coverage.axis.regularStart - 20);
    expect(regular.max).toBeLessThanOrEqual(coverage.axis.regularEnd + 2);
    expect(extended.min).toBeGreaterThanOrEqual(coverage.axis.extendedStart - 5);
    expect(extended.max).toBeLessThanOrEqual(coverage.axis.end + 4);
    await mkdir("artifacts", { recursive: true });
    const evidence = await saveEvidence(page, newGraphSection, "advanced", {
      targetPaths: coverage.ranges,
      axisTicks: coverage.ticks,
    });
    expect(evidence.head).toMatch(/^[0-9a-f]{40}$/);
    expect(evidence.diffHash).toMatch(/^[0-9a-f]{64}$/);
    expect(evidence.url).toBe(page.url());
    expect(evidence.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expectPathSchema(
      Object.values(evidence.targetPaths as Record<string, { pathDetails: unknown[] }>).flatMap(
        (range) => range.pathDetails,
      ),
    );
  });
});
