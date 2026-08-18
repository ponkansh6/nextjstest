/**
 * WCAG 2.0 コントラスト比計算ユーティリティ（E2E 共通）
 * computeContrastRatio を(page) => Promise<number> の形で返すクロージャを作成し、
 * evaluate 内で直接使える関数を提供する。
 */

/**
 * page.evaluate() 内で実行する関数を返す。
 * 使用例:
 *   const ratio = await link.evaluate(contrastRatioFn);
 */
export const contrastRatioFn = (el: HTMLElement): number => {
  const luminance = (r: number, g: number, b: number) => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const parseRgba = (str: string): [number, number, number, number] => {
    const nums = str.match(/[\d.]+/g);
    if (!nums || nums.length < 3) return [0, 0, 0, 1];
    const r = +nums[0];
    const g = +nums[1];
    const b = +nums[2];
    const a = nums.length >= 4 ? +nums[3] : 1;
    return [r, g, b, a];
  };

  const styles = window.getComputedStyle(el);
  const fgRgba = parseRgba(styles.color);
  const bgRgba = parseRgba(styles.backgroundColor);

  let bg: [number, number, number] = [bgRgba[0], bgRgba[1], bgRgba[2]];
  if (bgRgba[3] < 1) {
    let parent = el.parentElement;
    let found = false;
    while (parent) {
      const [pr, pg, pb, pa] = parseRgba(window.getComputedStyle(parent).backgroundColor);
      if (pa >= 1) {
        const a = bgRgba[3];
        bg = [
          Math.round(bgRgba[0] * a + pr * (1 - a)),
          Math.round(bgRgba[1] * a + pg * (1 - a)),
          Math.round(bgRgba[2] * a + pb * (1 - a)),
        ];
        found = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (!found) {
      bg = [bgRgba[0], bgRgba[1], bgRgba[2]];
    }
  } else {
    bg = [bgRgba[0], bgRgba[1], bgRgba[2]];
  }

  const l1 = luminance(fgRgba[0], fgRgba[1], fgRgba[2]);
  const l2 = luminance(bg[0], bg[1], bg[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};
