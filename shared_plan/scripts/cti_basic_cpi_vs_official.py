import csv, re, statistics
from pathlib import Path
root = Path(__file__).resolve().parents[2] / 'data' / 'source'
def read(name):
    with (root / name).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))
def month(text):
    y, m = re.match(r'(\d{4})年(\d+)月', text).groups()
    return f'{y}-{int(m):02d}'
cti = read('cti_data2025.csv')
cpi_rows = read('cpi_data2025_long.csv')
cpi = {month(r['年月']): float(r['総合']) for r in cpi_rows if r['総合'].strip()}
# Main assumption: CPI file has 2025=100 basis; use 100 directly.
# Sensitivity: its one-decimal published monthly values average to 100.008333 in 2025.
scales = [('base100', 100.0), ('published_2025_mean', statistics.mean(cpi[f'2025-{m:02d}'] for m in range(1, 13)))]
monthly = []
for row in cti:
    m = month(row['月'])
    if m < '2017-01':
        continue
    try:
        nominal = float(row['消費支出（名目）'])
        official = float(row['消費支出（実質）'])
        price = cpi[m]
    except (ValueError, KeyError):
        continue
    monthly.append((m, nominal, official, price))
qdata = {}
for m, n, official, price in monthly:
    y, mo = map(int, m.split('-'))
    q = f'{y}Q{(mo-1)//3 + 1}'
    qdata.setdefault(q, []).append((n, official, price))
for label, scale in scales:
    quarters = {}
    for q, values in qdata.items():
        if len(values) != 3:
            continue
        # Both the deflated nominal and official real series are quarterly
        # arithmetic means of the same 3 monthly basic-series observations.
        cpi_real = statistics.mean(n * scale / p for n, _, p in values)
        official_real = statistics.mean(r for _, r, _ in values)
        nominal = statistics.mean(n for n, _, _ in values)
        quarters[q] = (cpi_real, official_real, nominal)
    differences = [cpi_real - official for cpi_real, official, _ in quarters.values()]
    absdiff = list(map(abs, differences))
    yoy_diff_pp = []
    yoy_abs_pp = []
    for q, (cpi_real, official, nominal) in quarters.items():
        y, quarter = int(q[:4]), q[-1]
        prev = f'{y-1}Q{quarter}'
        if prev not in quarters:
            continue
        prev_cpi, prev_off, prev_nom = quarters[prev]
        cpi_yoy = 100 * (cpi_real / prev_cpi - 1)
        official_yoy = 100 * (official / prev_off - 1)
        yoy_diff_pp.append(cpi_yoy - official_yoy)
        yoy_abs_pp.append(abs(cpi_yoy - official_yoy))
    print(f'[{label}] scale={scale:.9f}, quarters={len(quarters)}, period={next(iter(quarters))}..{list(quarters)[-1]}')
    print(f'level CPI-real minus official-real: mean={statistics.mean(differences):.6f}, MAE={statistics.mean(absdiff):.6f}, max_abs={max(absdiff):.6f}, min={min(differences):.6f}, max={max(differences):.6f}')
    print(f'YoY growth CPI-real minus official-real: n={len(yoy_diff_pp)}, mean={statistics.mean(yoy_diff_pp):.6f}pp, MAE={statistics.mean(yoy_abs_pp):.6f}pp, max_abs={max(yoy_abs_pp):.6f}pp, min={min(yoy_diff_pp):.6f}pp, max={max(yoy_diff_pp):.6f}pp')
