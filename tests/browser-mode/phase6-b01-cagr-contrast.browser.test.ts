import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { Phase5RenderingId } from "./phase5-rendering-feasibility.route.command";

const scenarios: Phase5RenderingId[] = [
  "p45-a-a11y-cagr-trigger-default",
  "p45-a-a11y-cagr-trigger-dark",
];

for (const id of scenarios) {
  it(`T-A11Y-1 CAGR trigger contrast: ${id.endsWith("-dark") ? "dark" : "default"}`, async () => {
    const result = await commands.inspectPhase5Rendering(id);
    const observations = result.observations as
      | {
          route?: { status?: number; headingFound?: boolean; networkIdle?: boolean };
          target?: { found?: boolean; visible?: boolean };
          observation?: { found?: boolean; colorScheme?: string; computedContrastRatio?: number };
        }
      | undefined;

    expect(result.id).toBe(id);
    expect(result.outcome, result.error).toBe("observed");
    expect(observations?.route?.status).toBe(200);
    expect(observations?.route?.headingFound).toBe(true);
    expect(observations?.route?.networkIdle).toBe(true);
    expect(observations?.target?.found).toBe(true);
    expect(observations?.target?.visible).toBe(true);
    expect(observations?.observation?.found).toBe(true);
    expect(observations?.observation?.colorScheme).toBe(id.endsWith("-dark") ? "dark" : "light");
    expect(observations?.observation?.computedContrastRatio).toBeGreaterThanOrEqual(4.5);
  });
}
