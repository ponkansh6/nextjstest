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

  useEffect(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector(`[aria-current="true"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [activeId]);

  return (
    <div className={styles.sectionTabs} ref={scrollRef}>
      {sections.map((sec) => {
        const isActive = sec.id === activeId;
        return (
          <button
            key={sec.id}
            type="button"
            className={styles.sectionTab}
            aria-current={isActive ? "true" : "false"}
            onClick={() => onSelect(sec.id)}
          >
            {sec.label}
          </button>
        );
      })}
      <button
        type="button"
        className={styles.sectionRange}
        onClick={onRangeClick}
        aria-label="表示期間を変更"
      >
        {rangeLabel} ▾
      </button>
      <ThemeToggle />
    </div>
  );
}
