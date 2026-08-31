import type { Metadata, Viewport } from "next";
// self-hosted Geist via the official npm package (same --font-geist-* variables) — a build-time fetch
// from Google Fonts is a network dependency that intermittently breaks CI release builds
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { LocaleInitializer } from "@/components/locale-initializer";
import { AppShell } from "@/components/app-shell";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://xixihhhh.github.io/clipforge/",
  ),
  // Title/description are bilingual (Chinese first): prioritize domestic traffic while covering overseas search indexing
  title: {
    default: "ClipForge — AI 短视频带货创作工具 | AI Short Video Creator",
    template: "%s · ClipForge",
  },
  description:
    "一句话主题或一张商品图，一键产出抖音 / 快手 / 小红书 / TikTok 竖屏带货短视频：AI 写脚本、自动配画面、免费配音、烧字幕。Turn one sentence or a product photo into a vertical short video — AI script, free stock footage, voiceover & subtitles in one click.",
  keywords: [
    "AI 短视频",
    "带货短视频",
    "AI 视频生成",
    "抖音",
    "快手",
    "小红书",
    "TikTok",
    "text to video",
    "faceless video",
    "AI video generator",
  ],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0c" },
  ],
};

const themeScript = `
  try {
    const saved = localStorage.getItem("clipforge_theme");
    const theme = saved === "light" || saved === "dark"
      ? saved
      : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LocaleInitializer />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
