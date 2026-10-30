"use client";

export default function Error({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="container" role="alert" style={{ padding: "3rem 1rem", textAlign: "center" }}>
      <h1>データを表示できませんでした</h1>
      <p>読み込みに失敗しました。通信やデータソースを確認して、もう一度お試しください。</p>
      <button type="button" onClick={() => retry()}>
        再試行
      </button>
    </main>
  );
}
