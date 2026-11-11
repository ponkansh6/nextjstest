// Pixel 7 412x915 Browser Mode cases.
// Case bodies remain grouped in blocks to keep fixture names and imports scoped.
import quarterlyNominalCsv from "../../data/source/cti_data2025_distribution_adjusted_quarterly.csv?raw";
import { BottomSheet } from "../../src/app/components/BottomSheet";
import { CagrPanel } from "../../src/app/components/CagrPanel";
import { ChartFilters } from "../../src/app/components/ChartFilters";
import ChartInfoContentRenderer from "../../src/app/components/ChartInfoContentRenderer";
import { CustomTooltip } from "../../src/app/components/CustomTooltip";
import { LazyMount } from "../../src/app/components/LazyMount";
import { NewGraph } from "../../src/app/components/NewGraph";
import { SectionTabs } from "../../src/app/components/SectionTabs";
import { SpendingBarChart } from "../../src/app/components/SpendingBarChart";
import { StackedAreaChart } from "../../src/app/components/StackedAreaChart";
import {
  createChartTooltipSelectionResolver,
  useChartTooltipController,
} from "../../src/app/components/charts/useChartTooltipProps";
import { CPI_CHART_SECTIONS } from "../../src/app/components/cpiChartConfig";
import DialogOptionsDemo from "../../src/app/ui-experiments/DialogOptionsDemo";
import { useCagrState } from "../../src/hooks/useCagrState";
import { useSectionNavigation } from "../../src/hooks/useSectionNavigation";
import { getColorForNominalKey, getLegendLabel } from "../../src/lib/chartConstants";
import type { SeriesMetadata } from "../../src/lib/chartConstants";
import {
  QUARTERLY_PUBLIC_NOMINAL_KEYS,
  QUARTERLY_PUBLIC_REAL_KEYS,
} from "../../src/lib/quarterlyPublicProjection";
import {
  getSpendingPresentationLabel,
  orderSpendingPresentationKeys,
} from "../../src/lib/spendingSeriesPresentation";
import type { CpiData } from "../../src/types";
import type { CustomTooltipProps } from "../../src/types/chart";
import { setBrowserTestSearchParams } from "./browser-search-params";
import { renderBrowserComponent } from "./renderBrowserComponent";
import { act, waitFor } from "@testing-library/react";
import { cloneElement, useCallback, useRef, useState } from "react";
import type { ComponentProps, ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

{
  afterEach(() => {
    window.__MOUNT_ALL__ = false;
  });

  describe("B3m responsive", () => {
    beforeEach(() => setBrowserTestSearchParams("from=2020&to=2022"));
    it("p45-b-mobile-ux-243", async () => {
      renderBrowserComponent(
        <SectionTabs
          sections={CPI_CHART_SECTIONS}
          activeId="section-stacked"
          onSelect={() => {}}
          rangeLabel="2020–2022"
          onRangeClick={() => {}}
        />,
      );
      const tabs = document.querySelector<HTMLElement>("[class*='sectionTabs']");
      if (!tabs) throw new Error("Actual SectionTabs element was not rendered");
      expect(getComputedStyle(tabs).position).toBe("sticky");
      expect(getComputedStyle(tabs).transform).not.toBe("none");
    });
  });
}

{
  describe("BottomSheet focus containment in Chromium", () => {
    it("keeps real browser Tab navigation inside the open sheet", async () => {
      const { unmount } = renderBrowserComponent(
        <>
          <button type="button">Outside action</button>
          <BottomSheet open title="Focus trap fixture" onClose={() => {}}>
            <button type="button">First sheet action</button>
            <button type="button">Last sheet action</button>
          </BottomSheet>
        </>,
      );

      const dialog = page.getByRole("dialog", { name: "Focus trap fixture" });
      await expect.element(dialog).toBeVisible();
      const dialogElement = await dialog.element();
      const closeButton = dialog.getByRole("button", { name: "閉じる" });
      expect(document.activeElement).toBe(await closeButton.element());

      // The actual BottomSheet hook wraps forward browser Tab navigation at the last control.
      for (let index = 0; index < 3; index += 1) {
        await userEvent.keyboard("{Tab}");
        expect(dialogElement.contains(document.activeElement)).toBe(true);
      }
      expect(document.activeElement).toBe(await closeButton.element());

      unmount();
      renderBrowserComponent(<DialogOptionsDemo />);

      const trigger = page.getByRole("button", { name: "Drawerを開く" });
      const triggerElement = await trigger.element();

      await trigger.click();
      const drawerDialog = page.getByRole("dialog", { name: "シート型のドロワー" });
      await expect.element(drawerDialog).toBeVisible();
      const drawerDialogElement = await drawerDialog.element();
      await expect.poll(() => drawerDialogElement.contains(document.activeElement)).toBe(true);

      await userEvent.keyboard("{Escape}");
      await expect.element(drawerDialog).not.toBeInTheDocument();
      await expect.poll(() => document.activeElement).toBe(triggerElement);

      await trigger.click();
      await expect.element(drawerDialog).toBeVisible();
      const reopenedDialogElement = await drawerDialog.element();
      await expect.poll(() => reopenedDialogElement.contains(document.activeElement)).toBe(true);

      const backdrop = document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]');
      expect(backdrop).not.toBeNull();
      if (!backdrop) throw new Error("Base UI Drawer backdrop is unavailable");
      const hitTarget = document.elementFromPoint(10, 10);
      expect(hitTarget).not.toBeNull();
      if (!hitTarget) throw new Error("The (10,10) point has no outside hit target");
      await userEvent.click(hitTarget);

      await expect.element(drawerDialog).not.toBeInTheDocument();
      await expect.poll(() => document.activeElement).toBe(triggerElement);
    });
  });
}

