import styles from "./page.module.css";
import { DashboardChartLoading } from "./components/DashboardChartLoading";

export default function Loading() {
  return (
    <main className={`container ${styles.pageWrapper} ${styles.pageLoading}`} aria-busy="true">
      <span className={styles.loadingLabel} role="status">
        経済指標データを読み込み中です
      </span>
      <header className={styles.header}>
        <h1 className={styles.title}>物価・賃金・消費の推移</h1>
        <p className={styles.description}>
          経済指標データを読み込み中です。読み込み後に、物価・賃金・消費のグラフを表示します。
        </p>
      </header>
      <DashboardChartLoading />
    </main>
  );
}
