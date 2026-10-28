"use client";

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  PointerEvent as ReactPointerEvent,
} from "react";
import { cloneElement, useState, useEffect, useCallback, useRef } from "react";
import type { MouseHandlerDataParam } from "recharts";
import { useChartTheme } from "@/hooks/useChartTheme";
import { CustomTooltip } from "../CustomTooltip";
import type { CustomTooltipProps, TooltipSeriesMetadata } from "@/types/chart";
import type { ChartTooltipSelection } from "./chartTooltipSelection";
import {
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerRoot,
  DrawerTitle,
} from "../../ui-experiments/BaseDrawer";
import drawerStyles from "./chart-point-drawer.module.css";

export interface ChartTooltipProps {
  cursor: { stroke: string; strokeWidth: number; strokeOpacity: number };
  trigger: "hover" | "click";
  active?: boolean;
  content: ReactElement;
  defaultIndex?: number;
  position?: { x: number; y: number };
  wrapperStyle?: CSSProperties;
}

export interface ChartTooltipBindOptions {
  /** Set false to roll one chart back to its existing Recharts tooltip. */
  drawerEnabled?: boolean;
  showTotal?: boolean;
  totalExcludedKeys?: string[];
  totalIncludedKeys?: string[];
  totalLabel?: string;
  separatorBetweenGroups?: {
    firstGroupKeys: string[];
    secondGroupKeys: string[];
  };
  showAllPayload?: boolean;
  showMeasurementNotes?: boolean;
  suppressMeasurementNotesForKeys?: string[];
  seriesMeta?: TooltipSeriesMetadata[];
  allowedKeys?: string[] | ((label?: string) => string[]);
  includeUnmappedPayload?: boolean;
  valueFormatter?: (value: number | null | undefined) => string;
  totalFormatter?: (value: number) => string;
  /** Build the selected point payload from the same chart-data index as the gesture. */
  selectionPayloadAtIndex?: (index: number) => ChartTooltipSelection | null;
}

export { createChartTooltipSelectionResolver } from "./chartTooltipSelection";
export type { ChartTooltipSelection, ChartTooltipSelectionSeries } from "./chartTooltipSelection";

export type ChartTooltipChartMouseMoveHandler = (
  state: Pick<MouseHandlerDataParam, "activeTooltipIndex">,
) => void;

type ChartTooltipInteractionEvent = ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>;
export type ChartTooltipPointerResult =
  | "touch-candidate"
  | "fine-pointer"
  | "awaiting-click"
  | "selected"
  | "rejected-nontouch"
  | "rejected-cancelled"
  | "rejected-pointer-mismatch"
  | "rejected-moved"
  | "rejected-no-selection"
  | "rejected-suppressed";

const isInsideVisibleTooltip = (clientX: number, clientY: number) =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-custom-tooltip]")).some((element) => {
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity) === 0
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  });

const TOUCH_MOVE_THRESHOLD = 8;
const TOUCH_LEAVE_GRACE_MS = 2000;

const toChartDataIndex = (value: unknown): number | undefined => {
  const index =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)
        ? Number(value)
        : undefined;
  return typeof index === "number" && Number.isInteger(index) ? index : undefined;
};

