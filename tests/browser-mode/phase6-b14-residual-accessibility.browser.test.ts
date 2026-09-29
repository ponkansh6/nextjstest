import { expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import type { Phase6B14Id } from "./phase6-b14.route.command";

vi.setConfig({ testTimeout: 45_000 });

type Phase6B14BrowserCommands = {
  inspectPhase6B14: (id: Phase6B14Id) => Promise<unknown>;
};

const phase6B14Commands = commands as unknown as Phase6B14BrowserCommands;

async function inspect(id: Phase6B14Id) {
  return (await phase6B14Commands.inspectPhase6B14(id)) as {
    route: { status: number | null; networkIdle: boolean; headingVisible: boolean };
    colors?: {
      theme: string | null;
      color: string;
      background: string;
      transformBeforeHover: string;
    };
    contrastRatio?: number;
    transformWhileHovered?: string;
    transformAfterHover?: string;
    before?: string | null;
    after?: string | null;
    focused?: boolean;
    tabPresses?: number;
    focus?: {
      isActiveElement: boolean;
      focusVisible: boolean;
      outlineStyle: string;
      outlineWidth: string;
    };
    media?: {
      reducedMotion: boolean;
      headerAnimationDuration: string;
      legendTransitionDuration: string;
    };
    headerAnimationMs?: number[];
    legendTransitionMs?: number[];
  };
}

function expectProductionRoute(route: {
  status: number | null;
  networkIdle: boolean;
  headingVisible: boolean;
}) {
  expect(route.status).toBe(200);
  expect(route.networkIdle).toBe(true);
  expect(route.headingVisible).toBe(true);
}

it("B14: dark stacked legend hover resets and keeps readable dark-theme contrast", async () => {
  const result = await inspect("dark-hover-contrast");
  expectProductionRoute(result.route);
  expect(result.colors?.theme).toBe("dark");
  expect(result.colors?.background).not.toBe("rgb(255, 255, 255)");
  expect(result.contrastRatio).toBeGreaterThanOrEqual(4.5);
  expect(result.transformWhileHovered).not.toBe("none");
  expect(result.transformAfterHover).toBe("none");
});

it("B14: Space toggles the production stacked legend pressed state", async () => {
  const result = await inspect("space-toggle");
  expectProductionRoute(result.route);
  expect(result.focused).toBe(true);
  expect(result.before).toBe("true");
  expect(result.after).toBe("false");
});

it("B14: keyboard Tab reaches the named legend with a visible focus outline", async () => {
  const result = await inspect("keyboard-focus");
  expectProductionRoute(result.route);
  expect(result.tabPresses).toBeGreaterThan(0);
  expect(result.tabPresses).toBeLessThan(200);
  expect(result.focus?.isActiveElement).toBe(true);
  expect(result.focus?.focusVisible).toBe(true);
  expect(result.focus?.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(result.focus?.outlineWidth ?? "0")).toBeGreaterThan(0);
});

it("B14: reduced-motion context disables production header and legend motion", async () => {
  const result = await inspect("reduced-motion");
  expectProductionRoute(result.route);
  expect(result.media?.reducedMotion).toBe(true);
  expect(result.headerAnimationMs?.every((duration) => duration <= 0.01)).toBe(true);
  expect(result.legendTransitionMs?.every((duration) => duration <= 0.01)).toBe(true);
});
