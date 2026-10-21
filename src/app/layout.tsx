import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { AppSidebar } from "@/components/app-sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cartoon",
  description: "Quy trình làm phim hoạt hình 2D cho YouTube",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
