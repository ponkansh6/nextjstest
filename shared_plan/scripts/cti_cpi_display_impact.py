#!/usr/bin/env python3
"""Measure 2017+ real-consumption CPI display alternatives from local CSVs.

Run from any directory with Python 3. The script uses only the repository's
published 2025-base CPI and CTI input snapshots and has no third-party deps.
"""

import csv
import re
import statistics
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2] / "data" / "source"
BASE = 100.0
START_MONTH = "2017-01"

# CTI's official adjusted-distribution groups mapped to the closest available
# broad CPI groups. "Other" is a residual in CTI, while CPI "諸雑費" is not the
# same classification; that exploratory mapping is reported explicitly.
CATEGORIES = {
    "食料": "食料",
    "住居": "住居",
    "光熱・水道": "光熱・水道",
    "家具・家事用品": "家具・家事用品",
    "被服及び履物": "被服及び履物",
    "保健医療": "保健医療",
    "交通・通信": "交通・通信",
    "教育": "教育",
    "教養娯楽": "教養娯楽",
    "その他の消費支出": "諸雑費",
}
OTHER = "その他の消費支出"
METHODS = ("A", "B", "C", "D", "E")


def read_csv(name):
    with (ROOT / name).open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def month_key(text):
    match = re.fullmatch(r"(\d{4})年(\d{1,2})月", text.strip())
    if not match:
        raise ValueError(f"unexpected month label: {text!r}")
    return f"{match.group(1)}-{int(match.group(2)):02d}"


def quarter_of(month):
    year, month_number = map(int, month.split("-"))
    return f"{year}Q{(month_number - 1) // 3 + 1}"


def number(value, context):
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"missing/non-numeric {context}: {value!r}") from error
    if result <= 0:
        raise ValueError(f"non-positive value for {context}: {result}")
    return result


def mean(values):
    return statistics.mean(values)


def summarize(values):
    return {
        "n": len(values),
        "mean": mean(values),
        "mae": mean(abs(value) for value in values),
        "max_abs": max(abs(value) for value in values),
        "min": min(values),
        "max": max(values),
    }


def print_summary(label, values, unit="pt"):
    stats = summarize(values)
    print(
        f"{label}: n={stats['n']}; mean={stats['mean']:.6f}{unit}; "
        f"MAE={stats['mae']:.6f}{unit}; max_abs={stats['max_abs']:.6f}{unit}; "
        f"range=[{stats['min']:.6f}, {stats['max']:.6f}]{unit}"
    )


def period_of_max_abs(periods, values):
    return periods[max(range(len(values)), key=lambda index: abs(values[index]))]


def add_residual(total, categories):
    return total - sum(value for name, value in categories.items() if name != OTHER)


def cpi_monthly():
    result = {}
    for row in read_csv("cpi_data2025_long.csv"):
        month = month_key(row["年月"])
        result[month] = {}
        for label in set(CATEGORIES.values()) | {
            "総合",
            "持家の帰属家賃を除く総合",
            "持家の帰属家賃を除く住居",
        }:
            raw = row.get(label, "").strip()
            if raw and raw != "***":
                result[month][label] = number(raw, f"CPI {month} {label}")
    return result


def cpi_quarterly(months):
    buckets = {}
    for month, series in months.items():
        if month < START_MONTH:
            continue
        buckets.setdefault(quarter_of(month), []).append((month, series))
    output = {}
    for quarter, values in buckets.items():
        expected_months = {
            f"{quarter[:4]}-{month:02d}"
            for month in range((int(quarter[-1]) - 1) * 3 + 1, int(quarter[-1]) * 3 + 1)
        }
        by_label = {}
        for month, series in values:
            for label, value in series.items():
                by_label.setdefault(label, []).append((month, value))
        output[quarter] = {
            label: mean([value for _, value in observations])
            for label, observations in by_label.items()
            if {month for month, _ in observations} == expected_months
        }
    return output


def adjusted_quarterly_nominal():
    output = {}
    for row in read_csv("cti_data2025_distribution_adjusted_quarterly.csv"):
        quarter = row["period"]
        total = number(row["総合"], f"adjusted CTI {quarter} total")
        categories = {
            name: number(row[name], f"adjusted CTI {quarter} {name}")
            for name in CATEGORIES
            if name != OTHER
        }
        categories[OTHER] = add_residual(total, categories)
        output[quarter] = {"総合": total, **categories}
    return output


def cpi_for(method, category, quarter_cpi):
    if method == "A":
        label = "総合"
    elif method == "B":
        label = "持家の帰属家賃を除く総合"
    elif method == "E" and category == OTHER:
        # CTI Other is not CPI miscellaneous; use the all-items ex-imputed-rent
        # index as a general proxy, while preserving the residual definition.
        label = "持家の帰属家賃を除く総合"
    elif method == "E" and category == "住居":
        label = "持家の帰属家賃を除く住居"
    elif method == "D" and category == "住居":
        label = "持家の帰属家賃を除く住居"
    else:
        label = CATEGORIES[category]
    value = quarter_cpi.get(label)
    return number(value, f"quarterly CPI {label}") if value is not None else None


