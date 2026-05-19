import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "./",
    globals: false,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    pool: "forks",
  },
});
