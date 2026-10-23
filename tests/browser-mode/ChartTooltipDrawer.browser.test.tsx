import {
  cloneElement,
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { NewGraph } from "../../src/app/components/NewGraph";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { StackedAreaChart } from "../../src/app/components/StackedAreaChart";
import {
  createChartTooltipSelectionResolver,
  useChartTooltipController,
} from "../../src/app/components/charts/useChartTooltipProps";
import { getLegendLabel, type SeriesMetadata } from "../../src/lib/chartConstants";
import {
  getSpendingPresentationLabel,
  orderSpendingPresentationKeys,
} from "../../src/lib/spendingSeriesPresentation";
import { QUARTERLY_PUBLIC_NOMINAL_KEYS } from "../../src/lib/quarterlyPublicProjection";
import type { CpiData } from "../../src/types";
import { renderBrowserComponent } from "./renderBrowserComponent";
import quarterlyNominalCsv from "../../data/source/cti_data2025_distribution_adjusted_quarterly.csv?raw";
import type { CustomTooltipProps } from "../../src/types/chart";

const chartData = quarterlyNominalCsv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.split(","))
  .filter(([period]) => period === "2018Q1" || period === "2018Q2")
  .map(([period, _total, ...values]) => {
    const [yearText, quarterText] = period.split("Q");
    const row = {
      label: period,
      年: Number(yearText),
      quarter: Number(quarterText),
      年月: period,
    } as ComponentProps<typeof SpendingBarChart>["data"][number];
    QUARTERLY_PUBLIC_NOMINAL_KEYS.forEach((key, index) => {
      const rawValue = values[index];
      row[key] = rawValue === undefined || rawValue === "-" ? null : Number(rawValue);
    });
    return row;
  }) as ComponentProps<typeof SpendingBarChart>["data"];
const chartKeys = [...QUARTERLY_PUBLIC_NOMINAL_KEYS];
const hiddenKey = chartKeys[7];
const visibleKeys = chartKeys.filter((key) => key !== hiddenKey);
const orderedVisibleKeys = orderSpendingPresentationKeys(visibleKeys);
const chartColorsByKey = Object.fromEntries(
  chartKeys.map((key, index) => [key, `hsl(${index * 31} 60% 45%)`]),
);