{
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
    it("keeps keyboard focus through Escape and closes the reopened sheet from its backdrop", async () => {
      expect(window.innerWidth).toBe(412);
      expect(window.innerHeight).toBe(915);
      renderBrowserComponent(<CagrFixtureWithGlobalBaseline />);

      const trigger = page.getByRole("button", { name: /年率上昇率（CAGR）を計算/ });
      const triggerElement = await trigger.element();
      const triggerRect = triggerElement.getBoundingClientRect();
      expect(triggerRect.height).toBeGreaterThanOrEqual(44);
      expect(triggerRect.width).toBeGreaterThanOrEqual(44);
      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(triggerElement);
      await userEvent.keyboard("{Enter}");
      const dialog = page.getByRole("dialog", { name: "年率上昇率（CAGR）" });
      await expect.element(dialog).toBeVisible();
      await userEvent.keyboard("{Escape}");
      await expect.element(dialog).not.toBeInTheDocument();
      await expect.poll(() => document.activeElement).toBe(triggerElement);

      await trigger.click();
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

    it("fits the calculated result and keeps its detail and note inside the Pixel 7 viewport", async () => {
      const dialog = await calculateFixtureResult(412, 915);
      const sheet = await dialog.element();
      expect(sheet.scrollHeight - sheet.clientHeight).toBeLessThanOrEqual(0);

      const detail = dialog.getByText("2015年01月 → 2020年01月", { exact: true });
      const note = dialog.getByText("※凡例で選択した費目の合計を基準に算出", { exact: true });
      await expect.element(detail).toBeVisible();
      await expect.element(note).toBeVisible();

      const detailBottom = (await detail.element()).getBoundingClientRect().bottom;
      const noteBottom = (await note.element()).getBoundingClientRect().bottom;
      expect(detailBottom).toBeLessThanOrEqual(915);
      expect(noteBottom).toBeLessThanOrEqual(915);
    });
  });
}

{
  describe("ChartInfoContent disclosure in Chromium", () => {
    it("supports keyboard disclosure, focus, scrolling, and reopening", async () => {
      renderBrowserComponent(<ChartInfoContentRenderer chartKey="consumption-expenditure" />);

      const trigger = page.getByRole("button", { name: "データソースの説明を表示" });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "データソースの説明を表示" });
      await expect.element(dialog).toBeVisible();

      const details = (await dialog.element()).querySelector("details");
      const summary = (await page.getByText("2016年以前の推計方法").element()) as HTMLElement;
      if (!details) throw new Error("Consumption disclosure details element is missing");
      expect(details.open).toBe(false);

      // The close button and source link precede summary in the dialog's tab order.
      await userEvent.keyboard("{Tab}");
      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(summary);
      expect(summary.matches(":focus-visible")).toBe(true);
      const focusStyle = window.getComputedStyle(summary);
      expect(focusStyle.outlineStyle).toBe("solid");
      expect(Number.parseFloat(focusStyle.outlineWidth)).toBe(2);
      expect(focusStyle.outlineColor).not.toBe("transparent");

      await userEvent.keyboard(" ");
      expect(details.open).toBe(true);

      const popup = (await dialog.element()) as HTMLElement;
      expect(window.getComputedStyle(popup).overflowY).toBe("auto");
      expect(popup.scrollHeight).toBeGreaterThan(popup.clientHeight);
      const popupBounds = popup.getBoundingClientRect();
      expect(popupBounds.top).toBeGreaterThanOrEqual(0);
      expect(popupBounds.bottom).toBeLessThanOrEqual(window.innerHeight);

      await userEvent.keyboard("{Escape}");
      await expect.element(dialog).not.toBeInTheDocument();
      expect(document.activeElement).toBe(await trigger.element());

      await trigger.click();
      await expect.element(dialog).toBeVisible();
      const reopenedDetails = (await dialog.element()).querySelector("details");
      expect(reopenedDetails?.open).toBe(false);
    });
  });
}

