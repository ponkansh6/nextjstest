import pageStyles from "../page.module.css";
import chartStyles from "./CpiChart.module.css";

export function DashboardChartLoading() {
  return (
    <div className={chartStyles.chartContainer} aria-hidden="true">
      <div className={`${chartStyles.sectionTabs} ${pageStyles.loadingTabs}`}>
        <span className={`${chartStyles.sectionRange} ${pageStyles.loadingTabItem}`} />
        <div className={chartStyles.sectionTabsScroll}>
          <span className={`${chartStyles.sectionTab} ${pageStyles.loadingTabItem}`} />
          <span className={`${chartStyles.sectionTab} ${pageStyles.loadingTabItem}`} />
          <span className={`${chartStyles.sectionTab} ${pageStyles.loadingTabItem}`} />
        </div>
      </div>
      <section className={chartStyles.chartSection}>
        <h2 className={chartStyles.chartTitle}>消費者物価指数（主要指数）</h2>
        <div className={chartStyles.legendContainer}>
          <div className={chartStyles.legendSection}>
            <div className={`${chartStyles.legendItems} ${pageStyles.loadingLegend}`}>
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
        <div className={`${chartStyles.chartWrapper} ${pageStyles.loadingChart}`} />
      </section>
    </div>
  );
}