function expectedTotal(label: string): number {
  const row = chartData.find((candidate) => candidate.label === label);
  if (!row) throw new Error(`Production CTI fixture is missing ${label}`);
  return visibleKeys.reduce((total, key) => {
    const value = row[key];
    return total + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0);
}

const chartColors = {
  barFill: "#94a3b8",
  gridStroke: "#e2e8f0",
  axisText: "#64748b",
  tooltipBg: "#ffffff",
  tooltipText: "#1f2937",
};

const familySeries = {
  area: { key: "fixture-area", label: "Area value", color: "#be123c" },
  line: { key: "fixture-line", label: "Line value", color: "#1d4ed8" },
} as const;

const familyRows: CpiData[] = [
  {
    年月: "2018Q1",
    [familySeries.area.key]: 100,
    [familySeries.line.key]: 10,
  } as unknown as CpiData,
  {
    年月: "2018Q2",
    [familySeries.area.key]: 120,
    [familySeries.line.key]: 20,
  } as unknown as CpiData,
  {
    年月: "2018Q3",
    [familySeries.area.key]: 140,
    [familySeries.line.key]: 30,
  } as unknown as CpiData,
];

function ChartFamilyTouchFixture({ family }: { family: "area" | "line" }) {
  const controller = useChartTooltipController({ suppressed: false, isTouch: true });
  // NewGraph receives the selected date range, matching its production data flow.
  const data = family === "line" ? familyRows.slice(1) : familyRows.slice(0, 2);
  const series = familySeries[family];
  const selected = controller.bind(`family-${family}`, {
    dataLength: data.length,
    allowedKeys: [series.key],
    seriesMeta: [{ ...series, order: 0 }],
    selectionPayloadAtIndex: createChartTooltipSelectionResolver(data, () => [series]),
  });

  return (
    <>
      <div data-testid={`family-${family}-chart`}>
        {family === "area" ? (
          <StackedAreaChart
            title="Touch Area"
            data={data}
            keys={[series.key]}
            colors={[series.color]}
            hiddenKeys={[]}
            onToggle={() => {}}
            chartColors={chartColors}
            tooltipProps={selected.tooltipProps}
            onClick={selected.onClick}
            onPointerDown={selected.onPointerDown}
            onPointerUp={selected.onPointerUp}
            onPointerCancel={selected.onPointerCancel}
            onKeyDown={selected.onKeyDown}
            onPointerMove={selected.onPointerMove}
            onPointerLeave={selected.onPointerLeave}
            onMouseMove={selected.onMouseMove}
            onChartMouseMove={selected.onChartMouseMove}
            onMouseLeave={selected.onMouseLeave}
            onReset={() => {}}
            activeDot={selected.activeDot}
          />
        ) : (
          <NewGraph
            data={data}
            hiddenKeys={[]}
            onToggle={() => {}}
            chartColors={chartColors}
            isMobile
            tooltipProps={selected.tooltipProps}
            onClick={selected.onClick}
            onPointerDown={selected.onPointerDown}
            onPointerUp={selected.onPointerUp}
            onPointerCancel={selected.onPointerCancel}
            onKeyDown={selected.onKeyDown}
            onPointerMove={selected.onPointerMove}
            onPointerLeave={selected.onPointerLeave}
            onMouseMove={selected.onMouseMove}
            onChartMouseMove={selected.onChartMouseMove}
            onMouseLeave={selected.onMouseLeave}
            activeDot={selected.activeDot}
            comparisonSeriesRegistry={
              [
                { ...series, type: "line", valueType: "comparison" },
              ] satisfies readonly SeriesMetadata[]
            }
          />
        )}
      </div>
      {controller.drawer}
    </>
  );
}

function DrawerPayloadFixture({
  isTouch = true,
  drawerEnabled = true,
  onClosedDrawerCompletion,
}: {
  isTouch?: boolean;
  drawerEnabled?: boolean;
  onClosedDrawerCompletion?: (complete: (open: boolean) => void) => void;
}) {
  const tooltip = useChartTooltipController({ suppressed: false, isTouch });
  const resolveSelection = createChartTooltipSelectionResolver(
    chartData,
    () =>
      orderedVisibleKeys.map((key) => ({
        key,
        name: getSpendingPresentationLabel(key) ?? getLegendLabel(key),
        color: chartColorsByKey[key],
      })),
    (row) => row.label,
  );
  const selected = tooltip.bind("drawer-payload-contract", {
    dataLength: chartData.length,
    drawerEnabled,
    showTotal: true,
    showAllPayload: true,
    showMeasurementNotes: false,
    allowedKeys: visibleKeys,
    selectionPayloadAtIndex: resolveSelection,
    seriesMeta: orderedVisibleKeys.map((key, order) => ({
      key,
      label: getSpendingPresentationLabel(key) ?? getLegendLabel(key),
      color: chartColorsByKey[key],
      order,
    })),
  });
  const selectedContent = selected.tooltipProps.content as ReactElement<CustomTooltipProps>;
  const originalSnapshotRef = useRef(selectedContent.props.onPayloadSnapshot);
  originalSnapshotRef.current = selectedContent.props.onPayloadSnapshot;
  const [tooltipEffectPayload, setTooltipEffectPayload] = useState("none");
  const [observedClick, setObservedClick] = useState("none");
  const [pointerUpResult, setPointerUpResult] = useState("none");
  const drawerProps = tooltip.drawer.props as Record<string, unknown>;
  if (!drawerProps.open && typeof drawerProps.onOpenChangeComplete === "function") {
    onClosedDrawerCompletion?.(drawerProps.onOpenChangeComplete as (open: boolean) => void);
  }
  const observePayload = useCallback<NonNullable<CustomTooltipProps["onPayloadSnapshot"]>>(
    (payload, label) => {
      setTooltipEffectPayload(`${label ?? "?"}:${payload.length}`);
      originalSnapshotRef.current?.(payload, label);
    },
    [],
  );
  const tooltipContent = cloneElement(selectedContent, { onPayloadSnapshot: observePayload });

  return (
    <>
      <output
        data-testid="tooltip-controller-state"
        data-index={selected.tooltipProps.defaultIndex ?? "none"}
        data-active={String(selected.tooltipProps.active)}
        data-tooltip-effect-payload={tooltipEffectPayload}
        data-recharts-click={observedClick}
        data-pointer-up-result={pointerUpResult}
        data-drawer-open={String(drawerProps.open)}
      />
      <div style={{ width: "100%", height: 420, minHeight: 420 }}>
        <SpendingBarChart
          title="支出"
          sectionId="drawer-payload-contract"
          testId="drawer-payload-chart"
          data={chartData}
          keys={chartKeys}
          colors={chartKeys.map((key) => chartColorsByKey[key])}
          hiddenKeys={[hiddenKey]}
          onToggle={() => {}}
          chartColors={chartColors}
          tooltipProps={{ ...selected.tooltipProps, content: tooltipContent }}
          onClick={(event?: unknown) => {
            if (event && typeof event === "object" && "activeTooltipIndex" in event) {
              setObservedClick(`index:${event.activeTooltipIndex ?? "none"}`);
            }
            selected.onClick(event);
          }}
          onPointerDown={(event) => {
            const surface = event.currentTarget;
            surface.dataset.pointerDownCount = String(
              Number(surface.dataset.pointerDownCount ?? 0) + 1,
            );
            surface.dataset.lastChartPointerDown = `${event.pointerType}:${event.isPrimary}:${event.pointerId}:${event.button}:${event.clientX}:${event.clientY}`;
            surface.dataset.controllerPointerDownResult = selected.onPointerDown(event);
          }}
          onPointerUp={(event) => {
            const surface = event.currentTarget;
            surface.dataset.pointerUpCount = String(
              Number(surface.dataset.pointerUpCount ?? 0) + 1,
            );
            surface.dataset.lastChartPointerUp = `${event.pointerType}:${event.isPrimary}:${event.pointerId}:${event.button}:${event.clientX}:${event.clientY}`;
            if (!selected.onPointerUp) throw new Error("Controller omitted its pointerup handler");
            const result = selected.onPointerUp(event);
            const nativeTarget = event.nativeEvent.target;
            const targetIndex =
              nativeTarget instanceof Element
                ? (nativeTarget.closest("[data-index]")?.getAttribute("data-index") ?? "none")
                : "none";
            surface.dataset.pointerUpTargetIndex = targetIndex;
            surface.dataset.controllerPointerUpResult = result;
            setPointerUpResult(result);
          }}
          onPointerCancel={selected.onPointerCancel}
          onKeyDown={selected.onKeyDown}
          onPointerMove={selected.onPointerMove}
          onMouseMove={selected.onMouseMove}
          onPointerLeave={selected.onPointerLeave}
          onMouseLeave={selected.onMouseLeave}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
          isMobile
        />
      </div>
      {tooltip.drawer}
    </>
  );
}

function pointerSelectBar(
  bar: SVGElement,
  wrapper: HTMLElement,
  expectedPointerUpResults: Array<"awaiting-click" | "selected" | "rejected-no-selection"> = [
    "selected",
    "awaiting-click",
  ],
) {
  const findHitPath = (sourceRowIndex?: string) =>
    [...wrapper.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle [data-index] path")].find(
      (path) => {
        const indexed = path.closest<SVGElement>("[data-index]");
        const bounds = path.getBoundingClientRect();
        return (
          indexed != null &&
          (sourceRowIndex === undefined || indexed.getAttribute("data-index") === sourceRowIndex) &&
          path.isConnected &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      },
    );
  const indexDiagnostics = () => {
    const indexedNodes = [...wrapper.querySelectorAll<SVGElement>("[data-index]")];
    const paths = [...wrapper.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle path")];
    return [
      `bars=${wrapper.querySelectorAll(".recharts-bar-rectangle").length}`,
      `indexedNodes=${indexedNodes.length}`,
      `paths=${paths.length}`,
      `barHTML=${bar.outerHTML.slice(0, 600)}`,
      `firstIndexedHTML=${indexedNodes[0]?.outerHTML.slice(0, 400) ?? "<none>"}`,
      `firstPathHTML=${paths[0]?.outerHTML.slice(0, 300) ?? "<none>"}`,
      `parentIndex=${bar.parentElement?.closest("[data-index]")?.getAttribute("data-index") ?? "none"}`,
    ].join("; ");
  };
  // SpendingBarChart puts source-row data-index on a wrapping SVG <g>, while
  // Recharts' rectangle remains the actual hit target.
  const indexedTarget =
    bar.closest<SVGElement>("[data-index]") ??
    (bar.matches("[data-index]") ? bar : bar.querySelector<SVGElement>("[data-index]")) ??
    findHitPath()?.closest<SVGElement>("[data-index]");
  if (!indexedTarget) {
    throw new Error(`Recharts bar is missing its source row data-index; ${indexDiagnostics()}`);
  }
  const hitTarget = indexedTarget.querySelector<SVGElement>("path, rect") ?? indexedTarget;
  const initialHitTarget = indexedTarget.querySelector<SVGElement>("path, rect") ?? indexedTarget;
  const bounds = initialHitTarget.getBoundingClientRect();
  const clientX = bounds.left + bounds.width / 2;
  const clientY = bounds.top + bounds.height / 2;
  const pointerBase = {
    bubbles: true,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX,
    clientY,
    button: 0,
  };
  delete wrapper.dataset.lastChartPointerDown;
  delete wrapper.dataset.lastChartPointerUp;
  delete wrapper.dataset.pointerDownCount;
  delete wrapper.dataset.pointerUpCount;
  delete wrapper.dataset.controllerPointerDownResult;
  delete wrapper.dataset.controllerPointerUpResult;
  const observedPointerUps: PointerEvent[] = [];
  const observePointerUp = (event: Event) => {
    observedPointerUps.push(event as PointerEvent);
  };
  wrapper.addEventListener("pointerup", observePointerUp, { once: true });
  // Hit the path inside the indexed child group so the event target's ancestor
  // chain contains the source-row data-index.
  act(() => {
    hitTarget.dispatchEvent(new PointerEvent("pointerdown", { ...pointerBase, buttons: 1 }));
    hitTarget.dispatchEvent(new PointerEvent("pointerup", { ...pointerBase, buttons: 0 }));
    // Recharts derives activeTooltipIndex from its chart-level mouse state.
    // This same-coordinate move models that state becoming available to the
    // click generated by the touch gesture, without changing pointer modality.
    hitTarget.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX, clientY }));
  });
  const observedPointerUp = observedPointerUps[0];
  if (!observedPointerUp) throw new Error("Chart surface did not receive the bubbling pointerup");
  expect(wrapper.dataset.pointerDownCount).toBe("1");
  expect(wrapper.dataset.pointerUpCount).toBe("1");
  expect(wrapper.dataset.lastChartPointerDown).toBe(`touch:true:1:0:${clientX}:${clientY}`);
  expect(wrapper.dataset.lastChartPointerUp).toBe(`touch:true:1:0:${clientX}:${clientY}`);
  expect(wrapper.dataset.controllerPointerDownResult).toBe("touch-candidate");
  expect(expectedPointerUpResults).toContain(wrapper.dataset.controllerPointerUpResult);
  expect(wrapper.dataset.pointerUpTargetIndex).toBe(indexedTarget.getAttribute("data-index"));
  expect(observedPointerUp.pointerId).toBe(1);
  expect(observedPointerUp.pointerType).toBe("touch");
  expect(observedPointerUp.isPrimary).toBe(true);
  expect(observedPointerUp.clientX).toBe(clientX);
  expect(observedPointerUp.clientY).toBe(clientY);
  // React may replace SVG nodes while committing pointerup. Find a connected
  // shape for the same source row and refresh Recharts' chart-level index from
  // that shape's current center before its click event.
  const selectedIndex = indexedTarget.getAttribute("data-index");
  const clickTarget = [...wrapper.querySelectorAll<SVGElement>(".recharts-bar-rectangle")]
    .map((candidate) => candidate.querySelector<SVGElement>(`[data-index="${selectedIndex}"]`))
    .find((candidate) => {
      if (!candidate) return false;
      const hitShape = candidate.querySelector<SVGElement>("path, rect") ?? candidate;
      const rect = hitShape.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  if (!clickTarget)
    throw new Error("No connected Recharts shape remains for the selected source row");
  const clickHitTarget = clickTarget.querySelector<SVGElement>("path, rect") ?? clickTarget;
  const clickBounds = clickHitTarget.getBoundingClientRect();
  const clickX = clickBounds.left + clickBounds.width / 2;
  const clickY = clickBounds.top + clickBounds.height / 2;
  act(() => {
    clickHitTarget.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: clickX, clientY: clickY }),
    );
    clickHitTarget.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: clickX, clientY: clickY }),
    );
  });
  expect(expectedPointerUpResults).toContain(wrapper.dataset.controllerPointerUpResult);
  expect(
    wrapper.ownerDocument
      .querySelector('[data-testid="tooltip-controller-state"]')
      ?.getAttribute("data-recharts-click"),
  ).toBe(`index:${selectedIndex}`);
}

