import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    include: ["tests/**/*.{test.ts,test.tsx}"],
    root: "./",
    environment: "happy-dom",
    setupFiles: ["./tests/utils/logic-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "json", "html"],
    },
  },
});
