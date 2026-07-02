# Specification: Economic Indicators Dashboard (nextjstest)

## Purpose

A dashboard application to visualize and track Japanese economic indicators — CPI (Consumer Price Index), CTI (Business Cycle Index), wage statistics, and population trends — with a unified 2020-base scale for long-term comparison.

## Data Model

### CpiData (src/types/data.ts)

The shared data type with an index signature `[key: string]: string | number` for extensibility. Below are the explicitly defined fields; additional fields are added at runtime by each data loader.

| Field                                | Type                | Description                                                  |
| ------------------------------------ | ------------------- | ------------------------------------------------------------ |
| 年月                                 | string              | Year-month (e.g. "2020年1月")                                |
| 総合                                 | number              | CPI / earnings total index (2020=100)                        |
| 生鮮食品を除く総合                   | number              | CPI excluding Fresh Food                                     |
| 持家の帰属家賃を除く総合             | number              | CPI excluding Imputed Rent                                   |
| 消費支出（参考）                     | number              | Consumption expenditure (12MA, indexed, 2020=100)            |
| CPI総合(参考)                        | number              | CPI All Items (reference)                                    |

**Major runtime-added fields per data loader:**

| Loader                  | Example fields                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------- |
| CPI (`loadCpiData`)     | 生鮮食品及びエネルギーを除く総合, 食料（酒類を除く）及びエネルギーを除く総合, 外食以外食料, 交通・自動車等関係費, 寄与度カテゴリ (住居, 家具・家事用品, 教育, …) |
| CTI (`loadCtiData`)     | 消費支出（名目/実質）, 食料/住居/光熱・水道/…（名目/実質）, その他の消費支出（名目/実質）, 民間最終消費支出（名目/実質） |
| 賃金 (`loadTotalEarningData`) | 所定内給与, 所定外給与, 特別給与, 時間当たり給与, 15歳以上国民当たり給与, 残差, *(12MA) 系列 |

### PopulationData (src/types/index.ts)

| Field | Type   | Description      |
| ----- | ------ | ---------------- |
| total | number | Total population |
| index | number | Indexed value    |
| ma    | number | Moving average   |

### Data Sources

Static CSV files served from `public/`:

- `public/cpi_data.csv` — CPI time-series
- `public/cti_data.csv` — Business Cycle Index
- `public/total_earning.csv` — Total earnings
- `public/contractual_earnings.csv` — Contractual earnings
- `public/scheduled_earnings.csv` — Scheduled earnings
- `public/total_worked_hours.csv` — Total worked hours
- `public/population_statistics.csv` — Population statistics
- `public/employment_indices.csv` — Employment indices
- `public/contribution.csv` — CPI contribution breakdown
- `public/cti_support_nominal.csv` / `public/cti_support_real.csv` — CTI supporting series

## Requirements

### R1: Dashboard Page (SSR)

The system SHALL render the main dashboard as a server-rendered page at `/`.

#### Scenario R1a: View Dashboard

- **WHEN** user visits `/`
- **THEN** the server loads CPI, CTI, and earnings data from CSV files
- **AND** renders the dashboard with charts and indicators

#### Scenario R1b: Data Loading Error

- **WHEN** CSV data fails to load or is empty
- **THEN** the system displays a descriptive error message with file path guidance

### R2: Chart Visualization

The system SHALL display economic indicators as interactive Recharts-based charts with 2020-base normalization.

#### Scenario R2a: CPI Chart

- **WHEN** the dashboard renders
- **THEN** a CPI multi-series line chart is displayed showing "総合", "生鮮食品を除く総合", "持家の帰属家賃を除く総合", and reference series

#### Scenario R2b: CTI / Earnings / Breakdown Charts

- **WHEN** data is available
- **THEN** the following charts are rendered:
  - CtiChart / MajorIndicesChart (CTI indicators)
  - EarningsBreakdownChart (wage breakdown)
  - StackedAreaChart / ResidualAreaChart / SpendingBarChart (additional breakdowns)
  - NewGraph (supplementary view)

### R3: Data Transformation (Server-Side)

The system SHALL load and process CSV data on the server before rendering.

#### Scenario R3a: CPI Data Loading

