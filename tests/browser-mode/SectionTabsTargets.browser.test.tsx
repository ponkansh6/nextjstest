import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ChartFilters } from "../../src/app/components/ChartFilters";
import { SectionTabs } from "../../src/app/components/SectionTabs";
import { renderBrowserComponent } from "./renderBrowserComponent";

const BASELINE_CSS = `
  :root { font-size: 16px; }
  *, *::before, *::after { box-sizing: border-box; padding: 0; margin: 0; }
  html, body { max-width: 100vw; min-height: 100%; }
  body { font-family: system-ui, Arial, Helvetica, sans-serif; }
`;

function MobileSectionTabsFixture() {
  return (
    <>
      <style>{BASELINE_CSS}</style>
      <SectionTabs
        sections={[
          { id: "stacked", label: "費目別" },
          { id: "earnings", label: "給与" },
          { id: "comparison", label: "3種比較" },
        ]}
        activeId="stacked"
        onSelect={() => {}}
        rangeLabel="2005年〜2025年"
        onRangeClick={() => {}}
      />
    </>
  );
}

function OverflowingSectionTabsFixture() {
  return (
    <>
      <style>{BASELINE_CSS}</style>
      <SectionTabs
        sections={[
          { id: "overview", label: "概要" },
          { id: "consumption", label: "消費支出" },
          { id: "food", label: "食料" },
          { id: "housing", label: "住居" },
          { id: "utilities", label: "光熱・水道" },
          { id: "clothing", label: "被服及び履物" },
          { id: "health", label: "保健医療" },
          { id: "education", label: "教育" },
        ]}
        activeId="overview"
        onSelect={() => {}}
        rangeLabel="2005年〜2025年"
        onRangeClick={() => {}}
      />
    </>
  );
}

async function renderOverflowingSectionTabs() {
  await page.viewport(375, 800);
  expect(window.innerWidth).toBe(375);
  renderBrowserComponent(<OverflowingSectionTabsFixture />);
  const scrollContainer = document.querySelector('[class*="sectionTabsScroll"]');
  expect(scrollContainer).not.toBeNull();
  return scrollContainer as HTMLDivElement;
}

function MobileSectionTabsAndFiltersFixture() {
  return (
    <>
      <style>{BASELINE_CSS}</style>
      <SectionTabs
        sections={[{ id: "stacked", label: "費目別" }]}
        activeId="stacked"
        onSelect={() => {}}
        rangeLabel="2005年〜2025年"
        onRangeClick={() => {}}
      />
      <ChartFilters
        allYears={[2005, 2017, 2018, 2025]}
        startYear={2005}
        endYear={2025}
        setStartYear={() => {}}
        setEndYear={() => {}}
      />
    </>
  );
}

async function renderMobileFilters() {
  await page.viewport(375, 667);
  expect(window.innerWidth).toBe(375);
  renderBrowserComponent(<MobileSectionTabsAndFiltersFixture />);

  const startYear = page.getByLabelText("開始年:");
  const endYear = page.getByLabelText("終了年:");
  const maxButton = page.getByRole("button", { name: "最大期間", exact: true });
  await expect.element(startYear).toBeVisible();
  await expect.element(endYear).toBeVisible();
  await expect.element(maxButton).toBeVisible();
  return {
    startBox: (await startYear.element()).getBoundingClientRect(),
    endBox: (await endYear.element()).getBoundingClientRect(),
    buttonBox: (await maxButton.element()).getBoundingClientRect(),
  };
}

