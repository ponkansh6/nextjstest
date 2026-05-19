import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "./",
    globals: false,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    pool: "forks",
    // @ts-ignore
    environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]],
  },
});