def deflate_quarterly(nominal, quarter_cpi):
    output = {}
    for method in METHODS:
        values = {}
        for category in CATEGORIES:
            index = cpi_for(method, category, quarter_cpi)
            values[category] = nominal[category] * BASE / index if index is not None else None
        # A/B/E use the displayed total with their chosen aggregate index.
        # C/D define the exploratory total as the sum of deflated categories.
        if method in ("A", "B", "E"):
            total_index = "総合" if method == "A" else "持家の帰属家賃を除く総合"
            index = quarter_cpi.get(total_index)
            values["総合"] = nominal["総合"] * BASE / number(
                index, f"quarterly CPI {total_index}"
            ) if index is not None else None
        else:
            category_values = [values[category] for category in CATEGORIES]
            values["総合"] = sum(category_values) if all(value is not None for value in category_values) else None
        category_values = [values[category] for category in CATEGORIES]
        values["費目和"] = sum(category_values) if all(value is not None for value in category_values) else None
        output[method] = values
    return output


def yoy(series):
    result = {}
    for quarter, value in series.items():
        if value is None:
            continue
        year, q = int(quarter[:4]), quarter[-1]
        previous = f"{year - 1}Q{q}"
        if previous in series and series[previous] is not None:
            result[quarter] = 100 * (value / series[previous] - 1)
    return result


def monthly_basic_rows(cpi):
    output = {}
    for row in read_csv("cti_data2025.csv"):
        month = month_key(row["月"])
        if month < START_MONTH:
            continue
        total = number(row["消費支出（名目）"], f"basic CTI {month} total")
        categories = {}
        for name in CATEGORIES:
            if name == OTHER:
                continue
            categories[name] = number(row[f"{name}（名目）"], f"basic CTI {month} {name}")
        categories[OTHER] = add_residual(total, categories)
        required = set(CATEGORIES.values()) | {
            "総合",
            "持家の帰属家賃を除く総合",
            "持家の帰属家賃を除く住居",
        }
        if month not in cpi or not required.issubset(cpi[month]):
            continue
        output[month] = {"総合": total, **categories, "CPI": cpi[month]}
    return output


def measure_aggregation_order(monthly):
    grouped = {}
    for month, row in monthly.items():
        grouped.setdefault(quarter_of(month), []).append((month, row))
    for method in METHODS:
        gaps = {category: [] for category in ("総合", *CATEGORIES)}
        eligible = 0
        for quarter, pairs in grouped.items():
            if len(pairs) != 3:
                continue
            quarter_cpi = {
                name: mean([row["CPI"][name] for _, row in pairs])
                for name in set.intersection(*(set(row["CPI"]) for _, row in pairs))
            }
            nominal = {
                category: mean([row[category] for _, row in pairs])
                for category in ("総合", *CATEGORIES)
            }
            quarterly_first = deflate_quarterly(nominal, quarter_cpi)[method]
            monthly_first = {}
            for category in CATEGORIES:
                monthly_first[category] = mean(
                    row[category] * BASE / cpi_for(method, category, row["CPI"])
                    for _, row in pairs
                )
            if method in ("A", "B", "E"):
                index = "総合" if method == "A" else "持家の帰属家賃を除く総合"
                monthly_first["総合"] = mean(
                    row["総合"] * BASE / row["CPI"][index] for _, row in pairs
                )
            else:
                monthly_first["総合"] = sum(monthly_first[name] for name in CATEGORIES)
            for category in gaps:
                gaps[category].append(monthly_first[category] - quarterly_first[category])
            eligible += 1
        all_gaps = [value for values in gaps.values() for value in values]
        print_summary(f"aggregation {method} all category-quarter gaps (monthly-first minus quarter-first)", all_gaps)
        for category, values in gaps.items():
            print_summary(f"  aggregation {method} {category}", values)
        print(f"  aggregation {method} complete quarters={eligible}")


