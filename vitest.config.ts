import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    pool: "threads",
    poolOptions: {
      threads: {
        isolate: false,
      },
    },
    root: "./",
    setupFiles: ["./tests/setup.ts"],
  } as any,
});
