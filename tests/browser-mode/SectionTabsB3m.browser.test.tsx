import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { LazyMount } from "../../src/app/components/LazyMount";
import { SectionTabs } from "../../src/app/components/SectionTabs";
import { useSectionNavigation } from "../../src/hooks/useSectionNavigation";
import { renderBrowserComponent } from "./renderBrowserComponent";

const sections = [
  { id: "section-consumption-nominal", label: "消費(名目)" },
  { id: "section-earnings", label: "給与" },
  { id: "section-new-graph", label: "3種比較" },
];

const BASELINE_CSS = `
  :root { font-size: 16px; }
  *, *::before, *::after { box-sizing: border-box; padding: 0; margin: 0; }
  html, body { max-width: 100vw; min-height: 100%; }
  body { font-family: system-ui, Arial, Helvetica, sans-serif; }
`;

function SectionNavigationFixture({ targetId }: { targetId: string }) {
  const navigation = useSectionNavigation({ sections });
  return (
    <>
      <style>{BASELINE_CSS}</style>
      <SectionTabs
        sections={sections}
        activeId={navigation.activeId}
        onSelect={navigation.handleSelectSection}
        rangeLabel="2005年〜2025年"
        onRangeClick={() => {}}
      />
      <div aria-hidden="true" style={{ height: 1200 }} />
      <section id={targetId} style={{ minHeight: 180, scrollMarginTop: 80 }}>
        section target
      </section>
    </>
  );
}

function LazySectionFixture({ targetId }: { targetId: string }) {
  return (
    <>
      <div aria-hidden="true" style={{ height: 1600 }} />
      <LazyMount sectionId={targetId} placeholderHeight={300}>
        <section id={targetId} data-testid="lazy-section-content">
          mounted section
        </section>
      </LazyMount>
    </>
  );
}

beforeEach(() => {
  window.__MOUNT_ALL__ = false;
});

afterEach(() => {
  window.__MOUNT_ALL__ = false;
});

async function expectComponentScroll(label: string, targetId: string) {
  await page.viewport(375, 800);
  renderBrowserComponent(<SectionNavigationFixture targetId={targetId} />);
  const before = window.scrollY;
  const tab = page.getByRole("button", { name: label, exact: true });
  await expect.element(tab).toBeVisible();
  await userEvent.click(await tab.element());
  await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  expect(window.scrollY).toBeGreaterThan(before);
}

async function expectLazySectionInitiallyAbsent(targetId: string) {
  await page.viewport(375, 800);
  renderBrowserComponent(<LazySectionFixture targetId={targetId} />);
  await expect.element(page.getByTestId("lazy-section-content")).not.toBeInTheDocument();
}

async function renderOverflowingTabs() {
  await page.viewport(375, 800);
  renderBrowserComponent(
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
    </>,
  );
  const container = document.querySelector<HTMLElement>('[class*="sectionTabsScroll"]');
  expect(container).not.toBeNull();
  return container!;
}

describe("B3m SectionTabs", () => {
  it("p45-b-section-tabs-scroll-47-case02-chromium", async () => {
    await expectComponentScroll("給与", "section-earnings");
  });

  it("p45-b-section-tabs-scroll-47-3-chromium", async () => {
    await expectComponentScroll("3種比較", "section-new-graph");
  });

  it("p45-b-section-tabs-scroll-82-case01-chromium", async () => {
    await expectLazySectionInitiallyAbsent("section-consumption-nominal");
  });

  it("p45-b-section-tabs-scroll-82-case02-chromium", async () => {
    await expectLazySectionInitiallyAbsent("section-earnings");
  });

  it("p45-b-section-tabs-scroll-82-3-chromium", async () => {
    await expectLazySectionInitiallyAbsent("section-new-graph");
  });

  it("p45-b-section-tabs-scroll-120-case02-webkit", async () => {
    const container = await renderOverflowingTabs();
    expect(getComputedStyle(container).scrollbarWidth).toBe("none");
  });

  it("p45-b-section-tabs-scroll-127-case02-webkit", async () => {
    const container = await renderOverflowingTabs();
    const before = container.scrollLeft;
    container.scrollLeft = container.scrollWidth;
    expect(container.scrollWidth).toBeGreaterThan(container.clientWidth);
    expect(container.scrollLeft).toBeGreaterThan(before);
  });

  it("p45-b-section-tabs-scroll-142-mask-image-webkit", async () => {
    const container = await renderOverflowingTabs();
    const styles = getComputedStyle(container) as CSSStyleDeclaration & {
      webkitMaskImage?: string;
    };
    expect(styles.maskImage).not.toBe("none");
    expect(styles.webkitMaskImage).not.toBe("none");
  });
});

describe("B3m SectionTabs WebKit", () => {
  it("p45-b-section-tabs-scroll-47-case04-webkit", async () => {
    await expectComponentScroll("消費(名目)", "section-consumption-nominal");
  });

  it("p45-b-section-tabs-scroll-47-case05-webkit", async () => {
    await expectComponentScroll("給与", "section-earnings");
  });

  it("p45-b-section-tabs-scroll-47-3-webkit", async () => {
    await expectComponentScroll("3種比較", "section-new-graph");
  });

  it("p45-b-section-tabs-scroll-82-case04-webkit", async () => {
    await expectLazySectionInitiallyAbsent("section-consumption-nominal");
  });

  it("p45-b-section-tabs-scroll-82-case05-webkit", async () => {
    await expectLazySectionInitiallyAbsent("section-earnings");
  });

  it("p45-b-section-tabs-scroll-82-3-webkit", async () => {
    await expectLazySectionInitiallyAbsent("section-new-graph");
  });
});
