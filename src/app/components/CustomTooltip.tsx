"use client";

import React from "react";
import type { CustomTooltipProps } from "@/types/chart";

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
    showAllPayload = false,
  }) => {
    if (!active || !payload) {
      return null;
    }

    const fontSize = "14px";
    const totalFontSize = "16px";
    const labelFontSize = isMobile ? "11px" : "13px";
    const padding = isMobile ? "10px 14px" : "12px";

    const total = showTotal
      ? payload.reduce(
          (acc, e) =>
            totalExcludedKeys.includes(e.dataKey as string)
              ? acc
              : acc + (typeof e.value === "number" ? e.value : 0),
          0,
        )
      : null;

    const displayPayload = isMobile
      ? [...payload].sort((a, b) => {
          const valA = typeof a.value === "number" ? a.value : 0;
          const valB = typeof b.value === "number" ? b.value : 0;
          return valB - valA;
        })
      : payload;

    // Consumption tooltips opt into every series on either viewport. When the
    // option is omitted, retain the existing mobile/desktop presentation.
    const shouldShowAllPayload = showAllPayload;
    const topPayload = shouldShowAllPayload ? displayPayload : displayPayload.slice(0, 5);
    const remainingPayloadCount = displayPayload.length - topPayload.length;

    return (
      <div
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
                  "min(40dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 8px))",
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
            <span>合計</span>
            <span>{total.toFixed(2)}</span>
          </div>
        )}
        {topPayload.map((entry, index) => (
          <div
            key={`item-${index}`}
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
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{entry.name}</span>
            <span
              style={{
                flexShrink: 0,
                marginLeft: "auto",
                textAlign: "right",
                whiteSpace: "nowrap",
              }}
            >
              {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
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
