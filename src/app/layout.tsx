import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  description: "CPI（消費者物価指数）・現金給与総額・消費支出の2020年基準指数を一画面で比較。費目別寄与度・年率上昇率・給与と物価の乖離を可視化。凡例クリックで系列の表示/非表示を切替可能。",
  title: "日本の経済指標ダッシュボード | CPI・賃金・消費支出の長期推移",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
