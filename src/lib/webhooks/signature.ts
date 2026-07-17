import "server-only";
import crypto from "crypto";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";

/**
 * Verifies the `X-Circle-Signature` on an inbound webhook POST.
 *
 * Every Circle webhook is signed with an asymmetric key identified by the
 * `X-Circle-Key-Id` header; `client.getNotificationSignature(keyId)` (the
 * SDK wrapper for `GET /v2/notifications/publicKey/{keyId}`, confirmed
 * against the published `@circle-fin/developer-controlled-wallets` types —
 * this lives on the wallets client, not the Contracts one, despite also
 * covering `contracts.eventLog` notifications) returns the base64 public key
 * and its algorithm (`ECDSA_SHA_256`). Keys are immutable per keyId, so
 * caching them for the life of the server process is safe.
 *
 * Verifies over `JSON.stringify(JSON.parse(rawBody))`, not the raw bytes —
 * matching Circle's own reference implementation
 * (circlefin/arc-escrow: app/api/webhooks/circle/route.ts), which
 * round-trips through `req.json()` before verifying. This only works because
 * V8 preserves string-key insertion order through parse/stringify, which
 * matches Circle's original byte order in practice.
 */

const keyCache = new Map<string, { algorithm: string; publicKeyPem: string }>();

function toPem(base64PublicKey: string): string {
  const lines = base64PublicKey.match(/.{1,64}/g) ?? [base64PublicKey];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
}

async function getPublicKey(keyId: string): Promise<{ algorithm: string; publicKeyPem: string }> {
  const cached = keyCache.get(keyId);
  if (cached) return cached;

  const client = getDeveloperControlledWalletsClient();
  const res = await client.getNotificationSignature(keyId);
  const algorithm = res.data?.algorithm;
  const publicKey = res.data?.publicKey;
  if (!algorithm || !publicKey) {
    throw new Error(`Circle did not return a public key for keyId ${keyId}`);
  }

  const entry = { algorithm, publicKeyPem: toPem(publicKey) };
  keyCache.set(keyId, entry);
  return entry;
}

export async function verifyCircleWebhookSignature(
  rawBody: string,
  keyId: string,
  signatureBase64: string,
): Promise<boolean> {
  let publicKeyPem: string;
  try {
    ({ publicKeyPem } = await getPublicKey(keyId));
  } catch {
    // Unknown/rotated/malformed keyId, or the lookup call itself failed —
    // an inbound request naming a keyId Circle doesn't recognize is exactly
    // as untrusted as a bad signature. Fail verification, don't 500 the route.
    return false;
  }

  // ECDSA_SHA_256 is the only algorithm Circle documents for webhook
  // signing today; Node's createVerify("SHA256") picks the correct
  // signature scheme (ECDSA vs RSA) from the key type itself.
  const verifier = crypto.createVerify("SHA256");
  verifier.update(rawBody);
  verifier.end();

  try {
    return verifier.verify(publicKeyPem, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}
