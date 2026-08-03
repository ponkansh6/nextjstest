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
    // - tests/e2e:        Playwright E2E（playwright test で実行） → `pnpm test:e2e`
    exclude: [...configDefaults.exclude, "tests/production/**", "tests/build/**", "tests/e2e/**"],
  },
});
