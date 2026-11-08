import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { Providers } from "@/components/providers";
import { getMode } from "@/lib/mode-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cartoon",
  description: "Quy trình làm phim hoạt hình 2D cho YouTube",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const mode = await getMode();
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <Providers>
          <div className="flex min-h-screen">
            <AppSidebar mode={mode} />
            <main className="min-w-0 flex-1 p-4 md:p-6">
              <AppTopbar mode={mode} />
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
