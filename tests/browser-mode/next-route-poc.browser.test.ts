import { expect, test } from "vitest";
import { commands } from "vitest/browser";

test("Playwright Browser Mode custom command observes a production Next chart interaction", async () => {
  const observation = await commands.inspectProductionDashboard();
  const routeUrl = new URL(observation.url);

  expect(observation.responseStatus).toBe(200);
  expect(routeUrl.protocol).toBe("http:");
  expect(routeUrl.hostname).toBe("127.0.0.1");
  expect(routeUrl.port).toBe(String(observation.serverPort));
  expect(routeUrl.pathname).toBe("/");
  expect(observation.pageHeading).toContain("物価・賃金・消費の推移");
  expect(observation.firstDataPeriod).toBeTruthy();
  expect(observation.firstDataValueType).toBe("number");
  expect(Number.isFinite(Number(observation.firstDataValue))).toBe(true);
  expect(observation.chartAreaCountBefore).toBeGreaterThan(0);
  expect(observation.legendPressedBefore).toBe("true");
  expect(observation.legendPressedAfter).toBe("false");
  expect(observation.chartAreaCountAfter).toBe(observation.chartAreaCountBefore - 1);
});
