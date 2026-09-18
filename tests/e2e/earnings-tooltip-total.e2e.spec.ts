import { test, expect } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const EARNINGS_SECTION = "#section-earnings";
const TOTAL_LABEL = "給与区分合計（所定内＋所定外＋特別）";
const INCLUDED_KEYS = ["所定内給与", "所定外給与", "特別給与"] as const;
const AUXILIARY_KEYS = [
  "時間当たり給与",
  "15歳以上国民当たり給与",
  "CPI総合(参考)",
  "CTIミクロ基本系列（名目・原数値）",
] as const;
const RAW_KEY = "CTIミクロ基本系列（名目・原数値）";
const EXPECTED_LABELS = [
  "所定内給与",
  "所定外給与",
  "特別給与",
  "時間当たり給与",
  "15歳以上国民当たり給与",
  "物価指数総合(参考)",
  "CTIミクロ基本系列（名目・原数値）",
] as const;

type TooltipRow = {
  key: string | null;
  label: string;
  value: string;
  separator: boolean;
  borderTop: string;
};
type ViewportBox = { x: number; y: number; width: number; height: number };

const earningsSection = (page: Page) => page.locator(EARNINGS_SECTION);

async function hoverFreshEarningsPlot(page: Page, section: Locator) {
  await section.scrollIntoViewIfNeeded();
  const chart = section.locator(".recharts-wrapper").first();
  const plots = chart.locator("path.recharts-area-area:visible, path.recharts-line-curve:visible");
  await expect(plots, "給与の表示中plotが実DOMに存在する").not.toHaveCount(0);

  const viewport = page.viewportSize();
  expect(viewport, "Playwright viewportが取得できる").not.toBeNull();
  if (!viewport) throw new Error("Playwright viewport is unavailable");

  let plotBox: ViewportBox | null = null;
  for (let index = 0; index < (await plots.count()); index += 1) {
    const candidate = await plots.nth(index).boundingBox();
    if (
      candidate &&
      candidate.width > 0 &&
      candidate.height > 0 &&
      candidate.x >= 0 &&
      candidate.y >= 0 &&
      candidate.x + candidate.width <= viewport.width &&
      candidate.y + candidate.height <= viewport.height
    ) {
      plotBox = candidate;
      break;
    }
  }
  expect(plotBox, "表示中plotにviewport内の有効なboundingBoxがある").not.toBeNull();
  if (!plotBox) throw new Error("No actionable earnings plot is fully inside the viewport");

  await page.mouse.move(0, 0);
  await page.mouse.move(plotBox.x + plotBox.width * 0.5, plotBox.y + plotBox.height * 0.45, {
    steps: 8,
  });

  const tooltip = section.locator('[data-tooltip-root="true"]');
  await expect(tooltip, "給与plotのhoverでtooltipが表示される").toBeVisible({ timeout: 5000 });
  return tooltip;
}

async function readTooltip(tooltip: Locator) {
  const rows = await tooltip.locator('[data-tooltip-row="true"]').evaluateAll((elements) =>
    elements.map((element) => {
      const spans = [...element.children].filter((child) => child.tagName === "SPAN");
      return {
        key: element.getAttribute("data-tooltip-key"),
        label: element.getAttribute("data-tooltip-label") ?? spans[1]?.textContent?.trim() ?? "",
        value: spans.at(-1)?.textContent?.trim() ?? "",
        separator: element.getAttribute("data-tooltip-group-separator") === "true",
        borderTop: getComputedStyle(element).borderTopWidth,
      };
    }),
  );
  const total = await tooltip.locator('[data-tooltip-total="true"]').evaluate((element) => {
    const children = [...element.children];
    return {
      label: children[0]?.textContent?.trim() ?? "",
      value: children.at(-1)?.textContent?.trim() ?? "",
    };
  });
  return {
    period: (await tooltip.locator("p").first().textContent())?.trim() ?? "",
    rows: rows as TooltipRow[],
    total,
  };
}

