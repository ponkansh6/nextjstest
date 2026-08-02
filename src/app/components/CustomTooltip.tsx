import React from "react";
import type { CustomTooltipProps } from "@/types/chart";

export const CustomTooltip = React.memo<CustomTooltipProps>(
  ({ active, payload, label, isMobile, tooltipBg, tooltipText }) => {
    if (!active || !payload) {
      return null;
    }

    const fontSize = isMobile ? "12px" : "14px";
    const labelFontSize = isMobile ? "11px" : "13px";
    const padding = isMobile ? "8px" : "12px";

    return (
      <div
        style={{
          backgroundColor: tooltipBg,
          border: "none",
          borderRadius: "8px",
          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
          color: tooltipText,
          padding: padding,
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
        {payload.map((entry, index) => (
          <p
            key={`item-${index}`}
            style={{
              color: tooltipText,
              fontSize: fontSize,
              margin: "2px 0",
            }}
          >
            {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
          </p>
        ))}
      </div>
    );
  },
);

CustomTooltip.displayName = "CustomTooltip";
