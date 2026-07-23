import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { isDemoModeEnabled } from "@/lib/demo/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SnapBack",
  description: "Agentic-economy escrow & payments on Arc Testnet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {isDemoModeEnabled() && (
          // Demo-only navigation convenience to /admin — not a new access
          // path. requireAdmin()/requireAdminApi()'s wallet allowlist check
          // still fully applies once there; this is purely a shortcut past
          // typing the URL, same DEMO_MODE gating as the login dropdown.
          <a
            href="/admin"
            aria-label="Admin"
            title=""
            className="fixed bottom-3 right-3 z-50 select-none rounded-full px-1.5 py-1 font-mono text-[10px] text-zinc-800 opacity-40 transition hover:text-zinc-500 hover:opacity-100"
          >
            SB
          </a>
        )}
      </body>
    </html>
  );
}