async function assertRawSeriesContract(
  section: Locator,
  evidence: Awaited<ReturnType<typeof readTooltip>>,
) {
  const rawRow = evidence.rows.find((row) => row.key === RAW_KEY);
  expect(rawRow?.label).toBe(RAW_KEY);
  expect(rawRow?.value).toMatch(/^\d+\.\d{2}$/);

  const descriptors = JSON.parse(
    (await section
      .locator('[data-testid="chart-data-contract"]')
      .getAttribute("data-descriptors")) ?? "[]",
  ) as Array<Record<string, unknown>>;
  expect(descriptors.find((descriptor) => descriptor.key === RAW_KEY)).toMatchObject({
    key: RAW_KEY,
    label: RAW_KEY,
    unit: "指数",
    source: "Plan37 official CSV",
    valueType: "raw",
    status: "valid",
    reason: null,
  });

  const contractValue = await section
    .locator(
      `[data-testid="chart-data-contract"] [data-chart-data-row][data-period="${evidence.period}"] [data-series-key="${RAW_KEY}"]`,
    )
    .getAttribute("data-value");
  expect(contractValue).not.toBeNull();
  expect(Number(rawRow?.value)).toBeCloseTo(Number(contractValue), 2);
}

function displayedSum(rows: TooltipRow[], keys: readonly string[]) {
  return Number(
    rows
      .filter((row) => keys.includes(row.key ?? ""))
      .map((row) => Number(row.value))
      .filter(Number.isFinite)
      .reduce((sum, value) => sum + value, 0)
      .toFixed(2),
  );
}

test.describe("給与tooltipの区分合計 desktop E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("6系列とdesktop合計を表示し、補助系列を合計から除外する", async ({ page }) => {
    const section = earningsSection(page);
    await expect(section).toBeVisible({ timeout: 15000 });
    const tooltip = await hoverFreshEarningsPlot(page, section);
    const evidence = await readTooltip(tooltip);

    expect(evidence.rows.map((row) => row.key)).toEqual([...INCLUDED_KEYS, ...AUXILIARY_KEYS]);
    expect(evidence.rows.map((row) => row.label)).toEqual([...EXPECTED_LABELS]);
    expect(evidence.rows).toHaveLength(7);
    expect(evidence.rows.filter((row) => row.separator)).toHaveLength(1);
    expect(evidence.rows.find((row) => row.separator)?.key).toBe("時間当たり給与");
    expect(evidence.rows.find((row) => row.separator)?.borderTop).not.toBe("0px");
    expect(evidence.total.label).toBe(TOTAL_LABEL);
    expect(Number(evidence.total.value)).toBe(displayedSum(evidence.rows, INCLUDED_KEYS));
    expect(Number(evidence.total.value)).not.toBe(
      displayedSum(evidence.rows, [...INCLUDED_KEYS, ...AUXILIARY_KEYS]),
    );
    await assertRawSeriesContract(section, evidence);
  });

  test("対象系列をlegendでhiddenにした後も再hoverでき、合計を残り2系列で再計算する", async ({
    page,
  }) => {
    const section = earningsSection(page);
    await expect(section).toBeVisible({ timeout: 15000 });
    const initialTooltip = await hoverFreshEarningsPlot(page, section);
    const initialEvidence = await readTooltip(initialTooltip);
    const hiddenKey = INCLUDED_KEYS[0];
    const legendButton = section.getByTestId(`legend-${hiddenKey}`);

    await legendButton.click();
    await expect(legendButton).toHaveAttribute("aria-pressed", "false");

    const freshTooltip = await hoverFreshEarningsPlot(page, section);
    const freshEvidence = await readTooltip(freshTooltip);
    expect(freshEvidence.rows.map((row) => row.key)).toEqual([
      ...INCLUDED_KEYS.slice(1),
      ...AUXILIARY_KEYS,
    ]);
    expect(freshEvidence.rows).toHaveLength(6);
    expect(freshEvidence.rows.filter((row) => row.separator)).toHaveLength(1);
    expect(freshEvidence.rows.find((row) => row.separator)?.key).toBe("時間当たり給与");
    expect(freshEvidence.rows.find((row) => row.separator)?.borderTop).not.toBe("0px");
    expect(freshEvidence.rows.some((row) => row.key === hiddenKey)).toBe(false);
    expect(freshEvidence.total.label).toBe(TOTAL_LABEL);
    expect(Number(freshEvidence.total.value)).toBe(
      displayedSum(freshEvidence.rows, INCLUDED_KEYS.slice(1)),
    );
    expect(Number(freshEvidence.total.value)).not.toBe(
      displayedSum(freshEvidence.rows, [...INCLUDED_KEYS.slice(1), ...AUXILIARY_KEYS]),
    );
    expect(Number(initialEvidence.total.value)).not.toBe(Number(freshEvidence.total.value));
    await assertRawSeriesContract(section, freshEvidence);
  });
});
