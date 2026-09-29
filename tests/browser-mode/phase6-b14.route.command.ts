import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";
import { desktop1280x800ContextOptions, withIsolatedContext } from "./isolated-route-context";
import { NEXT_ROUTE_POC_BASE_URL } from "./next-route-poc.constants";

export type Phase6B14Id =
  | "dark-hover-contrast"
  | "space-toggle"
  | "keyboard-focus"
  | "reduced-motion";

type PageEvidence = { status: number | null; networkIdle: boolean; headingVisible: boolean };

async function visit(
  page: import("@playwright/test").Page,
  id: Phase6B14Id,
): Promise<PageEvidence> {
  await page.addInitScript(() => {
    (window as Window & { __MOUNT_ALL__?: boolean }).__MOUNT_ALL__ = true;
  });
  if (id === "dark-hover-contrast") {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  }
  const response = await page.goto(`${NEXT_ROUTE_POC_BASE_URL}/`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 });
  const heading = page.getByRole("heading", { level: 1, name: "物価・賃金・消費の推移" });
  await heading.waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#section-stacked").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByTestId("legend-住居").waitFor({ state: "visible", timeout: 20_000 });
  return {
    status: response?.status() ?? null,
    networkIdle: true,
    headingVisible: await heading.isVisible(),
  };
}

function contrastRatio(foreground: string, background: string): number {
  const channels = (color: string) => {
    const matches = color.match(/[\d.]+/g);
    if (!matches || matches.length < 3) throw new Error(`Unexpected computed color: ${color}`);
    return matches.slice(0, 3).map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  const [lighter, darker] = [luminance(channels(foreground)), luminance(channels(background))].sort(
    (a, b) => b - a,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

function durationMs(value: string): number[] {
  return value.split(",").map((item) => {
    const duration = item.trim();
    const amount = Number.parseFloat(duration);
    if (!Number.isFinite(amount)) throw new Error(`Unexpected computed duration: ${duration}`);
    return duration.endsWith("ms") ? amount : amount * 1000;
  });
}

export const inspectPhase6B14: BrowserCommand<[id: Phase6B14Id], unknown> = async (
  { context, provider },
  id,
) => {
  if (provider.name !== "playwright")
    throw new Error(`Requires Playwright provider; received ${provider.name}`);
  const browser = context.browser();
  if (!browser) throw new Error("Playwright Browser is unavailable");
  return withIsolatedContext(
    browser,
    desktop1280x800ContextOptions({
      ...(id === "dark-hover-contrast" ? { colorScheme: "dark" as const } : {}),
      ...(id === "reduced-motion" ? { reducedMotion: "reduce" as const } : {}),
    }),
    async (isolated) => {
      const page = await isolated.newPage();
      const route = await visit(page, id);
      if (id === "dark-hover-contrast") {
        const section = page.locator("#section-stacked");
        const legend = section.getByTestId("legend-住居");
        await legend.scrollIntoViewIfNeeded();
        await legend.waitFor({ state: "visible", timeout: 15_000 });
        const colors = await legend.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            theme: document.documentElement.getAttribute("data-theme"),
            color: style.color,
            background: style.backgroundColor,
            transformBeforeHover: style.transform,
          };
        });
        await legend.hover();
        const transformWhileHovered = await legend.evaluate(
          (element) => getComputedStyle(element).transform,
        );
        await page.mouse.move(5, 5);
        await page.waitForFunction(
          (button) => getComputedStyle(button).transform === "none",
          await legend.elementHandle(),
        );
        const transformAfterHover = await legend.evaluate(
          (element) => getComputedStyle(element).transform,
        );
        const ratio = contrastRatio(colors.color, colors.background);
        return {
          id,
          route,
          colors,
          contrastRatio: ratio,
          transformWhileHovered,
          transformAfterHover,
        };
      }

      const legend = page.locator("#section-stacked").getByTestId("legend-住居");
      await legend.scrollIntoViewIfNeeded();
      await legend.waitFor({ state: "visible", timeout: 15_000 });
      if (id === "space-toggle") {
        const before = await legend.getAttribute("aria-pressed");
        await legend.focus();
        await page.keyboard.press("Space");
        const after = await legend.getAttribute("aria-pressed");
        return {
          id,
          route,
          before,
          after,
          focused: await legend.evaluate((element) => element === document.activeElement),
        };
      }

      if (id === "keyboard-focus") {
        let tabPresses = 0;
        while (
          !(await legend.evaluate((element) => element === document.activeElement)) &&
          tabPresses < 200
        ) {
          await page.keyboard.press("Tab");
          tabPresses += 1;
        }
        const focus = await legend.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            isActiveElement: element === document.activeElement,
            focusVisible: element.matches(":focus-visible"),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
          };
        });
        return { id, route, tabPresses, focus };
      }

      const media = await page.evaluate(() => ({
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        headerAnimationDuration: getComputedStyle(document.querySelector("header")!)
          .animationDuration,
        legendTransitionDuration: getComputedStyle(
          document.querySelector("#section-stacked [data-testid='legend-住居']")!,
        ).transitionDuration,
      }));
      return {
        id,
        route,
        media,
        headerAnimationMs: durationMs(media.headerAnimationDuration),
        legendTransitionMs: durationMs(media.legendTransitionDuration),
      };
    },
  );
};

declare module "vitest/node" {
  interface BrowserCommands {
    inspectPhase6B14: typeof inspectPhase6B14;
  }
}