async function openFirstDrawer() {
  const chart = await page.getByTestId("drawer-payload-chart").element();
  await waitFor(() => {
    const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
    expect(wrapper).not.toBeNull();
    if (!wrapper) return;
    wrapper.style.width = "100%";
    wrapper.style.height = "420px";
    wrapper.style.minHeight = "420px";
    const renderedShapes = [...chart.querySelectorAll<SVGPathElement>("[data-index] path")];
    expect(
      renderedShapes.some((shape) => {
        const bounds = shape.getBoundingClientRect();
        return shape.isConnected && bounds.width > 0 && bounds.height > 0;
      }),
    ).toBe(true);
  });
  const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
  const firstBar = wrapper?.querySelector<SVGPathElement>(
    ".recharts-bar-rectangle [data-index] path",
  );
  if (!wrapper || !firstBar) throw new Error("Fixture Recharts bar is missing");
  pointerSelectBar(firstBar, wrapper);
  await expectPointerSnapshotCommit();
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  return { chart, wrapper, dialog };
}

async function expectPointerSnapshotCommit() {
  const state = await page.getByTestId("tooltip-controller-state").element();
  await waitFor(() =>
    expect(["selected", "awaiting-click"]).toContain(state.dataset.pointerUpResult),
  );
  await waitFor(() => expect(state.dataset.active).toBe("true"));
  await waitFor(() => expect(state.dataset.index).not.toBe("none"));
  await waitFor(() => expect(state.dataset.drawerOpen).toBe("true"));
}

