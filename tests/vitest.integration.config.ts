import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * 外部依存を持つテスト専用の設定。
 *
 * ルートの `vitest.config.ts` はこれらを `exclude` しているため（既定の `pnpm test` を
 * ネットワーク/ビルド成果物に依存させないため）、明示的に実行する場合はこの設定を使う。
 *
 *   pnpm test:prod           … tests/production（PROD_URL 必須）
 *   pnpm test:build-parity   … tests/build（先に pnpm build が必要）
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
      "@server": path.resolve(__dirname, "../server"),
    },
  },
  test: {
    root: path.resolve(__dirname, ".."),
    environment: "node",
    globals: true,
    include: ["tests/production/**/*.test.ts", "tests/build/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
