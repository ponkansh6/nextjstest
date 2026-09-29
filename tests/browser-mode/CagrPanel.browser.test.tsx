import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { CagrPanel } from "../../src/app/components/CagrPanel";
import { useCagrState } from "../../src/hooks/useCagrState";
import type { CpiData } from "../../src/types";
import { renderBrowserComponent } from "./renderBrowserComponent";

const FIXTURE_GLOBAL_CSS = `
  :root { font-size: 16px; }
  *, *::before, *::after { box-sizing: border-box; padding: 0; margin: 0; }
  html { height: 100%; }
  html, body { max-width: 100vw; }
  /* Geist is not loaded for this isolated component fixture; use a system fallback. */
  body {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    font-family: system-ui, Arial, Helvetica, sans-serif;
  }
`;

const ALL_YEARS = Array.from({ length: 21 }, (_, index) => 2005 + index);
const STACKED_KEYS = ["住居"];
const STACKED_HIDDEN_KEYS: string[] = [];
const CHART_DATA: CpiData[] = [
  {
    年月: "2015年1月",
    総合: 100,
    生鮮食品を除く総合: 99,
    持家の帰属家賃を除く総合: 98,
    "消費支出（参考）": null,
    "CPI総合(参考)": 100,
    住居: 200,
  },
  {
    年月: "2020年1月",
    総合: 110,
    生鮮食品を除く総合: 109,
    持家の帰属家賃を除く総合: 108,
    "消費支出（参考）": null,
    "CPI総合(参考)": 110,
    住居: 100,
  },
];

function CagrFixture() {
  const cagr = useCagrState({
    initialStartYear: 2010,
    initialEndYear: 2020,
    chartData: CHART_DATA,
    stackedHiddenKeys: STACKED_HIDDEN_KEYS,
    stackedKeys: STACKED_KEYS,
  });

  return <CagrPanel allYears={ALL_YEARS} {...cagr} />;
}

function CagrFixtureWithGlobalBaseline() {
  return (
    <>
      <style>{FIXTURE_GLOBAL_CSS}</style>
      <CagrFixture />
    </>
  );
}

async function calculateFixtureResult(width: number, height: number) {
  await page.viewport(width, height);
  expect(window.innerWidth).toBe(width);
  expect(window.innerHeight).toBe(height);
  renderBrowserComponent(<CagrFixtureWithGlobalBaseline />);

  await page.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }).click();
  const dialog = page.getByRole("dialog", { name: "年率上昇率（CAGR）" });
  await expect.element(dialog).toBeVisible();

  // The fixture has deterministic 2015 and 2020 observations, so select the
  // available 2015 start year before running the actual hook calculation.
  const startYear = await page.getByLabelText("開始年:").element();
  await userEvent.selectOptions(startYear, "2015");
  await page.getByRole("button", { name: "計算する" }).click();
  await expect.element(dialog.getByText("-12.94%", { exact: true })).toBeVisible();

  return dialog;
}

describe("CagrPanel in Chromium", () => {
  it("closes the actual sheet after clicking its backdrop", async () => {
    await page.viewport(375, 667);
    expect(window.innerWidth).toBe(375);
    expect(window.innerHeight).toBe(667);
    renderBrowserComponent(<CagrFixtureWithGlobalBaseline />);

    await page.getByRole("button", { name: /年率上昇率（CAGR）を計算/ }).click();
    const dialog = page.getByRole("dialog", { name: "年率上昇率（CAGR）" });
    await expect.element(dialog).toBeVisible();

    const backdrop = document.querySelector<HTMLElement>('[class*="bottomSheetBackdrop"]');
    expect(backdrop).not.toBeNull();
    if (!backdrop) throw new Error("Rendered BottomSheet backdrop is unavailable");
    // Preserve the source route case's exact hit point and confirm it targets
    // the live backdrop before dispatching the pointer interaction.
    const hitTarget = document.elementFromPoint(10, 10);
    expect(hitTarget).toBe(backdrop);
    if (!hitTarget) throw new Error("The (10,10) hit point did not resolve to the backdrop");
    await userEvent.click(hitTarget);

    await expect.element(dialog).not.toBeInTheDocument();
  });

  it("fits the calculated result without internal sheet scrolling at 375x667", async () => {
    const dialog = await calculateFixtureResult(375, 667);
    const sheet = await dialog.element();

    expect(sheet.scrollHeight - sheet.clientHeight).toBeLessThanOrEqual(0);
  });

  it("keeps portrait result detail and note inside 375x667", async () => {
    const dialog = await calculateFixtureResult(375, 667);

    const detail = dialog.getByText("2015年01月 → 2020年01月", { exact: true });
    const note = dialog.getByText("※凡例で選択した費目の合計を基準に算出", { exact: true });
    await expect.element(detail).toBeVisible();
    await expect.element(note).toBeVisible();

    const detailBottom = (await detail.element()).getBoundingClientRect().bottom;
    const noteBottom = (await note.element()).getBoundingClientRect().bottom;
    expect(detailBottom).toBeLessThanOrEqual(667);
    expect(noteBottom).toBeLessThanOrEqual(667);
  });

  it("keeps landscape result detail inside 667x375", async () => {
    const dialog = await calculateFixtureResult(667, 375);

    const detail = dialog.getByText("2015年01月 → 2020年01月", { exact: true });
    await expect.element(detail).toBeVisible();

    const detailBottom = (await detail.element()).getBoundingClientRect().bottom;
    expect(detailBottom).toBeLessThanOrEqual(window.innerHeight + 1);
  });
});
