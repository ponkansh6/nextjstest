import { useState, useCallback } from "react";

/**
 * Generic hook for managing a set of hidden/toggled values.
 * Replaces multiple similar toggle state patterns.
 */
export function useToggleSet<T extends string | number>(initial: T[] = []) {
  const [hidden, setHidden] = useState<T[]>(initial);

  const toggle = useCallback((key: T) => {
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  return [hidden, toggle, setHidden] as const;
}
