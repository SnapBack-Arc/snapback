"use client";

import dynamic from "next/dynamic";

// Purely decorative and randomized — rendered client-only so the server
// HTML has no orb positions to mismatch against the client's first paint.
const AuroraBackground = dynamic(
  () => import("./AuroraBackground").then((m) => m.AuroraBackground),
  { ssr: false },
);

export default AuroraBackground;
