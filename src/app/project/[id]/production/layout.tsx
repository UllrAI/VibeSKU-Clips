import type { Metadata } from "next";

export const metadata: Metadata = { title: "生产控制台" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
