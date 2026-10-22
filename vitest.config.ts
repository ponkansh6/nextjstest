import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@server": path.resolve(__dirname, "server"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    // 外部依存/ビルド成果物を要求するテストは既定の `pnpm test` から除外する。
    // - tests/production: 商用URL(PROD_URL)へのネットワークアクセスが必要 → `pnpm test:prod`
    // - tests/build:      先に `pnpm build` が必要             → `pnpm test:build-parity`
    exclude: [
      ...configDefaults.exclude,
      "tests/production/**",
      "tests/build/**",
      "tests/browser-mode/**",
      "results/plan46/phase4/vitest-selector-route-probe.browser.test.ts",
      "**/.plan42*",
      "**/.plan42*/**",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
      // Exclude only files outside the unit-test runtime contract. Keep this
      // list explicit so a new runtime module cannot silently leave the denominator.
      exclude: [
        "**/*.d.ts",
        "src/types/data.ts",
        "src/types/index.ts",
        // Next owns font loading and metadata integration; production build and
        // browser route checks exercise this framework entry point.
        "src/app/layout.tsx",
        // Analysis-only sensitivity entry point; imported by Plan39 scripts
        // and unit tests, with no production app import path.
        "server/lib/ctiAdjustedSensitivity.ts",
        // Scroll/effect behavior is asserted in SectionTabsTargets, B3m, and
        // SectionTabsB3m Browser Mode checks.
        "src/app/components/SectionTabs.tsx",
        // IntersectionObserver-driven mounting is asserted in the dedicated
        // Chromium LazyMount check and the B3m Browser Mode checks.
        "src/app/components/LazyMount.tsx",
      ],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      reporter: ["text", "json-summary", "json", "html"],
      reportOnFailure: true,
      skipFull: true,
    },
  },
});
