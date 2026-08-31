import type { Metadata } from "next";

export const metadata: Metadata = { title: "视频合成" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
