"use client";

import React, { useState } from "react";
import styles from "./CpiChart.module.css";

type Theme = "light" | "dark" | "system";

const THEME_ORDER: Theme[] = ["light", "dark", "system"];
const THEME_ICON: Record<Theme, string> = { light: "☀️", dark: "🌙", system: "💻" };
const THEME_LABEL: Record<Theme, string> = {
  light: "ライトモード",
  dark: "ダークモード",
  system: "システム設定に従う",
};

function applyTheme(theme: Theme) {
  if (theme === "dark") {
    try {
      localStorage.setItem("theme", "dark");
    } catch {
      // Theme application must continue when storage writes are unavailable.
    }
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (theme === "light") {
    try {
      localStorage.setItem("theme", "light");
    } catch {
      // Theme application must continue when storage writes are unavailable.
    }
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    try {
      localStorage.removeItem("theme");
    } catch {
      // Theme application must continue when storage writes are unavailable.
    }
    document.documentElement.removeAttribute("data-theme");
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const saved = localStorage.getItem("theme") as Theme | null;
    return saved || "system";
  });

  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];

  const handleClick = () => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      className={styles.themeToggleButton}
      onClick={handleClick}
      aria-label={`テーマ: ${THEME_LABEL[theme]}（タップで${THEME_LABEL[nextTheme]}に切替）`}
    >
      {THEME_ICON[theme]}
    </button>
  );
}