{
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

  const chartColors = {
    barFill: "#94a3b8",
    gridStroke: "#e2e8f0",
    axisText: "#64748b",
    tooltipBg: "var(--tooltip-bg)",
    tooltipText: "var(--tooltip-text)",
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
    data = chartData,
    getSelectionLabel = (row: ComponentProps<typeof SpendingBarChart>["data"][number]) => row.label,
    omitPeriodFromPayload = false,
  }: {
    isTouch?: boolean;
    drawerEnabled?: boolean;
    onClosedDrawerCompletion?: (complete: (open: boolean) => void) => void;
    data?: ComponentProps<typeof SpendingBarChart>["data"];
    getSelectionLabel?: (
      row: ComponentProps<typeof SpendingBarChart>["data"][number],
    ) => string | undefined;
    omitPeriodFromPayload?: boolean;
  }) {
    const tooltip = useChartTooltipController({ suppressed: false, isTouch });
    const resolveSelection = createChartTooltipSelectionResolver(
      data,
      () =>
        orderedVisibleKeys.map((key) => ({
          key,
          name: getSpendingPresentationLabel(key) ?? getLegendLabel(key),
          color: chartColorsByKey[key],
        })),
      getSelectionLabel,
    );
    const selectionPayloadAtIndex = (index: number) => {
      const selection = resolveSelection(index);
      if (!selection || !omitPeriodFromPayload) return selection;
      return {
        ...selection,
        label: undefined,
        payload: selection.payload.map((entry) => {
          if (!entry.payload || typeof entry.payload !== "object") return entry;
          const row = { ...(entry.payload as Record<string, unknown>) };
          delete row["年月"];
          delete row.label;
          return { ...entry, payload: row };
        }),
      };
    };
    const selected = tooltip.bind("drawer-payload-contract", {
      dataLength: data.length,
      drawerEnabled,
      showTotal: true,
      showAllPayload: true,
      showMeasurementNotes: false,
      allowedKeys: visibleKeys,
      selectionPayloadAtIndex,
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
            data={data}
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
              if (!selected.onPointerUp)
                throw new Error("Controller omitted its pointerup handler");
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
      [
        ...wrapper.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle [data-index] path"),
      ].find((path) => {
        const indexed = path.closest<SVGElement>("[data-index]");
        const bounds = path.getBoundingClientRect();
        return (
          indexed != null &&
          (sourceRowIndex === undefined || indexed.getAttribute("data-index") === sourceRowIndex) &&
          path.isConnected &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      });
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

  function expectDrawerPeriod(dialog: Element, period: string) {
    expect(dialog.querySelector("#chart-point-drawer-title")?.textContent).toBe(period);
    const tooltip = dialog.querySelector("[data-custom-tooltip]");
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).not.toContain(period);
  }

  async function tapChartFamilyAtPeriod(family: "area" | "line", selectedPeriod: string) {
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
    expectDrawerPeriod(await dialog.element(), selectedPeriod);
  }

  function dispatchTouchAt(target: Element, clientX: number, clientY: number) {
    const pointer = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 43,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX,
      clientY,
    } as const;
    target.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
    target.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
  }

  it("B13 #473: outside-heading touch clears stacked chart cursor and active dots", async () => {
    await tapChartFamilyAtPeriod("area", "2018Q2");
    expect(document.querySelectorAll(".recharts-tooltip-cursor")).toHaveLength(1);
    expect(document.querySelectorAll(".recharts-active-dot").length).toBeGreaterThan(0);
    const chart = document.querySelector<HTMLElement>('[data-testid="family-area-chart"]');
    if (!chart) throw new Error("Local stacked chart is missing");
    const heading = chart.querySelector<HTMLHeadingElement>("h2");
    if (!heading) throw new Error("Local stacked chart heading is missing");
    const bounds = heading.getBoundingClientRect();
    const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const outsideHitTarget = document.elementFromPoint(point.x, point.y);
    if (!outsideHitTarget) throw new Error("Outside-heading touch has no local hit target");
    dispatchTouchAt(outsideHitTarget, point.x, point.y);
    await userEvent.click(page.elementLocator(outsideHitTarget));
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    const surface = chart.querySelector<SVGSVGElement>("svg.recharts-surface");
    if (!surface) throw new Error("Local stacked chart surface is missing after Drawer close");
    // Prime the real chart pointer path, then leave it for the outside heading.
    await userEvent.hover(page.elementLocator(surface));
    await userEvent.hover(page.elementLocator(heading));
    expect(document.querySelectorAll(".recharts-tooltip-cursor")).toHaveLength(0);
    expect(document.querySelectorAll(".recharts-active-dot")).toHaveLength(0);
  });

  it("B13 #508: close touch clears stacked chart active dots", async () => {
    await tapChartFamilyAtPeriod("area", "2018Q2");
    expect(document.querySelectorAll(".recharts-active-dot").length).toBeGreaterThan(0);
    const dialog = page.getByRole("dialog");
    const closeButton = await dialog.getByRole("button", { name: "閉じる" }).element();
    if (!(closeButton instanceof HTMLButtonElement)) {
      throw new Error("Local stacked chart close control is not an HTML button");
    }
    const bounds = closeButton.getBoundingClientRect();
    dispatchTouchAt(closeButton, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    closeButton.click();
    await expect.element(dialog).not.toBeInTheDocument();
    expect(document.querySelectorAll(".recharts-active-dot")).toHaveLength(0);
  });

  describe("chart tooltip Drawer datum selection", () => {
    it("selects the exact Area datum with a zero-movement touch", async () => {
      await tapChartFamilyAtPeriod("area", "2018Q2");
    });

    it("selects the exact range-filtered Line datum with a zero-movement touch", async () => {
      await tapChartFamilyAtPeriod("line", "2018Q3");
    });

    it("keeps a new selection after the previous Drawer exit completes", async () => {
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
      expectDrawerPeriod(await dialog.element(), "2018Q2");

      // Deliver the callback captured from the closed render after row B has reopened the Drawer.
      act(() => staleCloseCompletion?.(false));
      await waitFor(() => expect(controllerState.dataset.drawerOpen).toBe("true"));
      const currentTooltip = document.querySelector<HTMLElement>(
        '[data-slot="drawer-popup"] [data-custom-tooltip]',
      );
      expect(currentTooltip).not.toBeNull();
      expect(
        document.querySelector<HTMLElement>('[data-slot="drawer-popup"] #chart-point-drawer-title')
          ?.textContent,
      ).toBe("2018Q2");
      expect(currentTooltip?.textContent).not.toContain("2018Q2");
    });
  });
}

{
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
      renderBrowserComponent(<DistantLazyMountFixture />);

      const chart = page.getByTestId("lazy-chart-target");
      await expect.element(chart).not.toBeInTheDocument();

      window.scrollTo(0, document.body.scrollHeight);

      await expect.element(chart).toBeInTheDocument();
    });
  });
}

