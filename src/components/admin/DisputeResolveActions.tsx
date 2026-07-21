"use client";

import ConfirmAction from "@/components/admin/ConfirmAction";

/**
 * Emergency manual override — bypasses the real AI judge panel
 * (lib/disputes/judge-panel.ts), which is the default resolution path for
 * every dispute now. This stays as the fallback for whatever the panel
 * can't cleanly resolve (an escalated dispute with no clean 5-judge
 * majority is left in `voting` for exactly this), not the expected path.
 */
export default function DisputeResolveActions({ disputeId }: { disputeId: string }) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-amber-400">
        Emergency override — bypasses the AI judge panel
      </p>
      <div className="flex gap-2">
        <ConfirmAction
          label="Resolve: buyer wins"
          confirmLabel="resolve this dispute in the buyer's favor (refund), bypassing the AI judge panel"
          url={`/api/disputes/${disputeId}/resolve`}
          body={{ outcome: "favor_payer" }}
        />
        <ConfirmAction
          label="Resolve: seller wins"
          confirmLabel="resolve this dispute in the seller's favor (payout stands), bypassing the AI judge panel"
          url={`/api/disputes/${disputeId}/resolve`}
          body={{ outcome: "favor_payee" }}
        />
      </div>
    </div>
  );
}
