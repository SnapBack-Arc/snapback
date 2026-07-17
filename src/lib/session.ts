import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireServerEnv } from "@/lib/env";

/**
 * Minimal signed-cookie session. The operational wallet is Circle-custodied, so
 * a session only needs to bind a browser to a Supabase user row. The cookie
 * payload is HMAC-SHA256 signed with SESSION_SECRET; it is NOT encrypted, so we
 * only store non-sensitive identifiers (our user id + email).
 */

const COOKIE_NAME = "snapback_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type Session = { uid: string; email: string; iat: number };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", requireServerEnv("SESSION_SECRET"))
    .update(payload)
    .digest("base64url");
}

function serialize(session: Session): string {
  const payload = b64url(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

function verify(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // Constant-time compare; lengths must match first.
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Session;
    if (!session.uid || !session.email) return null;
    if (Date.now() / 1000 - session.iat > MAX_AGE_SECONDS) return null;
    return session;
  } catch {
    return null;
  }
}

/** Create a session cookie for the given user. */
export async function createSession(uid: string, email: string): Promise<void> {
  const session: Session = { uid, email, iat: Math.floor(Date.now() / 1000) };
  const store = await cookies();
  store.set(COOKIE_NAME, serialize(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Read + verify the current session, or null if unauthenticated. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verify(store.get(COOKIE_NAME)?.value);
}

/** Clear the session cookie (logout). */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
