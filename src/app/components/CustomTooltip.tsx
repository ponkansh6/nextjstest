"use client";

import React from "react";
import { useEffect } from "react";
import type { CustomTooltipProps } from "@/types/chart";
import { getMeasurementNote } from "@/types/chart";
import { projectTooltipPayload } from "./charts/tooltipProjection";
import styles from "./CpiChart.module.css";
export { formatCpiTooltipTotal, formatCpiTooltipValue } from "./charts/tooltipProjection";

export const CustomTooltip = React.memo<CustomTooltipProps>(
  ({
    active,
    payload,
    label,
    isMobile,
    isTouch,
    isDrawer = false,
    suppressInline = false,
    tooltipBg,
    tooltipText,
    onDismiss,
    showTotal,
    totalExcludedKeys = [],
    totalIncludedKeys,
    totalLabel = "合計",
    separatorBetweenGroups,
    showAllPayload = false,
    showMeasurementNotes = true,
    suppressMeasurementNotesForKeys = [],
    seriesMeta,
    allowedKeys,
    includeUnmappedPayload = false,
    valueFormatter,
    totalFormatter,
    onPayloadSnapshot,
  }) => {
    useEffect(() => {
      if (active && payload && onPayloadSnapshot) {
        onPayloadSnapshot(payload, label);
      }
    }, [active, label, onPayloadSnapshot, payload]);
    if (!active || !payload) {
      return null;
    }
    // Coarse-pointer selections are presented by the independent Drawer host;
    // keep Recharts' inline layer mounted only long enough to provide payload.
    if (suppressInline) return null;

    const fontSize = "14px";
    const totalFontSize = "16px";
    const labelFontSize = isMobile ? "11px" : "13px";
    const padding = isMobile ? "10px 14px" : "12px";

    const resolvedPayload = projectTooltipPayload({
      payload,
      label,
      seriesMeta,
      allowedKeys,
      includeUnmappedPayload,
    });

    const total = showTotal
      ? resolvedPayload.reduce((acc, e) => {
          const isIncluded = totalIncludedKeys
            ? totalIncludedKeys.includes(e.dataKey as string)
            : !(totalExcludedKeys ?? []).includes(e.dataKey as string);
          return isIncluded && typeof e.value === "number" && Number.isFinite(e.value)
            ? acc + e.value
            : acc;
        }, 0)
      : null;

    const displayPayload = seriesMeta
      ? resolvedPayload
      : isMobile
        ? [...resolvedPayload].sort((a, b) => {
            const valA = typeof a.value === "number" ? a.value : 0;
            const valB = typeof b.value === "number" ? b.value : 0;
            return valB - valA;
          })
        : resolvedPayload;

    // Consumption tooltips opt into every series on either viewport. When the
    // option is omitted, retain the existing mobile/desktop presentation.
    const shouldShowAllPayload = showAllPayload;
    const topPayload = shouldShowAllPayload ? displayPayload : displayPayload.slice(0, 5);
    const remainingPayloadCount = displayPayload.length - topPayload.length;
    const firstGroupKeys = new Set(separatorBetweenGroups?.firstGroupKeys);
    const secondGroupKeys = new Set(separatorBetweenGroups?.secondGroupKeys);
    const hasFirstGroup = topPayload.some((entry) =>
      firstGroupKeys.has(entry.dataKey ?? entry.name),
    );
    const hasSecondGroup = topPayload.some((entry) =>
      secondGroupKeys.has(entry.dataKey ?? entry.name),
    );
    const separatorIndex =
      hasFirstGroup && hasSecondGroup
        ? topPayload.findIndex((entry) => secondGroupKeys.has(entry.dataKey ?? entry.name))
        : -1;

    return (
      <div
        className={styles.customTooltip}
        data-custom-tooltip="true"
        data-tooltip-root="true"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onMouseMove={(event) => event.stopPropagation()}
        style={{
          backgroundColor: tooltipBg,
          border: isMobile && !isDrawer ? "1px solid var(--card-border)" : "none",
          borderRadius: isMobile && !isDrawer ? "12px 12px 0 0" : isDrawer ? "0" : "8px",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          color: tooltipText,
          padding: isDrawer ? 0 : padding,
          paddingBottom:
            isMobile && !isDrawer ? "calc(10px + env(safe-area-inset-bottom, 0px))" : undefined,
          ...(isMobile && !isDrawer
            ? {
                position: "fixed",
                bottom: "env(safe-area-inset-bottom, 0px)",
                left: 0,
                right: 0,
                width: "100%",
                zIndex: 1000,
                maxHeight:
                  "min(50dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 8px))",
                overflowY: "auto",
                boxSizing: "border-box",
                overscrollBehavior: "contain",
                // Recharts の .recharts-tooltip-wrapper は pointer-events: none が
                // 既定値(ホバー中もカーソル追従イベントをチャート側へ通すため)。
                // これを継承すると閉じるボタンをタップしても反応しないため上書きする。
                pointerEvents: "auto",
              }
            : {}),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            marginBottom: "4px",
            position: "sticky",
            top: 0,
            zIndex: 1,
            backgroundColor: tooltipBg,
          }}
        >
          {!isDrawer && (
            <p
              style={{
                flex: "1 1 auto",
                minWidth: 0,
                overflowWrap: "anywhere",
                wordBreak: "normal",
                color: tooltipText,
                fontSize: labelFontSize,
                fontWeight: "bold",
                margin: 0,
              }}
            >
              {label}
            </p>
          )}
          {isTouch && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss?.();
              }}
              onTouchEnd={(e) => {
                // このボタンはRecharts の <Tooltip> content 内(.recharts-wrapper 配下)に
                // レンダリングされる。preventDefault しないと touchend 後にブラウザが
                // 同じ座標(チャート外)へ合成 mousemove/click を発火し、Recharts が
                // 「カーソルがチャート外に出た」と誤認してタッチ追跡状態を崩し、
                // 以後タップしてもツールチップが再表示されなくなる。
                e.preventDefault();
                e.stopPropagation();
                onDismiss?.();
              }}
              aria-label="閉じる"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "22px",
                height: "22px",
                minWidth: "44px",
                minHeight: "44px",
                marginRight: "-11px",
                flexShrink: 0,
                border: "none",
                background: "transparent",
                color: tooltipText,
                fontSize: "18px",
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          )}
        </div>
        {total !== null && (
          <div
            data-tooltip-total="true"
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "12px",
              fontSize: totalFontSize,
              fontWeight: "bold",
              color: tooltipText,
              padding: "2px 0 6px",
              marginBottom: "6px",
              borderBottom: "1px solid currentColor",
            }}
          >
            <span>{totalLabel}</span>
            <span>{totalFormatter ? totalFormatter(total) : total.toFixed(2)}</span>
          </div>
        )}
        {topPayload.map((entry, index) => {
          // In the three-kind comparison, the consumption label already
          // identifies the series. Keep its measurement/provenance details
          // available in regular consumption tooltips, but omit them here.
          const showEntryMeasurementNotes =
            showMeasurementNotes &&
            !(suppressMeasurementNotesForKeys ?? []).includes(entry.dataKey ?? "");
          const hasProvenance =
            entry.seriesType !== undefined ||
            entry.official !== undefined ||
            entry.measurementNote !== undefined;
          const measurementNote = hasProvenance
            ? getMeasurementNote({
                seriesType: entry.seriesType,
                official: entry.official,
                annualAnchorType: entry.annualAnchorType,
                quarterlyDerived: entry.quarterlyDerived,
                aggregation: entry.aggregation,
                bridgeCoefficient: entry.bridgeCoefficient,
                status: entry.status ?? "valid",
                reason: entry.reason,
                measurementNote: entry.measurementNote,
              })
            : null;
          return (
            <div
              key={`item-${index}`}
              className={index === separatorIndex ? styles.tooltipGroupSeparator : undefined}
              data-tooltip-row="true"
              data-tooltip-key={entry.dataKey}
              data-tooltip-label={entry.name}
              data-tooltip-unit={entry.unit}
              data-tooltip-source={entry.source}
              data-tooltip-source-id={entry.sourceId}
              data-tooltip-stat-inf-id={entry.statInfId}
              data-tooltip-household-scope={entry.householdScope}
              data-tooltip-source-workbook={entry.sourceWorkbook}
              data-tooltip-source-sheet={entry.sourceSheet}
              data-tooltip-source-column={entry.sourceColumn}
              data-tooltip-source-role={entry.sourceRole}
              data-tooltip-source-derived-from-columns={entry.sourceDerivedFromColumns?.join(";")}
              data-tooltip-canonical-series={entry.canonicalSeries}
              data-tooltip-model={entry.model}
              data-tooltip-estimate-version={entry.estimateVersion}
              data-tooltip-input-fingerprint={entry.inputFingerprint}
              data-tooltip-seasonality-source-id={entry.seasonalitySourceId}
              data-tooltip-target-source-id={entry.targetSourceId}
              data-tooltip-target-household-scope={entry.targetHouseholdScope}
              data-tooltip-bridge-applied-range={
                entry.bridgeAppliedRange
                  ? `${entry.bridgeAppliedRange.startYear}-${entry.bridgeAppliedRange.endYear}`
                  : undefined
              }
              data-tooltip-bridge-coefficient={
                entry.bridgeCoefficient === undefined ? undefined : String(entry.bridgeCoefficient)
              }
              data-tooltip-value-type={entry.valueType}
              data-tooltip-frequency={entry.frequency ?? ""}
              data-tooltip-aggregation={entry.aggregation}
              data-tooltip-cpi-series={entry.cpiSeries}
              data-tooltip-base-year={
                entry.baseYear === undefined ? undefined : String(entry.baseYear)
              }
              data-tooltip-cpi-period={entry.cpiPeriod}
              data-tooltip-cpi-aggregation={entry.cpiAggregation}
              data-tooltip-nominal-source={entry.nominalSource}
              data-tooltip-status={entry.status}
              data-tooltip-reason={entry.reason ?? ""}
              data-tooltip-series-type={entry.seriesType}
              data-tooltip-official={
                entry.official === undefined ? undefined : String(entry.official)
              }
              data-tooltip-note={
                showEntryMeasurementNotes ? (measurementNote ?? undefined) : undefined
              }
              data-tooltip-monthly-source-id={entry.monthlyProvenance?.sourceId}
              data-tooltip-monthly-household-scope={entry.monthlyProvenance?.householdScope}
              data-tooltip-monthly-series-type={entry.monthlyProvenance?.seriesType}
              data-tooltip-ma12-window-start={entry.ma12Provenance?.windowStart}
              data-tooltip-ma12-window-end={entry.ma12Provenance?.windowEnd}
              data-tooltip-ma12-sources={entry.ma12Provenance?.sources.join(";")}
              data-tooltip-ma12-statuses={entry.ma12Provenance?.statuses.join(";")}
              data-tooltip-color={entry.color}
              data-tooltip-order={entry.order ?? index}
              data-tooltip-group-separator={index === separatorIndex ? "true" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: fontSize,
                margin: "1px 0",
                color: tooltipText,
                justifyContent: "space-between",
              }}
            >
              {entry.color && (
                <span
                  data-tooltip-color={entry.color}
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: entry.color,
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                style={{
                  minWidth: 0,
                  flex: "1 1 auto",
                  overflowWrap: "anywhere",
                  wordBreak: "normal",
                }}
              >
                {entry.name}
                {showEntryMeasurementNotes && measurementNote && (
                  <small
                    data-tooltip-measurement-note="true"
                    style={{ display: "block", opacity: 0.78, fontSize: "0.82em" }}
                  >
                    {measurementNote}
                  </small>
                )}
                {showEntryMeasurementNotes && entry.cpiSeries && (
                  <small
                    data-tooltip-cpi-provenance="true"
                    style={{ display: "block", opacity: 0.78, fontSize: "0.82em" }}
                  >
                    CPI: {entry.cpiSeries}（e-Stat {entry.statInfId ?? entry.sourceId ?? "?"}、
                    {entry.baseYear ?? "基準年不明"}年基準、{entry.cpiPeriod}、
                    {entry.cpiAggregation}）
                    <br />
                    名目出典: {entry.nominalSource ?? "不明"}
                  </small>
                )}
                {showEntryMeasurementNotes && entry.baseYear !== undefined && !entry.cpiSeries && (
                  <small
                    data-tooltip-base-year-provenance="true"
                    style={{ display: "block", opacity: 0.78, fontSize: "0.82em" }}
                  >
                    基準年: {entry.baseYear}年
                  </small>
                )}
                {showEntryMeasurementNotes && (entry.monthlyProvenance || entry.ma12Provenance) && (
                  <small
                    data-tooltip-consumption-provenance="true"
                    style={{ display: "block", opacity: 0.78, fontSize: "0.82em" }}
                  >
                    {entry.dataKey === "消費(総合)"
                      ? "消費支出の12か月移動平均"
                      : entry.monthlyProvenance && (
                          <>
                            月次出典: {entry.monthlyProvenance.sourceId}（
                            {entry.monthlyProvenance.householdScope}、
                            {entry.monthlyProvenance.seriesType}）
                            <br />
                            {entry.monthlyProvenance.description}
                          </>
                        )}
                    {entry.dataKey !== "消費(総合)" && entry.ma12Provenance && (
                      <>
                        {entry.monthlyProvenance && <br />}
                        12MA期間: {entry.ma12Provenance.windowStart}〜
                        {entry.ma12Provenance.windowEnd}（出典:{" "}
                        {entry.ma12Provenance.sources.join(", ")}、区分:{" "}
                        {entry.ma12Provenance.statuses.join(", ")}）
                      </>
                    )}
                  </small>
                )}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  marginLeft: "auto",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                {valueFormatter
                  ? valueFormatter(entry.value)
                  : entry.value == null
                    ? "—"
                    : typeof entry.value === "number"
                      ? Number.isFinite(entry.value)
                        ? entry.value.toFixed(2)
                        : "—"
                      : entry.value}
              </span>
            </div>
          );
        })}
        {remainingPayloadCount > 0 && (
          <div
            aria-label="その他の項目を省略"
            style={{
              color: tooltipText,
              fontSize: fontSize,
              textAlign: "center",
              marginTop: "4px",
            }}
          >
            他 {remainingPayloadCount} 件
          </div>
        )}
      </div>
    );
  },
);

CustomTooltip.displayName = "CustomTooltip";
