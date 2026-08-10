"use client";

import React, { useState } from "react";
import styles from "./CpiChart.module.css";

type Theme = "light" | "dark" | "system";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const saved = localStorage.getItem("theme") as Theme | null;
    return saved || "system";
  });

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    if (newTheme === "dark") {
      localStorage.setItem("theme", "dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (newTheme === "light") {
      localStorage.setItem("theme", "light");
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      localStorage.removeItem("theme");
      document.documentElement.removeAttribute("data-theme");
    }
  };

  return (
    <div
      className={styles.themeToggleContainer}
      style={{
        display: "flex",
        gap: "0.25rem",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "9999px",
        padding: "0.25rem",
      }}
    >
      <button
        type="button"
        className={styles.actionButton}
        style={{
          borderRadius: "9999px",
          border: theme === "light" ? "1px solid var(--blue-500)" : "1px solid transparent",
          background: theme === "light" ? "var(--blue-50)" : "transparent",
        }}
        onClick={() => changeTheme("light")}
        aria-label="ライトモード"
      >
        ☀️
      </button>
      <button
        type="button"
        className={styles.actionButton}
        style={{
          borderRadius: "9999px",
          border: theme === "system" ? "1px solid var(--blue-500)" : "1px solid transparent",
          background: theme === "system" ? "var(--blue-50)" : "transparent",
        }}
        onClick={() => changeTheme("system")}
        aria-label="システム設定に従う"
      >
        💻
      </button>
      <button
        type="button"
        className={styles.actionButton}
        style={{
          borderRadius: "9999px",
          border: theme === "dark" ? "1px solid var(--blue-500)" : "1px solid transparent",
          background: theme === "dark" ? "var(--blue-50)" : "transparent",
        }}
        onClick={() => changeTheme("dark")}
        aria-label="ダークモード"
      >
        🌙
      </button>
    </div>
  );
}
