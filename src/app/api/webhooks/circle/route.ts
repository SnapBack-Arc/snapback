import { NextResponse } from "next/server";
import { verifyCircleWebhookSignature } from "@/lib/webhooks/signature";
import { handleCircleNotification } from "@/lib/webhooks/handle-notification";

/**
 * POST /api/webhooks/circle
 *
 * Single receiver for both notification families this app subscribes to
 * (see scripts/circle-webhooks-setup.ts): `contracts.eventLog` (SnapBackEscrow
 * + JudgeRegistry event monitors) and `transactions.*` (wallet tx status).
 * One endpoint, not two — Circle notification subscriptions are per-endpoint,
 * not per-event-family, and the envelope's `notificationType` field is
 * exactly what's needed to route.
 *
 * Circle's delivery is at-least-once with 2xx-required acking; a non-2xx
 * response triggers Circle's own retry policy, which is intentional here —
 * see handleCircleNotification's error handling.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("x-circle-signature");
  const keyId = request.headers.get("x-circle-key-id");
  if (!signature || !keyId) {
    return NextResponse.json({ error: "Missing signature or keyId in headers" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Verified over the re-serialized parsed body, matching Circle's own
  // reference implementation (circlefin/arc-escrow) — see
  // lib/webhooks/signature.ts's docblock for why this is safe.
  const bodyString = JSON.stringify(body);
  const verified = await verifyCircleWebhookSignature(bodyString, keyId, signature);
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const envelope = body as {
    subscriptionId?: string;
    notificationId?: string;
    notificationType?: string;
    notification?: Record<string, unknown>;
    timestamp?: string;
    version?: number;
  };
  if (!envelope.notificationId || !envelope.notificationType || !envelope.notification) {
    return NextResponse.json({ error: "malformed notification envelope" }, { status: 400 });
  }

  try {
    await handleCircleNotification({
      subscriptionId: envelope.subscriptionId,
      notificationId: envelope.notificationId,
      notificationType: envelope.notificationType,
      notification: envelope.notification,
      timestamp: envelope.timestamp,
      version: envelope.version,
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to process notification: ${message}` }, { status: 500 });
  }
}

/** Circle's endpoint-registration flow checks reachability with a HEAD request first. */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