{
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

  async function expectComponentScroll(
    label: string,
    targetId: string,
    assertTargetInViewport = false,
  ) {
    renderBrowserComponent(<SectionNavigationFixture targetId={targetId} />);
    const before = window.scrollY;
    const tab = page.getByRole("button", { name: label, exact: true });
    await expect.element(tab).toBeVisible();
    await userEvent.click(await tab.element());
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    expect(window.scrollY).toBeGreaterThan(before);

    if (assertTargetInViewport) {
      const target = document.getElementById(targetId);
      expect(target).not.toBeNull();
      const rect = target!.getBoundingClientRect();
      expect(rect.bottom).toBeGreaterThan(0);
      expect(rect.top).toBeLessThan(window.innerHeight);
    }
  }

  async function expectLazySectionInitiallyAbsent(targetId: string) {
    renderBrowserComponent(<LazySectionFixture targetId={targetId} />);
    await expect.element(page.getByTestId("lazy-section-content")).not.toBeInTheDocument();
  }

  describe("B3m SectionTabs", () => {
    it("p45-b-section-tabs-scroll-47-case02-chromium", async () => {
      await expectComponentScroll("給与", "section-earnings");
    });

    it("p45-b-section-tabs-scroll-82-case02-chromium", async () => {
      await expectLazySectionInitiallyAbsent("section-earnings");
    });
  });
}