async function expectDrawerAbsent() {
  await waitFor(() => expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull());
}

async function tapChartFamilyAtPeriod(family: "area" | "line", selectedPeriod: string) {
  await page.viewport(375, 667);
  renderBrowserComponent(<ChartFamilyTouchFixture family={family} />);

  const fixture = await page.getByTestId(`family-${family}-chart`).element();
  const wrapper = fixture.querySelector<HTMLElement>('[role="img"]');
  const surface = fixture.querySelector<SVGSVGElement>("svg.recharts-surface");
  const plot = fixture.querySelector<SVGGElement>(".recharts-cartesian-grid");
  const tick = [...fixture.querySelectorAll<SVGTextElement>("text")].find(
    (text) => text.textContent?.trim() === selectedPeriod,
  );
  if (!wrapper || !surface || !plot || !tick) {
    throw new Error(`Missing ${family} Recharts surface, plot, or ${selectedPeriod} tick`);
  }
  const surfaceBounds = surface.getBoundingClientRect();
  const plotBounds = plot.getBoundingClientRect();
  const tickBounds = tick.getBoundingClientRect();
  expect(plotBounds.left).toBeGreaterThan(surfaceBounds.left);
  expect(plotBounds.right).toBeLessThan(surfaceBounds.right);

  const clientX = tickBounds.left + tickBounds.width / 2;
  const clientY = plotBounds.top + plotBounds.height / 2;
  const gesture = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 41,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    clientX,
    clientY,
  };
  surface.dispatchEvent(new PointerEvent("pointerdown", { ...gesture, buttons: 1 }));
  surface.dispatchEvent(new PointerEvent("pointerup", { ...gesture, buttons: 0 }));
  // A touch's generated click supplies Recharts' activeTooltipIndex from the
  // same coordinates. No prior hover or synthetic mousemove can set the row.
  const clickSurface = fixture.querySelector<SVGSVGElement>("svg.recharts-surface");
  if (!clickSurface) throw new Error(`${family} Recharts surface disappeared after pointerup`);
  clickSurface.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
    }),
  );

  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  const tooltip = (await dialog.element()).querySelector<HTMLElement>("[data-custom-tooltip]");
  if (!tooltip) throw new Error(`${family} tap did not render its selected tooltip`);
  expect(tooltip.textContent).toContain(selectedPeriod);
}

