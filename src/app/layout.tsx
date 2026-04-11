import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/topbar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Shopify SEO",
  description: "Self-hosted SEO toolkit for Shopify.",
};

// The TopBar reads from the database, so the layout must run per-request
// instead of being prerendered at build time (when there's no DB).
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <div className="flex">
          <Sidebar />
          <div className="flex-1 min-w-0 flex flex-col min-h-screen">
            <TopBar />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