{
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
    expect(window.innerWidth).toBe(412);
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
    expect(window.innerWidth).toBe(412);
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
    it("keeps Pixel 7 year selects equal, aligned, and ordered before the max-range control", async () => {
      const { startBox, endBox, buttonBox } = await renderMobileFilters();

      expect(startBox).not.toBeNull();
      expect(endBox).not.toBeNull();
      expect(buttonBox).not.toBeNull();
      expect(Math.abs(startBox.width - endBox.width)).toBeLessThanOrEqual(4);
      expect(Math.abs(startBox.y - endBox.y)).toBeLessThan(15);
      expect(Math.abs(endBox.y - buttonBox.y)).toBeLessThan(15);
      expect(startBox.x).toBeLessThan(endBox.x);
      expect(endBox.x + endBox.width).toBeLessThanOrEqual(buttonBox.x + 10);
      expect(buttonBox.x).toBeGreaterThanOrEqual(endBox.x + endBox.width - 1);
      const verticalDiff = Math.abs(endBox.y - buttonBox.y);
      const maxAllowedVerticalDiff = Math.min(endBox.height, buttonBox.height) * 0.5;
      expect(verticalDiff).toBeLessThan(maxAllowedVerticalDiff);
      expect(buttonBox.x + buttonBox.width).toBeGreaterThan(endBox.x + endBox.width);
    });
  });

  describe("mobile SectionTabs tap targets in Chromium", () => {
    it("p45-b-mobile-ux-19-ux — P42-323/-324: renders actual section controls meeting the 44px target", async () => {
      expect(window.innerWidth).toBe(412);
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
    it("hides the scrollbar, shows the right-edge fade, and remains horizontally scrollable", async () => {
      const scrollContainer = await renderOverflowingSectionTabs();
      const styles = getComputedStyle(scrollContainer);

      expect(styles.scrollbarWidth).toBe("none");
      expect(styles.maskImage).not.toBe("none");
      expect(
        (styles as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage,
      ).not.toBe("none");

      const before = scrollContainer.scrollLeft;
      scrollContainer.scrollLeft = scrollContainer.scrollWidth;
      expect(scrollContainer.scrollWidth).toBeGreaterThan(scrollContainer.clientWidth);
      expect(scrollContainer.scrollLeft).toBeGreaterThan(before);
    });
  });
}

{
  type ConsumptionKind = "nominal" | "real";

  const SERIES = {
    nominal: {
      title: "消費支出（名目）",
      entries: [
        { key: "食料（名目）", value: 123 },
        { key: "住居（名目）", value: 80 },
      ],
    },
    real: {
      title: "消費支出（実質）",
      entries: [
        { key: "食料（実質）", value: 456 },
        { key: "住居（実質）", value: 260 },
        { key: "光熱・水道（実質）", value: 98 },
      ],
    },
  } as const;

  const CHART_COLORS = {
    barFill: "#94a3b8",
    gridStroke: "#e2e8f0",
    axisText: "#64748b",
    axisTextEmphasis: "#0f172a",
  };

  function requireChartElement<E extends Element>(root: Element, selector: string): E {
    const element = root.querySelector<E>(selector);
    if (!element) throw new Error(`Missing chart element: ${selector}`);
    return element;
  }

  function isVisible(element: Element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"
    );
  }

  function SpendingFixture({
    kind,
    testId = `chart-${kind}`,
  }: {
    kind: ConsumptionKind;
    testId?: string;
  }) {
    const series = SERIES[kind];
    const keys = series.entries.map(({ key }) => key);
    const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
    const { bind } = useChartTooltipController({ suppressed: false, isTouch: false });
    const tooltip = bind(`browser-${testId}`, {
      dataLength: 1,
      showTotal: true,
      showAllPayload: true,
      includeUnmappedPayload: true,
    });

    return (
      <SpendingBarChart
        title={series.title}
        testId={testId}
        data={[
          {
            label: "2025Q1",
            年: 2025,
            quarter: 1,
            年月: "2025Q1",
            ...Object.fromEntries(series.entries.map(({ key, value }) => [key, value])),
          },
        ]}
        keys={keys}
        colors={series.entries.map((_, index) => (index % 2 === 0 ? "#be123c" : "#1d4ed8"))}
        hiddenKeys={hiddenKeys}
        onToggle={(key) =>
          setHiddenKeys((current) =>
            current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
          )
        }
        chartColors={CHART_COLORS}
        tooltipProps={tooltip.tooltipProps}
        onPointerDown={tooltip.onPointerDown}
        onPointerMove={tooltip.onPointerMove}
        onMouseMove={tooltip.onMouseMove}
        onPointerLeave={tooltip.onPointerLeave}
        onMouseLeave={tooltip.onMouseLeave}
        hiddenQuarters={[]}
        onToggleQuarter={() => {}}
        onReset={() => setHiddenKeys(keys)}
        legendMode="collapsible"
        defaultLegendOpen={kind === "nominal"}
        isMobile
      />
    );
  }

  function B3MobileAcceptanceFixture() {
    const keys = [...QUARTERLY_PUBLIC_NOMINAL_KEYS];
    const data: ComponentProps<typeof SpendingBarChart>["data"] = [
      {
        label: "2020Q1",
        年: 2020,
        quarter: 1,
        年月: "2020Q1",
        ...Object.fromEntries(keys.map((key, index) => [key, 10 + index])),
        "民間最終消費支出（名目）": null,
      },
    ];
    const controller = useChartTooltipController({ suppressed: false, isTouch: true });
    const tooltip = controller.bind("b3m-mobile-acceptance", {
      dataLength: data.length,
      showAllPayload: true,
      includeUnmappedPayload: true,
      selectionPayloadAtIndex: createChartTooltipSelectionResolver(data, () =>
        keys.map((key, index) => ({ key, color: getColorForNominalKey(key) ?? `#${index}` })),
      ),
    });

    return (
      <div style={{ width: 375 }}>
        <SpendingBarChart
          title="消費支出（名目）"
          testId="b3m-mobile-tooltip-chart"
          data={data}
          keys={keys}
          colors={keys.map(getColorForNominalKey)}
          hiddenKeys={[]}
          onToggle={() => {}}
          chartColors={CHART_COLORS}
          tooltipProps={tooltip.tooltipProps}
          onClick={tooltip.onClick}
          onPointerDown={tooltip.onPointerDown}
          onPointerUp={tooltip.onPointerUp}
          onPointerCancel={tooltip.onPointerCancel}
          onKeyDown={tooltip.onKeyDown}
          onPointerMove={tooltip.onPointerMove}
          onMouseMove={tooltip.onMouseMove}
          onPointerLeave={tooltip.onPointerLeave}
          onMouseLeave={tooltip.onMouseLeave}
          hiddenQuarters={[]}
          onToggleQuarter={() => {}}
          onReset={() => {}}
          isMobile
        />
        {controller.drawer}
      </div>
    );
  }

  function Pixel7SpendingCompositeFixture() {
    return (
      <main style={{ display: "grid", gap: 16, width: "100%" }}>
        <B3MobileAcceptanceFixture />
        <SpendingFixture kind="nominal" />
        <SpendingFixture kind="real" />
        <SpendingFixture kind="nominal" testId="chart-nominal-clear-restore" />
        <SpendingFixture kind="nominal" testId="chart-nominal-all-series" />
      </main>
    );
  }

  describe("Pixel 7 SpendingBarChart interactions in Chromium", () => {
    it("consolidates B3 mobile acceptance with spending legends, hover, and filtering", async () => {
      expect(window.innerWidth).toBe(412);
      expect(window.innerHeight).toBe(915);
      renderBrowserComponent(<Pixel7SpendingCompositeFixture />);

      // B3 mobile acceptance: a touch on a rendered nominal bar opens the
      // datum Drawer, which presents the selected quarter and closes cleanly.
      const b3Chart = await page.getByTestId("b3m-mobile-tooltip-chart").element();
      const b3Bar = b3Chart.querySelector<SVGElement>(".recharts-bar-rectangle");
      if (!b3Bar) throw new Error("B3 mobile acceptance bar is missing");
      expect(b3Bar).toBeVisible();
      expect(b3Bar.isConnected).toBe(true);
      const b3IndexedShape = b3Bar.querySelector<SVGElement>("[data-index]");
      if (!b3IndexedShape) throw new Error("B3 mobile acceptance bar has no source-row index");
      const b3HitTarget = b3IndexedShape.querySelector<SVGElement>("path, rect") ?? b3IndexedShape;
      expect(b3HitTarget.isConnected).toBe(true);
      const b3Bounds = b3HitTarget.getBoundingClientRect();
      const b3Touch = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 3,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: b3Bounds.left + b3Bounds.width / 2,
        clientY: b3Bounds.top + b3Bounds.height / 2,
      };
      b3HitTarget.dispatchEvent(new PointerEvent("pointerdown", { ...b3Touch, buttons: 1 }));
      b3HitTarget.dispatchEvent(new PointerEvent("pointerup", { ...b3Touch, buttons: 0 }));
      const b3Dialog = page.getByRole("dialog");
      await expect.element(b3Dialog).toBeVisible();
      expect((await b3Dialog.element()).textContent).toContain("2020Q1");
      const b3Close = page.getByRole("button", { name: "閉じる" });
      await expect.element(b3Close).toBeVisible();
      await b3Close.click();
      await expect.element(b3Dialog).not.toBeInTheDocument();

      // Both nominal and real legends expose quarter controls and at least
      // 32px touch targets.
      for (const kind of ["nominal", "real"] as const) {
        const chart = page.getByTestId(`chart-${kind}`);
        const chartElement = await chart.element();
        const details = requireChartElement<HTMLDetailsElement>(chartElement, "details");
        if (!details.open) {
          await userEvent.click(requireChartElement<HTMLElement>(chartElement, "details summary"));
        }
        await expect.element(chart.getByRole("button", { name: "Q1" })).toBeVisible();
        for (const { key } of SERIES[kind].entries) {
          await expect.element(chart.getByTestId(`legend-${key}`)).toBeVisible();
        }
        const buttons = Array.from(
          chartElement.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
        );
        const sizes = buttons.map((button) => {
          const bounds = button.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        });
        expect(sizes.length).toBeGreaterThan(0);
        expect(sizes.every(({ width, height }) => width >= 32 && height >= 32)).toBe(true);
      }

      // Recharts hover exposes the expected payload for both spending modes.
      for (const kind of ["nominal", "real"] as const) {
        const chart = page.getByTestId(`chart-${kind}`);
        const chartElement = await chart.element();
        const bar = requireChartElement<SVGElement>(chartElement, ".recharts-bar-rectangle");
        await userEvent.hover(bar);
        const tooltip = requireChartElement<HTMLElement>(
          chartElement,
          '[data-custom-tooltip="true"]',
        );
        expect(isVisible(tooltip)).toBe(true);
        const [firstSeries] = SERIES[kind].entries;
        const payload = requireChartElement<HTMLElement>(
          tooltip,
          `[data-tooltip-key="${firstSeries.key}"]`,
        );
        expect(isVisible(payload)).toBe(true);
        expect(payload.textContent).toContain(firstSeries.value.toFixed(2));
      }

      // A nominal category filter reduces rendered bars.
      const nominal = page.getByTestId("chart-nominal");
      const nominalElement = await nominal.element();
      const category = nominal.getByTestId("legend-食料（名目）");
      const initialCount = nominalElement.querySelectorAll(".recharts-bar-rectangle").length;
      expect(initialCount).toBeGreaterThan(0);
      await userEvent.click(await category.element());
      await expect.element(category).toHaveAttribute("aria-pressed", "false");
      const filteredCount = nominalElement.querySelectorAll(".recharts-bar-rectangle").length;
      expect(filteredCount).toBeLessThan(initialCount);
      await expect.element(nominal).toBeVisible();
      await userEvent.click(await category.element());
      await expect.element(category).toHaveAttribute("aria-pressed", "true");
      expect(nominalElement.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0);

      // Nominal legend clear/restore, with a separate all-series fixture to
      // preserve the original all-series visibility behavior independently.
      for (const testId of ["chart-nominal-clear-restore", "chart-nominal-all-series"]) {
        const chart = page.getByTestId(testId);
        const chartElement = await chart.element();
        const details = requireChartElement<HTMLDetailsElement>(chartElement, "details");
        if (!details.open) {
          await userEvent.click(requireChartElement<HTMLElement>(chartElement, "details summary"));
        }
        expect(chartElement.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0);
        const clear = chart.getByRole("button", { name: "全選択解除" });
        await userEvent.click(await clear.element());
        for (const { key } of SERIES.nominal.entries) {
          await expect
            .element(chart.getByTestId(`legend-${key}`))
            .toHaveAttribute("aria-pressed", "false");
        }
        expect(chartElement.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(0);
        const restore = chart.getByTestId(`legend-${SERIES.nominal.entries[0].key}`);
        await userEvent.click(await restore.element());
        await expect.element(restore).toHaveAttribute("aria-pressed", "true");
        expect(chartElement.querySelectorAll(".recharts-bar-rectangle").length).toBeGreaterThan(0);
      }
    });
  });
}
{
  const CHART_COLORS = {
    barFill: "#94a3b8",
    gridStroke: "#e2e8f0",
    axisText: "#64748b",
    axisTextEmphasis: "#0f172a",
    tooltipBg: "#ffffff",
    tooltipText: "#1f2937",
  };

  function NominalTouchScrollDismissFixture() {
    const controller = useChartTooltipController({ suppressed: false, isTouch: true });
    const data = [{ label: "2025Q1", 年: 2025, quarter: 1, 年月: "2025Q1", "食料（名目）": 123 }];
    const tooltip = controller.bind("browser-nominal-scroll-dismiss", {
      dataLength: data.length,
      selectionPayloadAtIndex: createChartTooltipSelectionResolver(data, () => [
        { key: "食料（名目）", color: "#be123c" },
      ]),
    });

    return (
      <>
        <div style={{ height: 24 }} />
        <div style={{ width: 1000 }}>
          <SpendingBarChart
            title="消費支出（名目）"
            testId="spending-chart-scroll-dismiss"
            data={data}
            keys={["食料（名目）"]}
            colors={["#be123c"]}
            hiddenKeys={[]}
            onToggle={() => {}}
            chartColors={CHART_COLORS}
            tooltipProps={tooltip.tooltipProps}
            onClick={tooltip.onClick}
            onPointerDown={tooltip.onPointerDown}
            onPointerUp={tooltip.onPointerUp}
            onPointerCancel={tooltip.onPointerCancel}
            onKeyDown={tooltip.onKeyDown}
            onPointerMove={tooltip.onPointerMove}
            onMouseMove={tooltip.onMouseMove}
            onPointerLeave={tooltip.onPointerLeave}
            onMouseLeave={tooltip.onMouseLeave}
            hiddenQuarters={[]}
            onToggleQuarter={() => {}}
            onReset={() => {}}
            legendMode="expanded"
            isMobile
          />
        </div>
        {controller.drawer}
        <div aria-hidden="true" style={{ height: 1200 }} />
      </>
    );
  }

  describe("touch Drawer dismissal", () => {
    it("keeps the selected data open while the modal Drawer owns scrolling", async () => {
      renderBrowserComponent(<NominalTouchScrollDismissFixture />);

      const chart = await page.getByTestId("spending-chart-scroll-dismiss").element();
      const initialBar = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
      if (!initialBar) throw new Error("Scroll dismissal spending bar is missing");
      const initialIndexedShape = initialBar.querySelector<SVGElement>("[data-index]");
      if (!initialIndexedShape) throw new Error("Scroll dismissal bar has no source-row index");
      const initialHitTarget =
        initialIndexedShape.querySelector<SVGElement>("path, rect") ?? initialIndexedShape;
      const bar = page.elementLocator(initialHitTarget);
      await expect.element(bar).toBeVisible();

      const currentBar = chart.querySelector<SVGElement>(".recharts-bar-rectangle");
      if (!currentBar) throw new Error("Scroll dismissal spending bar disappeared");
      const currentIndexedShape = currentBar.querySelector<SVGElement>("[data-index]");
      if (!currentIndexedShape) throw new Error("Scroll dismissal bar lost its source-row index");
      const hitTarget =
        currentIndexedShape.querySelector<SVGElement>("path, rect") ?? currentIndexedShape;
      expect(hitTarget.isConnected).toBe(true);
      const bounds = hitTarget.getBoundingClientRect();
      const pointer = {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      };
      hitTarget.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
      hitTarget.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));

      const dialog = page.getByRole("dialog");
      await expect.element(dialog).toBeVisible();
      const closeButton = dialog.getByRole("button", { name: "閉じる" });
      await expect.element(closeButton).toBeVisible();

      window.scrollTo(0, window.scrollY + 60);

      await expect.element(dialog).toBeVisible();
      await closeButton.click();
      await expect.element(dialog).not.toBeInTheDocument();
    });
  });
}

