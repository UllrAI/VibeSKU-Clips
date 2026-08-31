import type { Metadata } from "next";

export const metadata: Metadata = { title: "主题成片" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
