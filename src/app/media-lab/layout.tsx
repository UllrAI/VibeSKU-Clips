import type { Metadata } from "next";

export const metadata: Metadata = { title: "媒体解构" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
