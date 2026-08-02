import type { Metadata } from "next";
import Script from "next/script";
import { Inter, JetBrains_Mono } from "next/font/google";
import AuroraBackground from "@/components/aurora/AuroraBackgroundClient";
import { isDemoModeEnabled } from "@/lib/demo/config";
import "./globals.css";

const inter = Inter({ variable: "--font-app-sans", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-app-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SnapBack",
  description:
    "SnapBack insures agent-to-agent nanopayments — a real AI verdict on every paid answer, with an automatic, reliability-priced payout the moment it's flagged wrong. Built on Arc.",
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
        {/* Applies a saved theme preference before hydration, so there's no
            flash of the default (dark) theme on a light-mode visit. See
            components/ThemeToggle.tsx, which is what writes this key. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`}
        </Script>
        {/* A hard reload (F5, Ctrl+R) always signs the user out and sends
            them back to the info page — every session starts fresh. Uses the
            Navigation Timing API to tell a real reload apart from a normal
            link/redirect navigation, which the server has no way to see. */}
        <Script id="reload-guard" strategy="beforeInteractive">
          {`(function(){try{var nav=performance.getEntriesByType('navigation')[0];if(nav&&nav.type==='reload'){fetch('/api/auth/session',{method:'DELETE',keepalive:true}).catch(function(){});if(location.pathname!=='/home'){location.replace('/home');}}}catch(e){}})();`}
        </Script>
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