{
  vi.setConfig({ testTimeout: 90_000 });

  type Pixel7Evidence = {
    viewport: { width: number; height: number };
    screen: { width: number; height: number };
    deviceScaleFactor: number;
    touchPoints: number;
    userAgent: string;
    isMobile: boolean;
  };

  function expectPixel7FixedViewport(evidence: Pixel7Evidence) {
    expect(evidence.viewport).toEqual({ width: 412, height: 915 });
    expect(evidence.screen).toEqual({ width: 412, height: 915 });
    expect(evidence.deviceScaleFactor).toBe(2.625);
    expect(evidence.touchPoints).toBeGreaterThan(0);
    expect(evidence.userAgent).toContain("Pixel 7");
    expect(evidence.isMobile).toBe(true);
  }

  it("B12 #307: deliberately engineered actual link overlap is hit-tested by tooltip and blocks navigation", async () => {
    expectPixel7FixedViewport({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: { width: window.screen.width, height: window.screen.height },
      deviceScaleFactor: window.devicePixelRatio,
      touchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent,
      isMobile: matchMedia("(pointer: coarse)").matches,
    });
    const originalUrl = window.location.href;
    renderBrowserComponent(
      <div
        data-testid="tooltip-link-overlap"
        style={{ position: "fixed", left: 40, top: 200, width: 240, height: 120 }}
      >
        <a
          data-chart-note-link
          href="#section-consumption-nominal"
          style={{ position: "absolute", inset: 0, zIndex: 1 }}
        >
          Chart note link
        </a>
        <div
          data-custom-tooltip="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            background: "white",
            pointerEvents: "auto",
          }}
        >
          Touch tooltip
        </div>
      </div>,
    );
    const tooltip = document.querySelector<HTMLElement>("[data-custom-tooltip]");
    const link = document.querySelector<HTMLAnchorElement>("a[data-chart-note-link]");
    if (!tooltip || !link) throw new Error("Overlapping tooltip or chartNote link is missing");
    const tooltipBox = tooltip.getBoundingClientRect();
    const linkBox = link.getBoundingClientRect();
    expect(tooltipBox.left).toBe(linkBox.left);
    expect(tooltipBox.top).toBe(linkBox.top);
    expect(tooltipBox.width).toBe(linkBox.width);
    expect(tooltipBox.height).toBe(linkBox.height);
    const x = tooltipBox.left + tooltipBox.width / 2;
    const y = tooltipBox.top + tooltipBox.height / 2;
    const hitTarget = document.elementFromPoint(x, y);
    expect(hitTarget?.closest("[data-custom-tooltip]")).toBe(tooltip);
    expect(hitTarget?.closest("a[data-chart-note-link]")).toBeNull();
    const pointer = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 77,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y,
    } as const;
    hitTarget?.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
    hitTarget?.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
    hitTarget?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
      }),
    );
    expect(window.location.href).toBe(originalUrl);
  });
}

