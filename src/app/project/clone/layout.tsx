import type { Metadata } from "next";

export const metadata: Metadata = { title: "爆款复刻" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