export const useChartTooltipController = ({
  suppressed,
  isTouch,
}: {
  suppressed: boolean;
  isTouch: boolean;
}): {
  bind: (
    chartId: string,
    options?: ChartTooltipBindOptions & { dataLength?: number },
  ) => {
    tooltipProps: ChartTooltipProps;
    onClick: (event?: unknown) => void;
    activeDot?: boolean;
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => ChartTooltipPointerResult;
    onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => ChartTooltipPointerResult;
    onPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onMouseMove: (event: ReactMouseEvent<HTMLElement>) => void;
    onChartMouseMove: ChartTooltipChartMouseMoveHandler;
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
    onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => void;
  };
  drawer: ReactElement;
  dismiss: () => void;
  invalidate: () => void;
} => {
  const { isMobile, chartColors } = useChartTheme();
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const activeChartIdRef = useRef<string | null>(null);
  const selectionGenerationRef = useRef(0);
  const snapshotViewportRef = useRef<{ width: number; height: number } | null>(null);
  const [lastPointerType, setLastPointerType] = useState<string | null>(null);
  const lastPointerTypeRef = useRef<string | null>(null);
  const [escapeDismissed, setEscapeDismissed] = useState(false);
  const leftChartAfterEscapeRef = useRef(false);
  const touchGestureRef = useRef<{
    chartId: string;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    startedAt: number;
    activeTooltipIndex?: number;
  } | null>(null);
  const cancelledTouchPointersRef = useRef(new Set<number>());
  const legacyTouchDismissedRef = useRef(false);
  const drawerSelectionGraceRef = useRef<{
    chartId: string;
    expiresAt: number;
  } | null>(null);
  const pendingDrawerSelectionRef = useRef<{
    chartId: string;
    generation: number;
  } | null>(null);
  // Each chart owns its selected row.  A single index is incorrect because
  // charts can have different filtered lengths (and NewGraph is range-filtered).
  const [activeIndices, setActiveIndices] = useState<Record<string, number | undefined>>({});
  const activeTooltipIndicesRef = useRef<Record<string, number | undefined>>({});
  const [drawerSnapshot, setDrawerSnapshot] = useState<{
    chartId: string;
    title: string;
    content: ReactElement;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerOpenRef = useRef(false);
  const drawerSnapshotEpochRef = useRef(0);
  const returnFocusChartIdRef = useRef<string | null>(null);
  const usesDrawerInput = lastPointerType === "touch" || (lastPointerType === null && isTouch);
  const previousInputRef = useRef({ isTouch, usesDrawerInput, lastPointerType });
  const previousSuppressedRef = useRef(suppressed);
  const ignoreTouchDismissRef = useRef(false);

  const dismiss = useCallback(() => {
    activeChartIdRef.current = null;
    selectionGenerationRef.current += 1;
    pendingDrawerSelectionRef.current = null;
    drawerSelectionGraceRef.current = null;
    setActiveChartId(null);
    setActiveIndices({});
    drawerOpenRef.current = false;
    setDrawerOpen(false);
  }, []);
  const invalidate = useCallback(() => {
    drawerSnapshotEpochRef.current += 1;
    dismiss();
    setDrawerSnapshot(null);
    snapshotViewportRef.current = null;
  }, [dismiss]);
  const recordPointerType = useCallback(
    (pointerType: string, deferRender = pointerType === "touch") => {
      const previous = lastPointerTypeRef.current;
      const previousUsesDrawerInput = previous === "touch" || (previous === null && isTouch);
      const nextUsesDrawerInput = pointerType === "touch";
      if (previousUsesDrawerInput !== nextUsesDrawerInput && drawerSnapshot) {
        invalidate();
      }
      lastPointerTypeRef.current = pointerType;
      previousInputRef.current = {
        isTouch,
        usesDrawerInput: nextUsesDrawerInput,
        lastPointerType: pointerType,
      };
      if (!deferRender) setLastPointerType(pointerType);
    },
    [drawerSnapshot, invalidate, isTouch],
  );

  useEffect(() => {
    const clearTouchDismissGuard = () => {
      ignoreTouchDismissRef.current = false;
    };
    document.addEventListener("pointerdown", clearTouchDismissGuard, true);
    document.addEventListener("keydown", clearTouchDismissGuard, true);
    return () => {
      document.removeEventListener("pointerdown", clearTouchDismissGuard, true);
      document.removeEventListener("keydown", clearTouchDismissGuard, true);
    };
  }, []);

  useEffect(() => {
    const wasSuppressed = previousSuppressedRef.current;
    previousSuppressedRef.current = suppressed;
    if (suppressed && !wasSuppressed) dismiss();
  }, [dismiss, suppressed]);

  useEffect(() => {
    const previous = previousInputRef.current;
    previousInputRef.current = { isTouch, usesDrawerInput, lastPointerType };
    const firstObservedPointerType = previous.lastPointerType === null && lastPointerType !== null;
    if (
      drawerSnapshot &&
      !firstObservedPointerType &&
      (previous.isTouch !== isTouch || previous.usesDrawerInput !== usesDrawerInput)
    ) {
      dismiss();
    }
  }, [dismiss, drawerSnapshot, isTouch, lastPointerType, usesDrawerInput]);

  useEffect(() => {
    if (!drawerSnapshot) return;
    const observePointerType = (event: PointerEvent) => {
      recordPointerType(event.pointerType);
    };
    document.addEventListener("pointerdown", observePointerType, { capture: true });
    return () => document.removeEventListener("pointerdown", observePointerType, { capture: true });
  }, [drawerSnapshot, recordPointerType]);

  // 1. グラフ外 pointerdown による解除
  useEffect(() => {
    if (activeChartId == null || drawerSnapshot) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;

      // The tooltip is visually above the page, but Recharts' wrapper can be
      // pointer-transparent. Block the back element covered by the visible
      // tooltip so the tooltip remains open.
      if (isInsideVisibleTooltip(e.clientX, e.clientY)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const isTooltipTarget = target?.closest?.("[data-custom-tooltip]") != null;
      if (isTooltipTarget) return;

      const isDataTableLink = target?.closest?.('a[href^="#data-table-"]') != null;
      const isChartNoteLink = target?.closest?.("a[data-chart-note-link]") != null;
      if (target?.closest?.(".recharts-wrapper") == null || isDataTableLink || isChartNoteLink) {
        dismiss();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, { passive: false, capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    };
  }, [activeChartId, dismiss, drawerSnapshot]);

  // 2. Escape による解除
  useEffect(() => {
    if (activeChartId == null || drawerSnapshot) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      leftChartAfterEscapeRef.current = false;
      setEscapeDismissed(true);
      dismiss();
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [activeChartId, dismiss, drawerSnapshot]);

  // 3. スクロールによる解除 (touch端末のみ)
  useEffect(() => {
    if (activeChartId == null || !isTouch || drawerSnapshot) return;
    const startY = window.scrollY;
    const handleScroll = () => {
      if (Math.abs(window.scrollY - startY) >= 40) {
        pendingDrawerSelectionRef.current = null;
        drawerSelectionGraceRef.current = null;
        activeChartIdRef.current = null;
        selectionGenerationRef.current += 1;
        setActiveChartId(null);
        setActiveIndices({});
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [activeChartId, isTouch, drawerSnapshot]);

  useEffect(() => {
    const handleResize = () => {
      const openedAt = snapshotViewportRef.current;
      if (
        openedAt &&
        window.innerWidth === openedAt.width &&
        window.innerHeight === openedAt.height
      ) {
        return;
      }
      invalidate();
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, [invalidate]);

  const bind = useCallback(
    (chartId: string, options?: ChartTooltipBindOptions & { dataLength?: number }) => {
      const isThisActive = activeChartId === chartId;
      const usesDrawerForChart = usesDrawerInput && options?.drawerEnabled !== false;
      const usesTouchTooltip = usesDrawerInput;
      const isDrawerPointer = (pointerType: string) => pointerType === "touch";
      let optionsContent: ReactElement<CustomTooltipProps>;
      let commitSelectionSnapshot: (
        payload: NonNullable<CustomTooltipProps["payload"]>,
        label?: string,
        selectedIndex?: number,
      ) => void;
      const selectIndex = (
        event: ChartTooltipInteractionEvent,
        keyboardSelection = false,
        gestureChartIndex?: number | null,
      ): number | null => {
        const length = options?.dataLength ?? 0;
        if (suppressed || length < 1) return null;
        if (
          !keyboardSelection &&
          event.target instanceof Element &&
          event.target.closest("[data-custom-tooltip]")
        ) {
          return null;
        }
        // Touch browsers can emit compatibility mouse events after pointerup.
        // Do not let those events advance the generation while this selection
        // is waiting for Recharts to publish its payload.
        if (pendingDrawerSelectionRef.current?.chartId === chartId) return null;
        // The compatibility mousemove that follows a committed touch can
        // otherwise run the fine-hover path and clear the just-created Drawer
        // snapshot. A real PointerEvent below clears this guard when hybrid
        // input moves back to mouse/pen.
        if (ignoreTouchDismissRef.current && usesDrawerForChart) return null;
        if (legacyTouchDismissedRef.current && options?.drawerEnabled === false) {
          return null;
        }
        // A chart-internal move while the pointer never left must not undo
        // Escape dismissal. The wrapper leave handlers mark a real exit.
        const clearsEscapeDismissal = escapeDismissed && leftChartAfterEscapeRef.current;
        if (escapeDismissed && !clearsEscapeDismissal && !keyboardSelection) return null;
        if (keyboardSelection && escapeDismissed) setEscapeDismissed(false);
        if (clearsEscapeDismissal) setEscapeDismissed(false);
        if (clearsEscapeDismissal) leftChartAfterEscapeRef.current = false;
        const eventTarget = event.nativeEvent?.target ?? event.target;
        const eventTargetElement = eventTarget instanceof Element ? eventTarget : null;
        const barIndexAttribute =
          eventTargetElement?.closest("[data-index]")?.getAttribute("data-index") ?? null;
        const hitBarIndex = barIndexAttribute === null ? NaN : Number(barIndexAttribute);
        const chartIndex =
          gestureChartIndex === undefined
            ? activeTooltipIndicesRef.current[chartId]
            : gestureChartIndex;
        const selectedIndex =
          Number.isInteger(hitBarIndex) && hitBarIndex >= 0 && hitBarIndex < length
            ? hitBarIndex
            : typeof chartIndex === "number" &&
                Number.isInteger(chartIndex) &&
                chartIndex >= 0 &&
                chartIndex < length
              ? chartIndex
              : keyboardSelection
                ? (activeIndices[chartId] ?? Math.round((length - 1) / 2))
                : null;
        if (selectedIndex === null) return null;
        activeChartIdRef.current = chartId;
        selectionGenerationRef.current += 1;
        setActiveChartId(chartId);
        setActiveIndices((current) => ({
          ...current,
          [chartId]: selectedIndex,
        }));
        return selectedIndex;
      };
      const handleChartMouseMove: ChartTooltipChartMouseMoveHandler = (state) => {
        const index = toChartDataIndex(state.activeTooltipIndex);
        if (index !== undefined && index < (options?.dataLength ?? 0)) {
          activeTooltipIndicesRef.current[chartId] = index;
          const gesture = touchGestureRef.current;
          if (gesture?.chartId === chartId) gesture.activeTooltipIndex = index;
        } else {
          delete activeTooltipIndicesRef.current[chartId];
          const gesture = touchGestureRef.current;
          if (gesture?.chartId === chartId) gesture.activeTooltipIndex = undefined;
        }
      };
      const handleChartLeave = (event: ChartTooltipInteractionEvent) => {
        const pointerType = "pointerType" in event ? event.pointerType : undefined;
        // pointerleave is often synthesized while Recharts replaces SVG
        // nodes after a touch. It is hover cleanup only, never evidence of a
        // new input mode; a real pointerdown/move has already switched modes.
        if (ignoreTouchDismissRef.current && usesDrawerForChart) return;
        const selectionGrace = drawerSelectionGraceRef.current;
        if (selectionGrace?.chartId === chartId) {
          if (Date.now() < selectionGrace.expiresAt) return;
          drawerSelectionGraceRef.current = null;
        }
        // Recharts may replace the hovered SVG node during the touch commit,
        // producing a leave before Tooltip's payload effect has consumed the
        // pending selection. Preserve that one-shot selection through the
        // leave so the payload and generation still match.
        if (pendingDrawerSelectionRef.current?.chartId === chartId) return;
        const gesture = touchGestureRef.current;
        if (pointerType === "touch") {
          if (!gesture?.moved) return;
        } else if (
          pointerType == null &&
          gesture &&
          !gesture.moved &&
          Date.now() - gesture.startedAt < TOUCH_LEAVE_GRACE_MS
        ) {
          return;
        }

        const relatedTarget = event.relatedTarget;
        const isTooltipTarget =
          relatedTarget instanceof Element &&
          relatedTarget.closest("[data-custom-tooltip]") != null;
        if (isTooltipTarget) return;

        if (isInsideVisibleTooltip(event.clientX, event.clientY)) return;

        activeChartIdRef.current = null;
        selectionGenerationRef.current += 1;
        setActiveChartId(null);
        if (escapeDismissed) leftChartAfterEscapeRef.current = true;
      };
      const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
        const target = event.target as Element | null;
        const startedInsideTooltip = target?.closest?.("[data-custom-tooltip]") != null;
        pendingDrawerSelectionRef.current = null;
        drawerSelectionGraceRef.current = null;
        if (!startedInsideTooltip) legacyTouchDismissedRef.current = false;
        if (!startedInsideTooltip) {
          recordPointerType(event.pointerType);
        }
        if (isDrawerPointer(event.pointerType)) {
          cancelledTouchPointersRef.current.delete(event.pointerId);
          touchGestureRef.current = {
            chartId,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            startedAt: Date.now(),
          };
          return "touch-candidate" as const;
        } else {
          touchGestureRef.current = null;
        }
        selectIndex(event);
        return "fine-pointer" as const;
      };
      const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        if (event.target instanceof Element && event.target.closest("[data-custom-tooltip]")) {
          return;
        }
        if (event.pointerType !== "touch") ignoreTouchDismissRef.current = false;
        recordPointerType(event.pointerType);
        if (isDrawerPointer(event.pointerType)) {
          const gesture = touchGestureRef.current;
          if (gesture && gesture.pointerId === event.pointerId && !gesture.moved) {
            const movedX = Math.abs(event.clientX - gesture.startX);
            const movedY = Math.abs(event.clientY - gesture.startY);
            if (Math.max(movedX, movedY) > TOUCH_MOVE_THRESHOLD) {
              gesture.moved = true;
              if (movedY > movedX) {
                dismiss();
                return;
              }
            }
          }
        }
        if (!isDrawerPointer(event.pointerType)) selectIndex(event);
      };
      const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
        // Publish the effective input mode after the touch hit target has
        // completed its down/up sequence. Publishing it during pointerdown or
        // pointermove rerenders Recharts and can detach that SVG target before
        // the matching pointerup reaches the chart surface.
        recordPointerType(event.pointerType, false);
        const gesture = touchGestureRef.current;
        const wasCancelled = cancelledTouchPointersRef.current.delete(event.pointerId);
        if (!isDrawerPointer(event.pointerType)) return "rejected-nontouch" as const;
        if (wasCancelled) return "rejected-cancelled" as const;
        if (gesture?.pointerId !== undefined && gesture.pointerId !== event.pointerId) {
          return "rejected-pointer-mismatch" as const;
        }
        if (gesture?.moved) return "rejected-moved" as const;
        if (suppressed) return "rejected-suppressed" as const;
        if (options?.drawerEnabled !== false) {
          // Resolve and commit from this gesture's chart-data index whenever
          // the chart supplied a resolver. Do not borrow the Tooltip's last
          // hover payload when Recharts has no click payload for this tap.
          const selectedIndex = selectIndex(event, false, gesture?.activeTooltipIndex ?? null);
          touchGestureRef.current = null;
          if (selectedIndex === null) {
            pendingDrawerSelectionRef.current = {
              chartId,
              generation: selectionGenerationRef.current,
            };
            return "awaiting-click" as const;
          }
          drawerSelectionGraceRef.current = {
            chartId,
            expiresAt: Date.now() + TOUCH_LEAVE_GRACE_MS,
          };
          const selection = options?.selectionPayloadAtIndex?.(selectedIndex);
          if (selection) {
            commitSelectionSnapshot(selection.payload, selection.label, selectedIndex);
            ignoreTouchDismissRef.current = true;
            return "selected";
          }
          pendingDrawerSelectionRef.current = {
            chartId,
            generation: selectionGenerationRef.current,
          };
          return "awaiting-click" as const;
        }
        const selectedIndex = selectIndex(event, false, gesture?.activeTooltipIndex ?? null);
        touchGestureRef.current = null;
        if (selectedIndex === null) return "rejected-no-selection" as const;
        return "selected" as const;
      };
      const handlePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
        cancelledTouchPointersRef.current.add(event.pointerId);
        touchGestureRef.current = null;
        pendingDrawerSelectionRef.current = null;
        drawerSelectionGraceRef.current = null;
      };
      const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        const selectedIndex = selectIndex(
          {
            currentTarget: event.currentTarget,
            clientX: bounds.left + bounds.width / 2,
          } as unknown as ChartTooltipInteractionEvent,
          true,
        );
        if (selectedIndex !== null && options?.drawerEnabled !== false) {
          const selection = options?.selectionPayloadAtIndex?.(selectedIndex);
          if (selection) {
            commitSelectionSnapshot(selection.payload, selection.label, selectedIndex);
          } else {
            pendingDrawerSelectionRef.current = {
              chartId,
              generation: selectionGenerationRef.current,
            };
          }
        }
      };
      const consumeSnapshotPayload = (
        payload: NonNullable<CustomTooltipProps["payload"]>,
        label?: string,
        selectedIndex?: number,
      ) => {
        const pending = pendingDrawerSelectionRef.current;
        if (
          options?.drawerEnabled === false ||
          !pending ||
          pending.chartId !== chartId ||
          pending.generation !== selectionGenerationRef.current
        ) {
          return false;
        }
        pendingDrawerSelectionRef.current = null;
        commitSelectionSnapshot(payload, label, selectedIndex);
        return true;
      };
      commitSelectionSnapshot = (
        payload: NonNullable<CustomTooltipProps["payload"]>,
        label?: string,
        selectedIndex?: number,
      ) => {
        drawerSnapshotEpochRef.current += 1;
        activeChartIdRef.current = chartId;
        setActiveChartId(chartId);
        if (selectedIndex !== undefined && Number.isInteger(selectedIndex)) {
          setActiveIndices((current) => ({ ...current, [chartId]: selectedIndex }));
        }
        returnFocusChartIdRef.current = chartId;
        const stablePayload = payload.map((entry) => ({
          ...entry,
          payload: entry.payload ? { ...entry.payload } : undefined,
        }));
        const selectionTitle =
          typeof label === "string" && label.trim().length > 0 ? label : undefined;
        const payloadPeriod = stablePayload
          .map((entry) => entry.payload?.["年月"] ?? entry.payload?.["label"])
          .find((period) => period != null);
        const payloadTitle =
          typeof payloadPeriod === "string" && payloadPeriod.trim().length > 0
            ? payloadPeriod
            : undefined;
        setDrawerSnapshot({
          chartId,
          title: selectionTitle ?? payloadTitle ?? "詳細",
          content: cloneElement(optionsContent, {
            active: true,
            payload: stablePayload,
            label,
            isMobile: true,
            isTouch: false,
            isDrawer: true,
            suppressInline: false,
            onPayloadSnapshot: undefined,
          }),
        });
        drawerOpenRef.current = true;
        setDrawerOpen(true);
        snapshotViewportRef.current = {
          width: window.innerWidth,
          height: window.innerHeight,
        };
        return true;
      };
      optionsContent = (
        <CustomTooltip
          isMobile={isMobile}
          isTouch={usesTouchTooltip}
          suppressInline={
            usesDrawerForChart ||
            (legacyTouchDismissedRef.current && options?.drawerEnabled === false)
          }
          tooltipBg={chartColors.tooltipBg}
          tooltipText={chartColors.tooltipText}
          onDismiss={() => {
            if (options?.drawerEnabled === false) {
              legacyTouchDismissedRef.current = true;
            }
            dismiss();
          }}
          showTotal={options?.showTotal}
          totalExcludedKeys={options?.totalExcludedKeys}
          totalIncludedKeys={options?.totalIncludedKeys}
          totalLabel={options?.totalLabel}
          separatorBetweenGroups={options?.separatorBetweenGroups}
          showAllPayload={options?.showAllPayload}
          showMeasurementNotes={options?.showMeasurementNotes}
          suppressMeasurementNotesForKeys={options?.suppressMeasurementNotesForKeys}
          seriesMeta={options?.seriesMeta}
          allowedKeys={options?.allowedKeys}
          includeUnmappedPayload={options?.includeUnmappedPayload}
          valueFormatter={options?.valueFormatter}
          totalFormatter={options?.totalFormatter}
          onPayloadSnapshot={(payload, label) => {
            const consumed = consumeSnapshotPayload(payload, label);
            if (
              !consumed &&
              label != null &&
              options?.selectionPayloadAtIndex &&
              (!usesDrawerInput || options.drawerEnabled === false)
            ) {
              const length = options.dataLength ?? 0;
              const payloadIndex = Array.from({ length }, (_, index) => index).find(
                (index) => options.selectionPayloadAtIndex?.(index)?.label === String(label),
              );
              if (payloadIndex !== undefined && activeChartIdRef.current === chartId) {
                setActiveIndices((current) =>
                  current[chartId] === payloadIndex
                    ? current
                    : { ...current, [chartId]: payloadIndex },
                );
              }
            }
          }}
        />
      );
      return {
        tooltipProps: {
          cursor: { stroke: chartColors.gridStroke, strokeWidth: 1, strokeOpacity: 0.6 },
          trigger: usesTouchTooltip ? ("click" as const) : ("hover" as const),
          active:
            suppressed || escapeDismissed ? false : usesDrawerInput ? isThisActive : undefined,
          defaultIndex: isThisActive ? activeIndices[chartId] : undefined,
          position: usesDrawerForChart && isThisActive ? { x: 0, y: 0 } : undefined,
          wrapperStyle:
            usesDrawerForChart && isThisActive
              ? {
                  visibility: "visible" as const,
                  width: "100%",
                  minHeight: 1,
                  // Recharts positions the wrapper with translate3d(). That
                  // transform creates a containing block for the fixed
                  // CustomTooltip, making it move with the chart/scrollport.
                  // Keep the wrapper as a viewport-level layer so the
                  // tooltip's own fixed bottom positioning remains stable.
                  position: "fixed" as const,
                  zIndex: 1000,
                  top: 0,
                  left: 0,
                  transform: "none",
                }
              : undefined,
          content: optionsContent,
        },
        onClick: (event?: unknown) => {
          if (legacyTouchDismissedRef.current && options?.drawerEnabled === false) {
            return;
          }
          if (
            event &&
            typeof event === "object" &&
            ("activePayload" in event || "activeTooltipIndex" in event)
          ) {
            const chartEvent = event as {
              activePayload?: NonNullable<CustomTooltipProps["payload"]>;
              activeLabel?: unknown;
              label?: unknown;
              activeTooltipIndex?: unknown;
            };
            const pending = pendingDrawerSelectionRef.current;
            const chartIndex = toChartDataIndex(chartEvent.activeTooltipIndex);
            if (
              usesDrawerForChart &&
              pending?.chartId === chartId &&
              pending.generation === selectionGenerationRef.current &&
              chartIndex !== undefined &&
              chartIndex >= 0 &&
              chartIndex < (options?.dataLength ?? 0)
            ) {
              const selection = options?.selectionPayloadAtIndex?.(chartIndex);
              if (selection) {
                pendingDrawerSelectionRef.current = null;
                commitSelectionSnapshot(selection.payload, selection.label, chartIndex);
                ignoreTouchDismissRef.current = true;
                return;
              }
            }
            if (Array.isArray(chartEvent.activePayload)) {
              const eventLabel = chartEvent.activeLabel ?? chartEvent.label;
              const selectedIndex = toChartDataIndex(chartEvent.activeTooltipIndex);
              if (
                consumeSnapshotPayload(
                  chartEvent.activePayload,
                  eventLabel == null ? undefined : String(eventLabel),
                  selectedIndex,
                )
              ) {
                return;
              }
            }
          }
          if (!suppressed && (!usesDrawerForChart || options?.drawerEnabled === false)) {
            if (pendingDrawerSelectionRef.current?.chartId === chartId) {
              return;
            }
            activeChartIdRef.current = chartId;
            setActiveChartId(chartId);
          }
        },
        onPointerDown: handlePointerDown,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        onKeyDown: handleKeyDown,
        onPointerMove: handlePointerMove,
        onMouseMove: selectIndex,
        onChartMouseMove: handleChartMouseMove,
        onPointerLeave: handleChartLeave,
        onMouseLeave: handleChartLeave,
        activeDot: usesDrawerForChart ? (isThisActive ? undefined : false) : undefined,
      };
    },
    [
      chartColors,
      isMobile,
      suppressed,
      activeChartId,
      activeIndices,
      usesDrawerInput,
      escapeDismissed,
      dismiss,
      recordPointerType,
    ],
  );

  const renderedSnapshotEpoch = drawerSnapshotEpochRef.current;
  const drawer = (
    <DrawerRoot
      open={drawerOpen}
      onOpenChange={(open, eventDetails) => {
        if (renderedSnapshotEpoch !== drawerSnapshotEpochRef.current) return;
        if (open) drawerOpenRef.current = true;
        if (!open && drawerOpenRef.current) {
          if (ignoreTouchDismissRef.current && eventDetails.reason === "outside-press") {
            return;
          }
          dismiss();
        }
      }}
      onOpenChangeComplete={(open) => {
        // Base UI can report completion for an earlier closed/exit transition
        // after a new selection has already opened the Drawer. Use the ref so
        // that stale completion cannot clear the newly committed snapshot.
        if (
          renderedSnapshotEpoch === drawerSnapshotEpochRef.current &&
          !open &&
          !drawerOpenRef.current
        ) {
          setDrawerSnapshot(null);
        }
      }}
      modal
      swipeDirection="down"
    >
      <DrawerContent
        aria-labelledby="chart-point-drawer-title"
        className={drawerStyles.popup}
        finalFocus={() =>
          returnFocusChartIdRef.current
            ? document.querySelector<HTMLElement>(
                `#${CSS.escape(returnFocusChartIdRef.current)} [role="img"]`,
              )
            : null
        }
      >
        <DrawerHandle />
        <div className={drawerStyles.header}>
          <DrawerTitle id="chart-point-drawer-title">{drawerSnapshot?.title ?? "詳細"}</DrawerTitle>
          <DrawerClose className={drawerStyles.closeButton} aria-label="閉じる">
            閉じる
          </DrawerClose>
        </div>
        <div className={drawerStyles.body}>{drawerSnapshot?.content}</div>
      </DrawerContent>
    </DrawerRoot>
  );

  return { bind, drawer, dismiss, invalidate };
};
