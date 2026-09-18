"use client";

import React from "react";
import type { CustomTooltipProps } from "@/types/chart";
import styles from "./CpiChart.module.css";

type TooltipDisplayPayload = NonNullable<CustomTooltipProps["payload"]>[number] & {
  order?: number;
};

export const formatCpiTooltipValue = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";

/** Format a CPI total without allowing invalid upstream values to throw. */
export const formatCpiTooltipTotal = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";

export const CustomTooltip = React.memo<CustomTooltipProps>(
  ({
    active,
    payload,
    label,
    isMobile,
    isTouch,
    tooltipBg,
    tooltipText,
    onDismiss,
    showTotal,
    totalExcludedKeys = [],
    totalIncludedKeys,
    totalLabel = "合計",
    separatorBetweenGroups,
    showAllPayload = false,
    seriesMeta,
    allowedKeys,
    includeUnmappedPayload = false,
    valueFormatter,
    totalFormatter,
  }) => {
    if (!active || !payload) {
      return null;
    }

    const fontSize = "14px";
    const totalFontSize = "16px";
    const labelFontSize = isMobile ? "11px" : "13px";
    const padding = isMobile ? "10px 14px" : "12px";

    const resolvedAllowedKeys = allowedKeys
      ? new Set(typeof allowedKeys === "function" ? allowedKeys(label) : allowedKeys)
      : null;
    // An explicit allowed-key contract is authoritative for every payload,
    // including unknown keys. Raw-key fallback is only an explicit escape
    // hatch for callers that do not provide a period/visibility contract.
    const canIncludeUnmappedPayload = includeUnmappedPayload && !resolvedAllowedKeys;
    const visiblePayload = resolvedAllowedKeys
      ? payload.filter((entry) => resolvedAllowedKeys.has((entry.dataKey ?? entry.name) as string))
      : payload;
    const visibleMeta = seriesMeta?.filter(
      (meta) => !resolvedAllowedKeys || resolvedAllowedKeys.has(meta.key),
    );
    const resolvedPayload: TooltipDisplayPayload[] = visibleMeta
      ? [
          ...[...visibleMeta]
            .sort(
              (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
            )
            .map((meta) => {
              const entry = payload.find(
                (candidate) => (candidate.dataKey ?? candidate.name) === meta.key,
              );
              return {
                name: meta.label,
                value: entry?.value,
                color: meta.color ?? entry?.color,
                dataKey: meta.key,
                order: meta.order,
              };
            }),
          ...(canIncludeUnmappedPayload
            ? visiblePayload
                .filter(
                  (entry) =>
                    !visibleMeta.some((meta) => meta.key === (entry.dataKey ?? entry.name)),
                )
                .map((entry) => ({ ...entry, name: entry.name }))
            : []),
        ]
      : visiblePayload;

    const total = showTotal
      ? resolvedPayload.reduce((acc, e) => {
          const isIncluded = totalIncludedKeys
            ? totalIncludedKeys.includes(e.dataKey as string)
            : !totalExcludedKeys.includes(e.dataKey as string);
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
        style={{
          backgroundColor: tooltipBg,
          border: isMobile ? "1px solid var(--card-border)" : "none",
          borderRadius: isMobile ? "12px 12px 0 0" : "8px",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          color: tooltipText,
          padding: padding,
          paddingBottom: isMobile ? "calc(10px + env(safe-area-inset-bottom, 0px))" : undefined,
          ...(isMobile
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
        {topPayload.map((entry, index) => (
          <div
            key={`item-${index}`}
            className={index === separatorIndex ? styles.tooltipGroupSeparator : undefined}
            data-tooltip-row="true"
            data-tooltip-key={entry.dataKey}
            data-tooltip-label={entry.name}
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
        ))}
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
