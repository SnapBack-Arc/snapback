import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import AuroraBackground from "./AuroraBackgroundClient";

// Scoped to /login only — deliberately not added to the root layout, which
// stays on Geist Sans/Mono for every other route.
const inter = Inter({ subsets: ["latin"], variable: "--font-login-sans" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-login-mono",
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${inter.variable} ${jetbrainsMono.variable} relative min-h-screen font-[family-name:var(--font-login-sans)] antialiased`}
    >
      <AuroraBackground />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
