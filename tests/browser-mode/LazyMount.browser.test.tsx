import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { LazyMount } from "../../src/app/components/LazyMount";
import { renderBrowserComponent } from "./renderBrowserComponent";

function DistantLazyMountFixture() {
  return (
    <>
      <div aria-hidden="true" style={{ height: 1600 }} />
      <LazyMount sectionId="browser-lazy-target" placeholderHeight={300}>
        <div data-testid="lazy-chart-target">mounted chart</div>
      </LazyMount>
    </>
  );
}

describe("LazyMount in Chromium", () => {
  it("p45-b-mobile-ux-192-lazymount-p5-1 P42-349/-350 mounts after scrolling", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DistantLazyMountFixture />);

    const chart = page.getByTestId("lazy-chart-target");
    await expect.element(chart).not.toBeInTheDocument();

    window.scrollTo(0, document.body.scrollHeight);

    await expect.element(chart).toBeInTheDocument();
  });
});
