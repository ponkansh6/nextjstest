import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.{test.ts,test.tsx}"],
    root: "./",
    environment: "node",
    setupFiles: ["./tests/logic-setup.ts"],
  },
});
