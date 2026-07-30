"use client";

import dynamic from "next/dynamic";

// Purely decorative and randomized — rendered client-only so the server
// HTML has no orb positions to mismatch against the client's first paint.
// Shared by every route that wants the aurora background (/login and /);
// import this default export directly rather than copying AuroraBackground.
const AuroraBackground = dynamic(
  () => import("./AuroraBackground").then((m) => m.AuroraBackground),
  { ssr: false },
);

export default AuroraBackground;