def run():
    monthly_cpi = cpi_monthly()
    quarterly_cpi = cpi_quarterly(monthly_cpi)
    nominal = adjusted_quarterly_nominal()
    quarters = sorted(nominal)
    if not quarters:
        raise ValueError("no complete adjusted-CTI/CPI quarters from 2017Q1")
    if quarters[0] != "2017Q1":
        raise ValueError(f"unexpected first quarter: {quarters[0]}")

    real = {
        quarter: deflate_quarterly(nominal[quarter], quarterly_cpi[quarter])
        for quarter in quarters
    }
    print("Inputs: local 2025-base CPI monthly and CTI adjusted-distribution quarterly snapshots")
    print("CPI scale: 2025=100 (published one-decimal values; no rescaling)")
    print("A: total CPI for total and every category; B: imputed-rent-excluded all-items CPI for all")
    print("C: matched broad CPI by CTI category; D: C with housing CPI excluding owner-equivalent rent")
    print("E: total directly uses ex-imputed-rent all-items CPI; nine categories use same-name CPI (housing excludes imputed rent); CTI Other uses the all-items ex-imputed-rent CPI as a general proxy")
    print("CTI Other is total minus the other nine groups; C/D map it exploratorily to CPI 諸雑費")
    print(f"Adjusted CTI quarters={len(quarters)}; period={quarters[0]}..{quarters[-1]}")

    for method in METHODS:
        print(
            f"{method} CPI availability: total={sum(real[q][method]['総合'] is not None for q in quarters)}/{len(quarters)}; "
            f"category-sum={sum(real[q][method]['費目和'] is not None for q in quarters)}/{len(quarters)}"
        )
        valid_total = [q for q in quarters if real[q][method]["総合"] is not None]
        total_level = [real[q][method]["総合"] - nominal[q]["総合"] for q in valid_total]
        relative = [100 * (real[q][method]["総合"] / nominal[q]["総合"] - 1) for q in valid_total]
        nominal_yoy = yoy({q: nominal[q]["総合"] for q in quarters})
        real_yoy = yoy({q: real[q][method]["総合"] for q in quarters})
        yoy_diff = [real_yoy[q] - nominal_yoy[q] for q in real_yoy if q in nominal_yoy]
        print_summary(f"{method} total real-minus-nominal level", total_level)
        max_quarter = period_of_max_abs(valid_total, total_level)
        print(f"  max absolute level impact quarter={max_quarter} ({total_level[valid_total.index(max_quarter)]:+.6f}pt)")
        print_summary(f"{method} total real relative to nominal", relative, "%")
        print_summary(f"{method} total YoY growth difference (real minus nominal)", yoy_diff, "pp")
        for category in CATEGORIES:
            valid_category = [q for q in quarters if real[q][method][category] is not None]
            lift = [100 * (real[q][method][category] / nominal[q][category] - 1) for q in valid_category]
            print_summary(f"  {method} {category} relative to nominal", lift, "%")

    for method in ("B", "C", "D", "E"):
        total_gap = [real[q][method]["総合"] - real[q]["A"]["総合"] for q in quarters if real[q][method]["総合"] is not None]
        print_summary(f"{method} minus A total real level", total_gap)
        for category in CATEGORIES:
            gap = [real[q][method][category] - real[q]["A"][category] for q in quarters if real[q][method][category] is not None]
            print_summary(f"  {method} minus A {category}", gap)
            method_yoy = yoy({q: real[q][method][category] for q in quarters})
            a_yoy = yoy({q: real[q]["A"][category] for q in quarters})
            yoy_gap = [method_yoy[q] - a_yoy[q] for q in method_yoy if q in a_yoy]
            print_summary(f"    {method} minus A {category} YoY growth", yoy_gap, "pp")
            changed_direction = [
                q for q in method_yoy if q in a_yoy and (method_yoy[q] < 0) != (a_yoy[q] < 0)
            ]
            print(f"    YoY sign differs from A in {len(changed_direction)}/{len(yoy_gap)} quarters")

    for category in ("総合", "住居"):
        gap = [real[q]["D"][category] - real[q]["C"][category] for q in quarters]
        print_summary(f"D minus C {category} real level", gap)

    for category in ("総合", *CATEGORIES):
        gap = [
            real[q]["E"][category] - real[q]["C"][category]
            for q in quarters
            if real[q]["E"][category] is not None and real[q]["C"][category] is not None
        ]
        print_summary(f"E minus C {category} real level", gap)

    print("C/D aggregation definition: real total is the sum of the ten deflated CTI categories when all ten are available.")
    print("A/B/E real total is independently deflated; the deflated-category sum is reported separately.")
    for method in ("A", "B", "E"):
        mismatch = [
            real[q][method]["総合"] - real[q][method]["費目和"]
            for q in quarters if real[q][method]["総合"] is not None and real[q][method]["費目和"] is not None
        ]
        print_summary(f"{method} total minus sum of deflated categories (rounding/classification residual)", mismatch)

    endpoints = [quarters[0], quarters[-1]]
    for quarter in endpoints:
        print(f"endpoint {quarter}: nominal_total={nominal[quarter]['総合']:.3f}")
        for method in METHODS:
            value = real[quarter][method]["総合"]
            print(f"  {method} real_total={value:.3f}" if value is not None else f"  {method} real_total=unavailable")

    print("Aggregation-order sensitivity uses same basic-CTI monthly series for both orders.")
    measure_aggregation_order(monthly_basic_rows(monthly_cpi))


if __name__ == "__main__":
    run()
