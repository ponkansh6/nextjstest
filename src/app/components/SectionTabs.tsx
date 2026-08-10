"use client";

import React, { useEffect, useRef } from "react";
import styles from "./CpiChart.module.css";
import { ThemeToggle } from "./ThemeToggle";

interface SectionTabsProps {
  sections: { id: string; label: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  rangeLabel: string;
  onRangeClick: () => void;
}

export function SectionTabs({
  sections,
  activeId,
  onSelect,
  rangeLabel,
  onRangeClick,
}: SectionTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // タブクリックで発生した activeId 変更かどうかを追跡する。WebKit(Safari)では、
  // このタブ行の横方向 scrollIntoView と、CpiChart 側のセクション本体への縦方向
  // scrollIntoView(smooth)が近接して発火すると、後から呼ばれた方が先の smooth
  // スクロールをキャンセルしてしまい、ページが全くスクロールしない不具合があった
  // (実機のiPhone/Androidで確認)。クリック起因の場合は横スクロールをクリック
  // ハンドラー内で即時(instant)に先に完了させておき、この effect 側では
  // スキップすることで、縦方向の smooth スクロールと競合しないようにする。
  const skipNextAutoScrollRef = useRef(false);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    const activeEl = scrollRef.current.querySelector(`[aria-current="true"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeId]);

  const handleTabClick = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
    skipNextAutoScrollRef.current = true;
    onSelect(id);
  };

  return (
    <div className={styles.sectionTabs}>
      <button
        type="button"
        className={styles.sectionRange}
        onClick={onRangeClick}
        aria-label="表示期間を変更"
      >
        {rangeLabel} ▾
      </button>
      <div className={styles.sectionTabsScroll} ref={scrollRef}>
        {sections.map((sec) => {
          const isActive = sec.id === activeId;
          return (
            <button
              key={sec.id}
              type="button"
              className={styles.sectionTab}
              aria-current={isActive ? "true" : "false"}
              onClick={(e) => handleTabClick(sec.id, e)}
            >
              {sec.label}
            </button>
          );
        })}
        <ThemeToggle />
      </div>
    </div>
  );
}
