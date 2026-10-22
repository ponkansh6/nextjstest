import type { Metadata, Viewport } from "next";
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
  description:
    "2025年基準の消費者物価指数と、各系列の公表基準または比較用正規化契約に基づく賃金・消費動向を可視化。凡例から系列を切り替えられる日本の経済指標ダッシュボード。",
  title: "日本の経済指標ダッシュボード | 物価・賃金・消費の長期推移",
  metadataBase: new URL("https://example.com"),
  openGraph: {
    title: "日本の経済指標ダッシュボード | 物価・賃金・消費の長期推移",
    description:
      "2025年基準の消費者物価指数と、各系列の公表基準または比較用正規化契約に基づく賃金・消費動向を可視化。",
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "日本の経済指標ダッシュボード | 物価・賃金・消費の長期推移",
    description:
      "2025年基準の消費者物価指数と、各系列の公表基準または比較用正規化契約に基づく賃金・消費動向を可視化。",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var root=document.documentElement;try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){root.setAttribute("data-theme",t);}else{root.removeAttribute("data-theme");}}catch(e){root.removeAttribute("data-theme");}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
