# nextjstest/

## Responsibility

Economic indicators dashboard application that visualizes Japan's CPI (Consumer Price Index), CTI (Cash Flow Index), and total earnings data. The application provides comprehensive analysis of price trends, wage growth, and consumption patterns with interactive charts and filtering capabilities.

## Design

**Architecture Pattern**: Client-Server Data Loading with Next.js App Router

- Server-side data loading via API routes (`/app/api/`) for initial data fetching
- Client-side React components for interactive visualization
- TypeScript-first development with strict typing

**Key Design Patterns**:

- **Data Flow**: Server → Cache → Client (SSR/SSG with incremental static regeneration)
- **Component Composition**: High-level container components with specialized subcomponents
- **State Management**: Local React state with custom hooks (`useChartTheme`, `useCpiChartData`)
- **Chart Library Integration**: Recharts for data visualization with custom tooltips and theming

**Abstractions**:

- `chartUtils.ts`: Data transformation and calculation utilities
- `chartConstants.ts`: Chart configuration and display mappings
- `chartInfoContent.ts`: Documentation and metadata for chart sources
- `useChartTheme`: Responsive theming system

**Architectural Decisions**:

- Server-side data loading for performance and SEO
- Client-side caching with 1-hour revalidation
- Modular chart components for maintainability
- Mobile-responsive design with adaptive theming

## Flow

**Data Flow**:

1. **Server Layer** (`server/lib/dataLoader.ts`):
   - Loads CSV data from `public/` directory
   - Caches data with 1-hour revalidation
   - Provides `loadCpiData()`, `loadCtiData()`, `loadTotalEarningData()` functions

2. **API Routes** (`app/api/`):
   - `earnings/route.ts`: Returns total earnings data
   - `cpi/route.ts`: Returns CPI data
   - `cti/route.ts`: Returns CTI data
   - Server-side data fetching with caching

3. **Client Layer** (`src/app/page.tsx`):
   - Fetches all three data sets concurrently
   - Passes data to `CpiChart` component
   - Handles loading and error states

4. **Chart Processing** (`src/lib/chartUtils.ts`):
   - `calculateSupportScale`: Scales support series data to 2020 baseline
   - `mergeChartData`: Merges wage and CPI data by year-month
   - `replaceWithAnnualAverage`: Replaces monthly data with annual averages
   - `filterDataByYear`: Filters data by year range

5. **Visualization Components**:
   - `CpiChart`: Main container orchestrating all chart types
   - `StackedAreaChart`: Area chart for CPI category contributions
   - `SpendingBarChart`: Bar charts for nominal/real consumption data
   - `MajorIndicesChart`: Line charts for main CPI indices

**Control Flow**:

- User interactions (legend clicks, year range selection) update React state
- State changes trigger data filtering and recalculations
- Chart components re-render with filtered data
- Custom hooks handle complex state synchronization

## Integration

**External Integrations**:

- **Data Sources**: e-Stat API CSV files (`public/cpi_data.csv`, etc.)
- **Chart Library**: Recharts v3.8.1 for data visualization
- **Styling**: CSS modules with Tailwind CSS utility classes
- **Fonts**: Google Fonts (Geist, Geist Mono)

**Internal Integrations**:

- **API Routes**: Server components integrate with Next.js routing
- **Component Dependencies**: Deep component hierarchy with shared utilities
- **Custom Hooks**: Reusable logic across multiple components
- **Type System**: Shared TypeScript types across the application

**Integration Points**:

- **Storage**: LocalStorage for chart preferences and user settings
- **Responsive Design**: Adapts to mobile/desktop viewports
- **Accessibility**: ARIA labels and keyboard navigation support
- **Performance**: Code splitting, caching, and optimized re-renders

**Dependencies**:

- React 19.2.7 with Server Components
- Next.js 16.2.7 with Turbopack
- Redux Toolkit for potential state management
- Arquero for data processing
- PapaParse for CSV parsing
