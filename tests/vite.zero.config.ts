import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  build: {
    lib: {
      entry: "minimal-speed.test.ts",
      formats: ["es"],
    },
    minify: false,
  },
});
