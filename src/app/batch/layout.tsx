import type { Metadata } from "next";

export const metadata: Metadata = { title: "批量生产" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
