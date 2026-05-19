import { useState, useCallback } from "react";

export const useLegendState = (initialKeys: string[] = []) => {
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(initialKeys);

  const toggleKey = useCallback((key: string) => {
    setHiddenKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const resetKeys = useCallback(() => setHiddenKeys([]), []);

  return { hiddenKeys, toggleKey, resetKeys, setHiddenKeys };
};
