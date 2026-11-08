# e-Stat source coverage

This inventory records the latest period present in the repository's bundled
e-Stat data across the active refresh source families, based on the successful
refresh on 2026-11-08. It describes data coverage, not the date a release was
published. The source metadata and data files listed below are the evidence
for each period. The actual-value snapshot is currently the migrated June
baseline. The catalog-driven refresh path discovers the latest confirmed
source period (2026-08 as of 2026-11-08); publishing that candidate will advance
the bundled snapshot and these item rows.

| Source                                                                                                    | Frequency / series                                                                                  | Latest period in this snapshot                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consumer Price Index (CPI), file `statInfId=000040482945`                                                 | Monthly, 2025-base connected national series                                                        | 2026-09                                                 | `data/source/cpi_data2025_long.csv`; `data/source/cpi_data2025_long.metadata.json` (`period.end`)                                                                                                                                                                                                                                                                                                                                                              |
| Consumption Trend Index (CTI), official monthly, `statInfId=000040499070`, `000040499082`, `000040499028` | Monthly, basic and distribution-adjusted long series                                                | 2026-08                                                 | `data/source/official-cti-2025-long-term/000040499070.normalized.csv`; `data/source/official-cti-2025-long-term/000040499070.metadata.json`; `data/source/official-cti-2025-long-term/000040499082.normalized.csv`; `data/source/official-cti-2025-long-term/000040499082.metadata.json`; `data/source/official-cti-2025-long-term/000040499028.normalized.csv`; `data/source/official-cti-2025-long-term/000040499028.metadata.json` (`latestPublishedMonth`) |
| CTI, basic monthly, `statInfId=000040499069`                                                              | Monthly, 22 basic series                                                                            | 2026-08                                                 | `data/source/cti_data2025.csv`; `data/source/cti_data2025.metadata.json` (`period.end`)                                                                                                                                                                                                                                                                                                                                                                        |
| CTI, distribution-adjusted monthly, `statInfId=000040499087`                                              | Monthly, 22 adjusted series                                                                         | 2026-08                                                 | `data/source/cti_data2025_distribution_adjusted.csv`; `data/source/cti_data2025_distribution_adjusted.metadata.json` (`period.end`)                                                                                                                                                                                                                                                                                                                            |
| CTI, adjusted quarterly, `statInfId=000040499087`                                                         | Quarterly, distribution-adjusted nominal series                                                     | 2026 Q2                                                 | `data/source/cti_data2025_distribution_adjusted_quarterly.csv`; `data/source/cti_data2025_distribution_adjusted_quarterly.metadata.json` (`adoptedRange.end`)                                                                                                                                                                                                                                                                                                  |
| Wages and employment, long series, `statInfId=000032189777`                                               | Monthly, six wage, hours, employment, and part-time series                                          | 2026-08                                                 | `data/source/total_earning.csv`; `data/source/contractual_earnings.csv`; `data/source/scheduled_earnings.csv`; `data/source/total_worked_hours.csv`; `data/source/employment_indices.csv`; `data/source/part_time_worker_ratio.csv`; `data/source/employment_indices.metadata.json`; `data/source/part_time_worker_ratio.metadata.json` (`period.end`)                                                                                                         |
| Monthly Labour Survey actual-value source snapshot, catalog-discovered `実数原表`                         | Bundled confirmed cross-section, distinct from the long series; item-level coverage is listed below | 2026-06 (bundled); 2026-08 (latest confirmed available) | `data/source/monthly_labor_statistics_actual_snapshot.csv`; `.metadata.json` (`period`); `.xls`. The August candidate is discoverable from the official e-Stat catalog and is not included in the bundled snapshot until publish.                                                                                                                                                                                                                              |
| Population statistics, `statInfId=000031831366`                                                           | Monthly, nationwide population by age group                                                         | 2026-09                                                 | `data/source/population_statistics.csv`; `data/source/population_statistics.metadata.json` (`period.end`)                                                                                                                                                                                                                                                                                                                                                      |

