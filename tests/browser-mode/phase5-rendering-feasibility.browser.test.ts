import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { Phase5RenderingId } from "./phase5-rendering-feasibility.route.command";

const scenarios: Phase5RenderingId[] = [
  "p45-a-a11y-real-legend-header-default",
  "p45-a-a11y-real-legend-header-dark",
  "p45-a-advanced-series-adv-query",
  "p45-a-parity-advanced-anchors",
  "p45-a-parity-hidden-series",
  "p45-a-parity-section-cpi-major",
  "p45-a-parity-section-earnings",
  "p45-a-parity-section-new-graph",
  "p45-a-parity-section-residual",
  "p45-a-parity-section-stacked",
  "p45-b-plan27-private-consumption-79-plan27-38-cti-nominal-cti-key-is-distinct-from-the-real",
  "p45-b-plan27-private-consumption-9-plan27-38-cti-2005q1-2017q4-52-graph-table-csv-cti-regi",
  "p45-b-quarterly-gdp-26-plan23-quarterly-public-projection-ready-state-renders-",
];

for (const id of scenarios) {
  it(`Phase 5 rendering feasibility observation: ${id}`, async () => {
    const observation = await commands.inspectPhase5Rendering(id);
    console.info(`[phase5-rendering-observation] ${JSON.stringify(observation)}`);
    expect(observation.id).toBe(id);
  });
}