describe("chart tooltip Drawer datum selection", () => {
  it("selects the exact Area datum with a zero-movement touch", async () => {
    await tapChartFamilyAtPeriod("area", "2018Q2");
  });

  it("selects the exact range-filtered Line datum with a zero-movement touch", async () => {
    await tapChartFamilyAtPeriod("line", "2018Q3");
  });

  it("opens the actual row on tap and reselection", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const chart = await page.getByTestId("drawer-payload-chart").element();
    const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
    const bars = [
      ...chart.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle [data-index] path"),
    ];
    const firstDataPointBar = bars.find(
      (path) => path.closest("[data-index]")?.getAttribute("data-index") === "0",
    );
    if (!wrapper || !firstDataPointBar) throw new Error("Fixture indexed Recharts bar is missing");

    pointerSelectBar(firstDataPointBar, wrapper);
    await expectPointerSnapshotCommit();
    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    let dialogElement = await dialog.element();
    let tooltip = dialogElement.querySelector<HTMLElement>("[data-custom-tooltip]");
    if (!tooltip) throw new Error("Drawer CustomTooltip is missing");
    expect(tooltip.textContent).toContain("2018Q1");
    const firstRows = [...tooltip.querySelectorAll<HTMLElement>("[data-tooltip-row]")];
    expect(firstRows.map((row) => row.dataset.tooltipKey)).toEqual(orderedVisibleKeys);
    expect(tooltip.querySelector(`[data-tooltip-row][data-tooltip-key="${hiddenKey}"]`)).toBeNull();
    expect(
      tooltip.querySelector('[data-tooltip-row][data-tooltip-key="CTIミクロ調整系列（食料）"]')
        ?.textContent,
    ).toContain("22.90");
    expect(
      tooltip.querySelector(
        '[data-tooltip-row][data-tooltip-key="CTIミクロ調整系列（その他の消費支出）"]',
      )?.textContent,
    ).toContain("—");
    expect(firstRows[0].dataset.tooltipColor).toBe(chartColorsByKey[orderedVisibleKeys[0]]);
    expect(tooltip.querySelector("[data-tooltip-total]")?.textContent).toContain(
      expectedTotal("2018Q1").toFixed(2),
    );
    expect(tooltip.textContent).toContain("2018Q1");

    await page.getByRole("button", { name: "閉じる" }).click();
    await expectDrawerAbsent();

    const refreshedBars = [
      ...chart.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle [data-index] path"),
    ];
    const secondDataPointBar = refreshedBars.find(
      (path) => path.closest("[data-index]")?.getAttribute("data-index") === "1",
    );
    if (!secondDataPointBar)
      throw new Error("Indexed Recharts bar is missing after closing the Drawer");
    pointerSelectBar(secondDataPointBar, wrapper);
    await expectPointerSnapshotCommit();
    await expect.element(dialog).toBeVisible();
    dialogElement = await dialog.element();
    tooltip = dialogElement.querySelector<HTMLElement>("[data-custom-tooltip]");
    if (!tooltip) throw new Error("Drawer CustomTooltip is missing after reselection");
    expect(tooltip.textContent).toContain("2018Q2");
    expect(tooltip.querySelectorAll("[data-tooltip-row]")).toHaveLength(visibleKeys.length);
    expect(tooltip.querySelector("[data-tooltip-total]")?.textContent).toContain(
      expectedTotal("2018Q2").toFixed(2),
    );
    await page.getByRole("button", { name: "閉じる" }).click();
    await expectDrawerAbsent();

    const finalBar = [
      ...chart.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle [data-index] path"),
    ].find((path) => path.closest("[data-index]")?.getAttribute("data-index") === "0");
    if (!finalBar) throw new Error("Indexed Recharts bar is missing before reselection");
    pointerSelectBar(finalBar, wrapper);
    await expectPointerSnapshotCommit();
    await expect.element(dialog).toBeVisible();
    dialogElement = await dialog.element();
    tooltip = dialogElement.querySelector<HTMLElement>("[data-custom-tooltip]");
    if (!tooltip)
      throw new Error("Drawer CustomTooltip is missing on the repeated first selection");
    expect(tooltip.textContent).toContain("2018Q1");
    expect(
      tooltip.querySelector('[data-tooltip-row][data-tooltip-key="CTIミクロ調整系列（食料）"]')
        ?.textContent,
    ).toContain("22.90");
  });

  it("keeps a new selection after the previous Drawer exit completes", async () => {
    await page.viewport(375, 667);
    let closedCompletion: ((open: boolean) => void) | undefined;
    let closedCompletionCaptures = 0;
    renderBrowserComponent(
      <DrawerPayloadFixture
        onClosedDrawerCompletion={(complete) => {
          closedCompletion = complete;
          closedCompletionCaptures += 1;
        }}
      />,
    );

    const { chart, wrapper } = await openFirstDrawer();
    const popup = document.querySelector<HTMLElement>('[data-slot="drawer-popup"]');
    if (!popup) throw new Error("Drawer popup is missing before starting its exit");
    const capturesBeforeClose = closedCompletionCaptures;
    // Keep the real Base UI exit pending so its callback can be delivered after reselection.
    popup.style.transitionDuration = "10s";

    await page.getByRole("button", { name: "閉じる" }).click();
    const controllerState = await page.getByTestId("tooltip-controller-state").element();
    await waitFor(() => expect(controllerState.dataset.drawerOpen).toBe("false"));
    await waitFor(() => expect(closedCompletionCaptures).toBeGreaterThan(capturesBeforeClose));
    await waitFor(() => expect(closedCompletion).toBeTypeOf("function"));
    const staleCloseCompletion = closedCompletion;

    const secondBar = [
      ...chart.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle [data-index] path"),
    ].find((path) => path.closest("[data-index]")?.getAttribute("data-index") === "1");
    if (!secondBar) throw new Error("Indexed Recharts bar is missing during the Drawer exit");
    pointerSelectBar(secondBar, wrapper);
    await expectPointerSnapshotCommit();

    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    const tooltip = (await dialog.element()).querySelector<HTMLElement>("[data-custom-tooltip]");
    if (!tooltip) throw new Error("Drawer CustomTooltip is missing after reselection");
    expect(tooltip.textContent).toContain("2018Q2");

    // Deliver the callback captured from the closed render after row B has reopened the Drawer.
    act(() => staleCloseCompletion?.(false));
    await waitFor(() => expect(controllerState.dataset.drawerOpen).toBe("true"));
    const currentTooltip = document.querySelector<HTMLElement>(
      '[data-slot="drawer-popup"] [data-custom-tooltip]',
    );
    expect(currentTooltip?.textContent).toContain("2018Q2");
  });

  it("does not open from pointerdown alone", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const chart = await page.getByTestId("drawer-payload-chart").element();
    const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
    const bar = chart.querySelector<SVGPathElement>(".recharts-bar-rectangle [data-index] path");
    if (!wrapper || !bar) throw new Error("Fixture indexed Recharts bar is missing");
    const bounds = bar.getBoundingClientRect();
    const downOnly = {
      bubbles: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
    wrapper.dispatchEvent(new PointerEvent("pointerdown", downOnly));
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
    wrapper.dispatchEvent(new PointerEvent("pointercancel", downOnly));
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
  });

  it.each([375, 430])("keeps the mobile label display mode at %ipx", async (width) => {
    await page.viewport(width, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const chart = await page.getByTestId("drawer-payload-chart").element();
    const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
    const bar = chart.querySelector<SVGPathElement>(".recharts-bar-rectangle [data-index] path");
    if (!wrapper || !bar) throw new Error("Fixture indexed Recharts bar is missing");
    pointerSelectBar(bar, wrapper);
    await expectPointerSnapshotCommit();

    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    const tooltip = (await dialog.element()).querySelector<HTMLElement>("[data-custom-tooltip]");
    if (!tooltip) throw new Error("Drawer CustomTooltip is missing");
    expect(tooltip.textContent).toContain("2018Q1");
    expect(window.getComputedStyle(tooltip.querySelector("p")!).fontSize).toBe("11px");
    expect(window.getComputedStyle(tooltip).position).not.toBe("fixed");
    expect(
      tooltip.querySelector('[data-tooltip-row][data-tooltip-key="CTIミクロ調整系列（食料）"]'),
    ).not.toBeNull();
  });

  it.each(["Enter", "Space"])(
    "opens from a fine-pointer keyboard selection with %s",
    async (key) => {
      await page.viewport(1280, 800);
      renderBrowserComponent(<DrawerPayloadFixture isTouch={false} />);

      const chart = await page.getByTestId("drawer-payload-chart").element();
      const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
      if (!wrapper) throw new Error("Fixture chart wrapper is missing");
      wrapper.focus();
      await userEvent.keyboard(key === "Enter" ? "{Enter}" : " ");

      const dialog = page.getByRole("dialog");
      await expect.element(dialog).toBeVisible();
      const drawerTooltip = (await dialog.element()).querySelector<HTMLElement>(
        "[data-custom-tooltip]",
      );
      if (!drawerTooltip) throw new Error("Keyboard selection did not resolve the chart datum");
      expect(drawerTooltip.textContent).toContain("2018Q2");
    },
  );

  it.each(["Enter", "Space"])("opens the selected coarse-pointer point with %s", async (key) => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const chart = await page.getByTestId("drawer-payload-chart").element();
    const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
    if (!wrapper) throw new Error("Fixture chart wrapper is missing");
    wrapper.focus();
    await userEvent.keyboard(key === "Enter" ? "{Enter}" : " ");

    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    const tooltip = (await dialog.element()).querySelector<HTMLElement>("[data-custom-tooltip]");
    if (!tooltip) throw new Error("Keyboard selection did not snapshot the Recharts payload");
    expect(tooltip.textContent).toContain("2018Q2");
  });

  it("keeps mouse hover on a touch-classified hybrid viewport", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const chart = await page.getByTestId("drawer-payload-chart").element();
    const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
    const bar = [
      ...chart.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle [data-index] path"),
    ].find((candidate) => candidate.closest("[data-index]")?.getAttribute("data-index") === "1");
    if (!wrapper || !bar) throw new Error("Fixture indexed Recharts bar is missing");
    const bounds = bar.getBoundingClientRect();
    bar.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 4,
        pointerType: "mouse",
        isPrimary: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      }),
    );
    // Recharts' chart-level mouse handler is the source of activeTooltipIndex;
    // a real hybrid mouse hover therefore includes the corresponding move.
    bar.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      }),
    );

    await waitFor(() =>
      expect(chart.querySelector("[data-custom-tooltip]")?.textContent).toContain("2018Q2"),
    );
    const state = await page.getByTestId("tooltip-controller-state").element();
    // Fine-pointer hover stays under Recharts' uncontrolled active state, so
    // defaultIndex is intentionally unset even though the inline tooltip has
    // the correct second-row payload.
    expect(state.dataset.active).toBe("undefined");
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
  });

  it("restores the legacy touch tooltip and dismiss control when Drawer is disabled", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture drawerEnabled={false} />);

    const chart = await page.getByTestId("drawer-payload-chart").element();
    const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
    const bar = chart.querySelector<SVGPathElement>(".recharts-bar-rectangle [data-index] path");
    if (!wrapper || !bar) throw new Error("Fixture indexed Recharts bar is missing");
    pointerSelectBar(bar, wrapper, ["selected", "rejected-no-selection"]);

    await waitFor(() => expect(chart.querySelector("[data-custom-tooltip]")).not.toBeNull());
    const tooltip = chart.querySelector<HTMLElement>("[data-custom-tooltip]");
    if (!tooltip) throw new Error("Rollback did not restore the inline tooltip");
    expect(tooltip.textContent).toContain("2018Q1");
    const dismissButton = tooltip.querySelector<HTMLButtonElement>('button[aria-label="閉じる"]');
    expect(dismissButton).not.toBeNull();
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
    if (dismissButton) await userEvent.click(dismissButton);
    await waitFor(() => expect(chart.querySelector("[data-custom-tooltip]")).toBeNull());

    const bounds = bar.getBoundingClientRect();
    wrapper.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 8,
        pointerType: "mouse",
        isPrimary: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      }),
    );
    wrapper.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      }),
    );
    await waitFor(() => expect(chart.querySelector("[data-custom-tooltip]")).toBeNull());
  });

  it("does not open after a vertical touch scroll gesture", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const chart = await page.getByTestId("drawer-payload-chart").element();
    const wrapper = chart.querySelector<HTMLElement>('[role="img"]');
    const bar = chart.querySelector<SVGPathElement>(".recharts-bar-rectangle [data-index] path");
    if (!wrapper || !bar) throw new Error("Fixture indexed Recharts bar is missing");
    const bounds = bar.getBoundingClientRect();
    const gesture = {
      bubbles: true,
      pointerId: 2,
      pointerType: "touch",
      isPrimary: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    };
    wrapper.dispatchEvent(new PointerEvent("pointerdown", gesture));
    wrapper.dispatchEvent(
      new PointerEvent("pointermove", { ...gesture, clientY: gesture.clientY + 40 }),
    );
    wrapper.dispatchEvent(
      new PointerEvent("pointerup", { ...gesture, clientY: gesture.clientY + 40 }),
    );

    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
  });

  it("closes on Escape and overlay, then restores focus to the chart", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const { wrapper, dialog } = await openFirstDrawer();
    await userEvent.tab();
    expect((await dialog.element()).contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    await expectDrawerAbsent();
    expect(document.activeElement).toBe(wrapper);

    pointerSelectBar(
      (await page.getByTestId("drawer-payload-chart").element()).querySelector<SVGElement>(
        ".recharts-bar-rectangle",
      )!,
      wrapper,
    );
    await expect.element(dialog).toBeVisible();
    const overlay = document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]');
    if (!overlay) throw new Error("Drawer overlay is missing");
    const popupBounds = (await dialog.element()).getBoundingClientRect();
    const overlayBounds = overlay.getBoundingClientRect();
    const outsideX = overlayBounds.left + overlayBounds.width / 2;
    const outsideY = overlayBounds.top + 10;
    if (outsideY >= popupBounds.top) {
      throw new Error("Chosen overlay point is inside the Drawer popup");
    }
    const hitTarget = document.elementFromPoint(outsideX, outsideY);
    if (!hitTarget || (hitTarget !== overlay && !overlay.contains(hitTarget))) {
      throw new Error("The popup outside point does not hit the Drawer backdrop");
    }
    const outsidePointer = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 99,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      clientX: outsideX,
      clientY: outsideY,
    };
    hitTarget.dispatchEvent(new PointerEvent("pointerdown", { ...outsidePointer, buttons: 1 }));
    hitTarget.dispatchEvent(new PointerEvent("pointerup", { ...outsidePointer, buttons: 0 }));
    await expectDrawerAbsent();
    expect(document.activeElement).toBe(wrapper);
  });

  it("closes on touch swipe without chart tooltip", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const { chart, dialog } = await openFirstDrawer();
    await expect.element(dialog).toBeVisible();
    const handle = document.querySelector<HTMLElement>(
      '[data-slot="drawer-popup"] [aria-hidden="true"]',
    );
    if (!handle) throw new Error("Drawer handle is missing");
    const bounds = handle.getBoundingClientRect();
    const clientX = bounds.left + bounds.width / 2;
    const startY = bounds.top + bounds.height / 2;
    const endY = startY + 180;
    const touchAt = (clientY: number) =>
      new Touch({
        identifier: 11,
        target: handle,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
      });
    const dispatchTouch = (type: "touchstart" | "touchmove" | "touchend", clientY: number) => {
      const touch = touchAt(clientY);
      handle.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          touches: type === "touchend" ? [] : [touch],
          targetTouches: type === "touchend" ? [] : [touch],
          changedTouches: [touch],
        }),
      );
    };
    const pointerEvent = (type: "pointerdown" | "pointermove" | "pointerup", clientY: number) =>
      handle.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 11,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX,
          clientY,
        }),
      );

    act(() => {
      dispatchTouch("touchstart", startY);
      pointerEvent("pointerdown", startY);
      [startY + 60, startY + 120, endY].forEach((clientY) => {
        dispatchTouch("touchmove", clientY);
        pointerEvent("pointermove", clientY);
      });
      pointerEvent("pointerup", endY);
      dispatchTouch("touchend", endY);
    });

    await expectDrawerAbsent();
    expect(chart.querySelector("[data-custom-tooltip]")).toBeNull();
  });

  it("invalidates the open snapshot after viewport or pointer-mode changes", async () => {
    await page.viewport(375, 667);
    renderBrowserComponent(<DrawerPayloadFixture />);

    const { dialog } = await openFirstDrawer();
    await page.viewport(430, 667);
    window.dispatchEvent(new Event("resize"));
    await expect.element(dialog).not.toBeInTheDocument();
    await expectDrawerAbsent();

    await openFirstDrawer();
    document.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 3,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
    await expect.element(dialog).not.toBeInTheDocument();
    await expectDrawerAbsent();
  });
});
