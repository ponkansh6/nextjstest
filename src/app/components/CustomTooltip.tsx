import React from "react";
import type { CustomTooltipProps } from "@/types/chart";

export const CustomTooltip = React.memo<CustomTooltipProps>(
  ({ active, payload, label, isMobile, tooltipBg, tooltipText }) => {
    if (!active || !payload) {
      return null;
    }

    const fontSize = isMobile ? "12px" : "14px";
    const labelFontSize = isMobile ? "11px" : "13px";
    const padding = isMobile ? "12px 16px" : "12px";

    const displayPayload = isMobile
      ? [...payload]
          .sort((a, b) => {
            const valA = typeof a.value === "number" ? a.value : 0;
            const valB = typeof b.value === "number" ? b.value : 0;
            return valB - valA;
          })
      : payload;

    const topPayload = isMobile ? displayPayload.slice(0, 5) : displayPayload;
    const remainingCount = isMobile ? displayPayload.length - topPayload.length : 0;

    return (
      <div
        style={{
          backgroundColor: tooltipBg,
          border: isMobile ? "1px solid var(--card-border)" : "none",
          borderRadius: isMobile ? "12px 12px 0 0" : "8px",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          color: tooltipText,
          padding: padding,
          ...(isMobile
            ? {
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                width: "100%",
                zIndex: 1000,
                maxHeight: "40dvh",
                overflowY: "auto",
                boxSizing: "border-box",
              }
            : {}),
        }}
      >
        <p
          style={{
            color: tooltipText,
            fontSize: labelFontSize,
            fontWeight: "bold",
            margin: 0,
            marginBottom: "4px",
          }}
        >
          {label}
        </p>
        {topPayload.map((entry, index) => (
          <div
            key={`item-${index}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: fontSize,
              margin: "2px 0",
              color: tooltipText,
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
            <span>
              {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
            </span>
          </div>
        ))}
        {remainingCount > 0 && (
          <p
            style={{
              color: tooltipText,
              fontSize: fontSize,
              opacity: 0.7,
              margin: "4px 0 0 0",
            }}
          >
            他 {remainingCount} 件
          </p>
        )}
      </div>
    );
  },
);

CustomTooltip.displayName = "CustomTooltip";