{
  const NAVIGATION_SECTIONS = [
    { id: "pixel7-local-scroll-chart", label: "費目別" },
    { id: "pixel7-local-scroll-target", label: "給与" },
  ];
  const LOCAL_STACKED_KEY = "fixture-area";
  const LOCAL_STACKED_SERIES = {
    key: LOCAL_STACKED_KEY,
    label: "Area value",
    color: "#be123c",
  } as const;
  const LOCAL_STACKED_DATA: CpiData[] = [
    { 年月: "2020Q1", [LOCAL_STACKED_KEY]: 100 } as unknown as CpiData,
    { 年月: "2020Q2", [LOCAL_STACKED_KEY]: 120 } as unknown as CpiData,
    { 年月: "2020Q3", [LOCAL_STACKED_KEY]: 140 } as unknown as CpiData,
  ];

  function Pixel7ProgrammaticScrollFixture() {
    const navigation = useSectionNavigation({ sections: NAVIGATION_SECTIONS });
    const controller = useChartTooltipController({
      suppressed: navigation.isProgrammaticScroll,
      isTouch: true,
    });
    const selected = controller.bind("pixel7-local-programmatic-scroll", {
      dataLength: LOCAL_STACKED_DATA.length,
      allowedKeys: [LOCAL_STACKED_KEY],
      seriesMeta: [{ ...LOCAL_STACKED_SERIES, order: 0 }],
      selectionPayloadAtIndex: createChartTooltipSelectionResolver(LOCAL_STACKED_DATA, () => [
        LOCAL_STACKED_SERIES,
      ]),
    });
    const [pointerUpResult, setPointerUpResult] = useState("none");

    return (
      <>
        <SectionTabs
          sections={NAVIGATION_SECTIONS}
          activeId={navigation.activeId}
          onSelect={navigation.handleSelectSection}
          rangeLabel="2005年〜2025年"
          onRangeClick={() => {}}
        />
        <div data-testid="pixel7-local-scroll-chart" style={{ height: 420, minHeight: 420 }}>
          <StackedAreaChart
            title="費目別支出"
            data={LOCAL_STACKED_DATA}
            keys={[LOCAL_STACKED_KEY]}
            colors={[LOCAL_STACKED_SERIES.color]}
            hiddenKeys={[]}
            onToggle={() => {}}
            chartColors={{
              barFill: "#94a3b8",
              gridStroke: "#e2e8f0",
              axisText: "#64748b",
            }}
            tooltipProps={selected.tooltipProps}
            onClick={selected.onClick}
            onPointerDown={selected.onPointerDown}
            onPointerUp={(event) => {
              if (!selected.onPointerUp) throw new Error("Missing local touch pointer-up handler");
              setPointerUpResult(selected.onPointerUp(event));
            }}
            onPointerCancel={selected.onPointerCancel}
            onKeyDown={selected.onKeyDown}
            onPointerMove={selected.onPointerMove}
            onMouseMove={selected.onMouseMove}
            onChartMouseMove={selected.onChartMouseMove}
            onPointerLeave={selected.onPointerLeave}
            onMouseLeave={selected.onMouseLeave}
            onReset={() => {}}
            activeDot={selected.activeDot}
          />
        </div>
        <output
          data-testid="pixel7-local-scroll-state"
          data-suppressed={String(navigation.isProgrammaticScroll)}
          data-pointer-up-result={pointerUpResult}
        />
        <div aria-hidden="true" style={{ height: 300 }} />
        <section id="pixel7-local-scroll-target" style={{ minHeight: 200, scrollMarginTop: 80 }}>
          給与セクション
        </section>
        {controller.drawer}
      </>
    );
  }

  async function waitForScrollToSettle() {
    let previous = window.scrollY;
    let stableSamples = 0;
    const started = Date.now();
    while (stableSamples < 2) {
      if (Date.now() - started > 5_000) throw new Error("Local section scroll did not settle");
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      const current = window.scrollY;
      stableSamples = current === previous ? stableSamples + 1 : 0;
      previous = current;
    }
    return stableSamples;
  }

  it("B13 #535: close button is hidden after salary-tab touch and scroll settle", async () => {
    window.scrollTo(0, 0);
    renderBrowserComponent(<Pixel7ProgrammaticScrollFixture />);
    const before = window.scrollY;
    await userEvent.click(await page.getByRole("button", { name: "給与", exact: true }).element());
    const state = await page.getByTestId("pixel7-local-scroll-state").element();
    await waitFor(() => expect(state.dataset.suppressed).toBe("true"));
    const chart = await page.getByTestId("pixel7-local-scroll-chart").element();
    const wrapper = chart.querySelector<HTMLElement>("[role='img']");
    if (!wrapper) throw new Error("Local salary chart wrapper is missing");
    const bounds = wrapper.getBoundingClientRect();
    const pointer = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 52,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
    } as const;
    wrapper.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
    wrapper.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
    await waitFor(() => expect(state.dataset.pointerUpResult).toBe("rejected-suppressed"));
    expect(document.querySelector("[data-slot='drawer-popup']")).toBeNull();
    expect(page.getByRole("button", { name: "閉じる" }).query()).toBeNull();
    const stableSamples = await waitForScrollToSettle();
    expect(stableSamples).toBeGreaterThanOrEqual(2);
    await waitFor(() => expect(state.dataset.suppressed).toBe("false"));
    expect(window.scrollY).toBeGreaterThan(before);
    expect(document.querySelector("[data-slot='drawer-popup']")).toBeNull();
    expect(page.getByRole("button", { name: "閉じる" }).query()).toBeNull();
  });
}

it("uses the Pixel 7 viewport and Playwright device context in Browser Mode", () => {
  const evidence = {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    screen: { width: window.screen.width, height: window.screen.height },
    deviceScaleFactor: window.devicePixelRatio,
    touchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
    isMobile: matchMedia("(pointer: coarse)").matches,
  };
  expect(evidence.viewport).toEqual({ width: 412, height: 915 });
  expect(evidence.screen).toEqual({ width: 412, height: 915 });
  expect(evidence.deviceScaleFactor).toBe(2.625);
  expect(evidence.touchPoints).toBeGreaterThan(0);
  expect(evidence.userAgent).toContain("Pixel 7");
  expect(evidence.isMobile).toBe(true);
});
