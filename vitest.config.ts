import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    include: ["tests/**/*.{test.ts,test.tsx}", "!tests/debug/**/*"],
    root: "./",
    environment: "node",
    setupFiles: ["./tests/utils/logic-setup.ts"],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text', 'json', 'html'],
    },
  },
});
