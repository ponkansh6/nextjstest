import { test as base, expect } from "@playwright/test";

/**
 * E2E 共通フィクスチャ。
 *
 * `LazyMount`（P5-1 遅延マウント）はビューポート外のチャートをマウントしないため、
 * そのままだと「7 本すべてが DOM にある」ことを前提にした E2E が落ちる。
 * ここで `window.__MOUNT_ALL__` を立てて全チャートを即時マウントさせ、
 * 遅延マウント自体の検証は専用テスト（lazy-mount.e2e.spec.ts）に分離する。
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.__MOUNT_ALL__ = true;
    });
    await use(page);
  },
});

export { expect };
