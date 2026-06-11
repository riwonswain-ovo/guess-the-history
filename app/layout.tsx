import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "猜历史人物",
  description: "多人实时问答游戏"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
