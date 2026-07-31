import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import AuroraBackground from "@/components/aurora/AuroraBackgroundClient";
import { isDemoModeEnabled } from "@/lib/demo/config";
import "./globals.css";

const inter = Inter({ variable: "--font-app-sans", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-app-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SnapBack",
  description:
    "SnapBack is a dispute-resolution and escrow safety layer for agent-to-agent USDC payments, with an AI judge panel that settles disagreements autonomously — built on Arc.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AuroraBackground />
        <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
        {isDemoModeEnabled() && (
          // Demo-only navigation convenience to /admin — not a new access
          // path. requireAdmin()/requireAdminApi()'s wallet allowlist check
          // still fully applies once there; this is purely a shortcut past
          // typing the URL, same DEMO_MODE gating as the login dropdown.
          <a
            href="/admin"
            aria-label="Admin"
            title=""
            className="fixed bottom-3 right-3 z-50 select-none rounded-full px-1.5 py-1 font-mono text-[10px] text-zinc-600 opacity-40 transition hover:text-zinc-300 hover:opacity-100"
          >
            SB
          </a>
        )}
      </body>
    </html>
  );
}
