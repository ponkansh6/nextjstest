"use client";

import { useEffect } from "react";

/**
 * React state is authoritative while the chart is mounted. The effect is a
 * one-way persistence boundary: React state -> localStorage. The stored value
 * is not read back here and never drives the URL.
 */
export function useAdvancedPreference(
  showAdvanced: boolean,
  startYear: number,
  endYear: number,
  hiddenKeys: string[],
) {
  useEffect(() => {
    try {
      window.localStorage.setItem("newGraphShowAdvanced", showAdvanced ? "1" : "0");
    } catch {
      // ignore
    }
  }, [startYear, endYear, hiddenKeys, showAdvanced]);
}
