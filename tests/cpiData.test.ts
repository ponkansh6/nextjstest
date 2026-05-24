import { expect, test } from 'vitest';
import { loadTotalEarningData } from '../src/lib/cpiData';

// 2025年12月の所定内給与と所定外給与の比率が
// hon-mks202512.csv に記載された（270,719:20,560）と大きくずれないことを検査する
// 許容誤差は絶対差で0.002（0.2%）とする

test('2025/12 所定外/所定内 比率が期待値と近いこと', async () => {
  const data = await loadTotalEarningData();
  const item = data.find((d) => d.年月 === '2025年12月');
  expect(item).toBeTruthy();
  const ratio = (item?.['所定外給与'] || 0) / (item?.['所定内給与'] || 1);
  const expected = 20560 / 270719;
  const diff = Math.abs(ratio - expected);
  expect(diff).toBeLessThan(0.002);
});