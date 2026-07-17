"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polling fallback for the task detail stepper. The actual push comes from
 * the Circle webhook receiver (lib/webhooks/handle-notification.ts)
 * updating job_events/payments server-side as on-chain events confirm —
 * this just re-fetches the server component periodically so that update
 * becomes visible without the user manually reloading the page. Stays
 * armed only while `active` (the task isn't in a settled/terminal stage),
 * and is the only mechanism at all if a webhook delivery is delayed or
 * missed, per the Phase 4 design ("polling fallback stays").
 */
export default function TaskLiveUpdates({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