- **WHEN** `loadCpiData()` is called
- **THEN** it reads `public/cpi_data.csv`, parses with PapaParse, transforms columns, and returns `CpiData[]`

#### Scenario R3b: CTI / Earnings Data Loading

- **WHEN** `loadCtiData()` / `loadTotalEarningData()` is called
- **THEN** corresponding CSV files are read and processed through `server/lib/dataLoader.ts`

#### Scenario R3c: Data Processing

- **WHEN** raw data is loaded
- **THEN** `dataProcessor.ts` applies server-side calculations (indexing, moving averages, smoothing)
- **AND** `serverCalculations.ts` performs derived computations

### R4: Interactive Legend

The system SHALL allow users to toggle chart series visibility.

#### Scenario R4a: Toggle Series

- **WHEN** user clicks a legend item
- **THEN** the corresponding series is hidden/shown on the chart
- **AND** other series re-scale to fill the chart area

#### Scenario R4b: Legend State Persistence

- **WHEN** legend state changes
- **THEN** the state is managed via `useLegendState` hook (Redux-backed)

### R5: Chart Filters

The system SHALL provide date range and indicator filters.

#### Scenario R5a: Apply Filter

- **WHEN** user adjusts a filter control
- **THEN** the visible date range or indicator set updates accordingly

### R6: Chart Information

The system SHALL provide explanatory info for each chart/metric.

#### Scenario R6a: View Chart Info

- **WHEN** user clicks the info button on a chart
- **THEN** a tooltip/modal displays the definition, source, and calculation method for the indicator

### R7: API Routes

The system SHALL expose data through REST API endpoints for client-side fetching.

#### Scenario R7a: CPI API

- **WHEN** `GET /api/cpi` is called
- **THEN** processed CPI data is returned as JSON

#### Scenario R7b: CTI API

- **WHEN** `GET /api/cti` is called
- **THEN** processed CTI data is returned as JSON

#### Scenario R7c: Earnings API

- **WHEN** `GET /api/earnings` is called
- **THEN** processed earnings data is returned as JSON

### R8: Responsive Layout

The system SHALL adapt to viewport size for mobile and desktop.

#### Scenario R8a: Responsive Charts

- **WHEN** viewport width changes
- **THEN** charts resize to fit available space without overflow or clipping

### R9: Accessibility

The system SHALL be navigable and interpretable by assistive technologies.

#### Scenario R9a: Chart Labels

- **WHEN** a screen reader encounters a chart
- **THEN** the chart has accessible labels, ARIA descriptions, and keyboard-navigable legend

## Architecture

### Component Tree (src/app/components/)

```
Page (RSC)
├── header (badge, title, description)
└── CpiChart (client component)
    ├── ChartFilters — Date range / indicator filters
    ├── [Chart variants]
    │   ├── MajorIndicesChart
    │   ├── EarningsBreakdownChart
    │   ├── StackedAreaChart
    │   ├── ResidualAreaChart
    │   └── SpendingBarChart
    ├── ChartLegend — Interactive series toggles
    ├── ChartInfoButton → ChartInfoContentRenderer — Indicator explanations
    └── NewGraph — Supplementary visualization
```

### Data Flow

```
public/*.csv
  → server/lib/dataLoader.ts (read + parse)
    → server/lib/dataProcessor.ts (transform + clean)
      → server/lib/serverCalculations.ts (derive)
        → src/app/page.tsx (RSC: load + pass props)
          → src/app/components/CpiChart.tsx ("use client": render + interact)
```

### State Management

- Legend toggle state: Redux Toolkit (via `useLegendState` hook)
- Chart data: React props from server component (no client-side re-fetch on initial load)
- API routes available for dynamic client-side queries

## Non-Goals

- Real-time data updates (data is loaded from static CSVs)
- User authentication or personalization
- Database backend (data lives in CSV files processed by ETL scripts)
- Export/download of chart images
- Multi-language support

## Test Requirements

- Unit tests for data loading and transformation (`tests/unit/`)
- Component tests for chart rendering and interaction (`tests/components/`)
- Integration tests for data mapping and computation accuracy (`tests/data-mapping/`, `tests/computation-contract/`)
- Constant/fixture tests for expected data quality (`tests/constants/`, `tests/fixtures/`)
- Performance checkpoint tests (`tests/perf-checkpoint.test.ts`)
