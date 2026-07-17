"use client";

import ConfirmAction from "@/components/admin/ConfirmAction";

/**
 * The admin "force-resolve a stuck dispute" action — no real judge-draw
 * pipeline exists yet (see docblock on /api/disputes/[id]/resolve), so this
 * is the actual resolution path for a real dispute today, not just a demo
 * convenience.
 */
export default function DisputeResolveActions({ disputeId }: { disputeId: string }) {
  return (
    <div className="flex shrink-0 gap-2">
      <ConfirmAction
        label="Resolve: buyer wins"
        confirmLabel="resolve this dispute in the buyer's favor (refund)"
        url={`/api/disputes/${disputeId}/resolve`}
        body={{ outcome: "favor_payer" }}
      />
      <ConfirmAction
        label="Resolve: seller wins"
        confirmLabel="resolve this dispute in the seller's favor (payout stands)"
        url={`/api/disputes/${disputeId}/resolve`}
        body={{ outcome: "favor_payee" }}
      />
    </div>
  );
}
