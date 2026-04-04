import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <nav>
          <ul className={styles.navList}>
            <li><a href="#">ホーム</a></li>
            <li><a href="#">サービス</a></li>
            <li><a href="#">お問い合わせ</a></li>
          </ul>
        </nav>
      </header>
      
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.title}>Next.js サンプルホームページ</h1>
          <p className={styles.description}>
            これはNext.jsを使用して作成されたシンプルなホームページのサンプルです。
            App Router、TypeScript、そしてVanilla CSSを使用しています。
          </p>
          <div className={styles.ctas}>
            <a href="https://nextjs.org/docs" className={styles.primary}>
              ドキュメントを読む
            </a>
            <a href="#" className={styles.secondary}>
              詳細を見る
            </a>
          </div>
        </div>

        <section className={styles.features}>
          <div className={styles.card}>
            <h3>高速なパフォーマンス</h3>
            <p>Next.jsの最適化機能により、高速な読み込みを実現します。</p>
          </div>
          <div className={styles.card}>
            <h3>レスポンシブデザイン</h3>
            <p>モバイルからデスクトップまで、あらゆるデバイスに対応します。</p>
          </div>
          <div className={styles.card}>
            <h3>簡単な開発</h3>
            <p>直感的なルーティングと強力な開発ツールを提供します。</p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
      </footer>
    </div>
  );
}
