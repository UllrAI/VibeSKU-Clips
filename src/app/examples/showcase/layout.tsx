import type { Metadata } from "next";

export const metadata: Metadata = { title: "成片示例" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
