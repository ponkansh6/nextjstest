"use client";

import React, { useEffect, useRef, useState } from "react";
import type { CustomTooltipProps } from "@/types/chart";

export const CustomTooltip = React.memo<CustomTooltipProps>(
  ({ active, payload, label, isMobile, isTouch, tooltipBg, tooltipText, resetKey, suppressed }) => {
    const [dismissed, setDismissed] = useState(false);
    const prevKeyRef = useRef<string | null>(null);
    const prevSuppressedRef = useRef(suppressed);
    const prevResetKeyRef = useRef(resetKey);

    useEffect(() => {
      setDismissed(false);
    }, [resetKey]);

    useEffect(() => {
      const key = active ? (label ?? "") : null;
      if (active && key !== prevKeyRef.current) {
        setDismissed(false);
      }
      prevKeyRef.current = key;
    }, [active, label]);

    useEffect(() => {
      // 抑制（タブジャンプのプログラム的スクロール）が解除された直後、
      // 抑制中に Recharts 内部へ登録されたクリック状態が active として
      // 「後出し」表示されるのを防ぐ。ただし、解除と同時に新しい正当な
      // タップ（resetKey の変化）が伴う場合はそれを潰さない。
      // この effect を label 監視 effect より後に置くことで、同一コミット内の
      // setDismissed 呼び出しの最終結果として後出し表示を打ち消す。
      if (prevSuppressedRef.current && !suppressed) {
        if (resetKey === prevResetKeyRef.current) {
          setDismissed(true);
        }
      }
      prevSuppressedRef.current = suppressed;
      prevResetKeyRef.current = resetKey;
    }, [suppressed, resetKey]);

    useEffect(() => {
      if (!active || !isTouch) return;
      const startY = window.scrollY;
      const handleScroll = () => {
        if (Math.abs(window.scrollY - startY) > 40) {
          setDismissed(true);
        }
      };
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }, [active, isTouch]);

    if (!active || !payload) {
      return null;
    }
    if (isTouch && dismissed) {
      return null;
    }

    const fontSize = isMobile ? "12px" : "14px";
    const labelFontSize = isMobile ? "11px" : "13px";
    const padding = isMobile ? "10px 14px" : "12px";

    const displayPayload = isMobile
      ? [...payload].sort((a, b) => {
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
                setDismissed(true);
              }}
              onTouchEnd={(e) => {
                // このボタンはRecharts の <Tooltip> content 内(.recharts-wrapper 配下)に
                // レンダリングされる。preventDefault しないと touchend 後にブラウザが
                // 同じ座標(チャート外)へ合成 mousemove/click を発火し、Recharts が
                // 「カーソルがチャート外に出た」と誤認してタッチ追跡状態を崩し、
                // 以後タップしてもツールチップが再表示されなくなる。
                e.preventDefault();
                e.stopPropagation();
                setDismissed(true);
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
