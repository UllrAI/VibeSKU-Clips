import type { Metadata } from "next";

export const metadata: Metadata = { title: "导出" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
