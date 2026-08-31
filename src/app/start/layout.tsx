import type { Metadata } from "next";

export const metadata: Metadata = { title: "开始创作" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