describe("mobile SectionTabs and ChartFilters geometry in Chromium", () => {
  it("p45-b-mobile-ux-112-ux-375px-select — P42-336–338: keeps start and end selects nearly equal in width", async () => {
    const { startBox, endBox } = await renderMobileFilters();

    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    expect(Math.abs(startBox.width - endBox.width)).toBeLessThanOrEqual(4);
  });

  it("p45-b-mobile-ux-140-ux-375px-3 — P42-342–348: aligns both selects and max-range control", async () => {
    const { startBox, endBox, buttonBox } = await renderMobileFilters();

    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(Math.abs(startBox.y - endBox.y)).toBeLessThan(15);
    expect(Math.abs(endBox.y - buttonBox.y)).toBeLessThan(15);
    expect(startBox.x).toBeLessThan(endBox.x);
    expect(endBox.x + endBox.width).toBeLessThanOrEqual(buttonBox.x + 10);
  });

  it("p45-b-mobile-ux-79-ux-375px-select — P42-329–333: keeps max range to the right of end year on the same row", async () => {
    const { endBox, buttonBox } = await renderMobileFilters();

    expect(endBox).not.toBeNull();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox.x).toBeGreaterThanOrEqual(endBox.x + endBox.width - 1);
    const verticalDiff = Math.abs(endBox.y - buttonBox.y);
    const maxAllowedVerticalDiff = Math.min(endBox.height, buttonBox.height) * 0.5;
    expect(verticalDiff).toBeLessThan(maxAllowedVerticalDiff);
    expect(buttonBox.x + buttonBox.width).toBeGreaterThan(endBox.x + endBox.width);
  });
});

describe("mobile SectionTabs tap targets in Chromium", () => {
  it("p45-b-mobile-ux-19-ux — P42-323/-324: renders actual section controls meeting the 44px target", async () => {
    await page.viewport(375, 667);
    expect(window.innerWidth).toBe(375);
    renderBrowserComponent(<MobileSectionTabsFixture />);

    const buttons = await page.getByRole("button").all();
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const bounds = (await button.element()).getBoundingClientRect();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("SectionTabs section navigation in Chromium", () => {
  it("p45-b-section-tabs-scroll-47-case01-chromium — P42-501/-502: clicking a tab scrolls its real target into view", async () => {
    await page.viewport(800, 600);
    renderBrowserComponent(
      <>
        <style>{BASELINE_CSS}</style>
        <SectionTabs
          sections={[{ id: "consumption-nominal-target", label: "消費(名目)" }]}
          activeId="other"
          onSelect={(id) =>
            document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "start" })
          }
          rangeLabel="2005年〜2025年"
          onRangeClick={() => {}}
        />
        <div aria-hidden="true" style={{ height: 1000 }} />
        <section
          id="consumption-nominal-target"
          style={{ minHeight: 180, padding: 16, border: "1px solid #64748b" }}
        >
          消費（名目）セクション
        </section>
      </>,
    );

    const before = window.scrollY;
    const tab = page.getByRole("button", { name: "消費(名目)", exact: true });
    await expect.element(tab).toBeVisible();
    await userEvent.click(await tab.element());

    const target = document.getElementById("consumption-nominal-target");
    expect(target).not.toBeNull();
    expect(window.scrollY).toBeGreaterThan(before);
    const bounds = target!.getBoundingClientRect();
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
  });
});

describe("SectionTabs horizontal overflow in Chromium", () => {
  it("p45-b-section-tabs-scroll-120-case01-chromium — P42-505: hides the native scrollbar", async () => {
    const scrollContainer = await renderOverflowingSectionTabs();

    expect(getComputedStyle(scrollContainer).scrollbarWidth).toBe("none");
  });

  it("p45-b-section-tabs-scroll-127-case01-chromium — P42-506/-507: remains horizontally scrollable", async () => {
    const scrollContainer = await renderOverflowingSectionTabs();
    const before = scrollContainer.scrollLeft;
    scrollContainer.scrollLeft = scrollContainer.scrollWidth;

    expect(scrollContainer.scrollWidth).toBeGreaterThan(scrollContainer.clientWidth);
    expect(scrollContainer.scrollLeft).toBeGreaterThan(before);
  });

  it("p45-b-section-tabs-scroll-142-mask-image-chromium — P42-508/-509: applies the right-edge fade", async () => {
    const scrollContainer = await renderOverflowingSectionTabs();
    const styles = getComputedStyle(scrollContainer);

    expect(styles.maskImage).not.toBe("none");
    expect((styles as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage).not.toBe(
      "none",
    );
  });
});