The CTI monthly and quarterly outputs are listed separately even when they
share a source table, because their frequencies and coverage boundaries differ.
The Monthly Labour Survey actual-value snapshot is separate from the monthly
long series because it has a different definition. For future refreshes, take
each latest period from the corresponding metadata and confirm it against the
published CSV before updating this table.

## Refreshing e-Stat snapshots

For a routine refresh, check the discovered data and review the report before
publishing:

```sh
pnpm data:refresh --check
pnpm data:refresh
```

If the check stops with `actuals-same-period-revision-approval-required`, inspect
the report path printed by the command. Under the `monthly-labor-actuals`
source, verify `coverage.start` and
`revisionAudit.actualsSnapshot.approval.sourceSha256` against the confirmed workbook and
the existing snapshot. Only when the same-period value changes are verified
and accepted, explicitly approve that exact period and workbook SHA-256 during
publish:

```sh
period="replace-with-YYYY-MM"
workbook_sha256="replace-with-64-lowercase-hex-characters"
pnpm data:refresh "--approve-actuals-revision=${period}@${workbook_sha256}"
```

The approval must match both values from the reviewed report and is only valid
for that publish. Do not combine it with `--check`; a new period does not need
same-period revision approval.

## Adding a required refresh source

When a new required source is added, first commit its stable bundled output
paths and the registry change. The refresh guard requires every managed output
to be tracked, clean, and identical to `HEAD` before semantic-state rebaseline.
Then pin the current state file hash and run check-only migration:

```sh
state_hash="$(sha256sum .data-refresh/semantic-state.json | cut -d ' ' -f1)"
pnpm data:refresh --check --rebaseline-semantic-state="$state_hash"
```

Review the resulting report. If it passes, publish using the same state hash:

```sh
pnpm data:refresh --rebaseline-semantic-state="$state_hash"
```

This explicitly adds new required source identities while preserving all
previously recorded sources and their output manifests. Removed, unknown, or
malformed prior source entries remain blocked.

## Monthly Labour Survey actual-value snapshot: coverage by item

Track the latest period independently for each actual series. In this snapshot,
all five items have a non-missing final observation for 2026-06, marked as a
confirmed result (`確報`). After each successful refresh, update each row from
the matching `series` in the CSV and confirm its period, unit, and revision
against the metadata mapping.

| Actual item                     | Series key             | Latest period                                           | Unit | Revision | Evidence                                                                                 |
| ------------------------------- | ---------------------- | ------------------------------------------------------- | ---- | -------- | ---------------------------------------------------------------------------------------- |
| 現金給与額/総額                 | `total_earning`        | 2026-06 (bundled); 2026-08 (latest confirmed available) | 円   | 確報     | `data/source/monthly_labor_statistics_actual_snapshot.csv`; `.metadata.json` (`mapping`) |
| 現金給与額/きまって支給する給与 | `contractual_earnings` | 2026-06 (bundled); 2026-08 (latest confirmed available) | 円   | 確報     | `data/source/monthly_labor_statistics_actual_snapshot.csv`; `.metadata.json` (`mapping`) |
| 現金給与額/所定内給与           | `scheduled_earnings`   | 2026-06 (bundled); 2026-08 (latest confirmed available) | 円   | 確報     | `data/source/monthly_labor_statistics_actual_snapshot.csv`; `.metadata.json` (`mapping`) |
| 実労働時間数/総数               | `total_worked_hours`   | 2026-06 (bundled); 2026-08 (latest confirmed available) | 時間 | 確報     | `data/source/monthly_labor_statistics_actual_snapshot.csv`; `.metadata.json` (`mapping`) |
| 常用労働者数/本調査期間末       | `employment_indices`   | 2026-06 (bundled); 2026-08 (latest confirmed available) | 人   | 確報     | `data/source/monthly_labor_statistics_actual_snapshot.csv`; `.metadata.json` (`mapping`) |
