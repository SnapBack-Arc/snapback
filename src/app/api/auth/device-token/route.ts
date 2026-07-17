import { NextResponse } from "next/server";
import { startEmailLogin } from "@/lib/circle-user";

/**
 * POST /api/auth/device-token
 * Body: { email, deviceId }
 * Returns the Circle device token/encryption key/otp token for the web SDK to
 * complete email-OTP verification in the browser.
 */
export async function POST(request: Request) {
  try {
    const { email, deviceId } = await request.json();
    if (typeof email !== "string" || typeof deviceId !== "string") {
      return NextResponse.json(
        { error: "email and deviceId are required" },
        { status: 400 },
      );
    }
    const tokens = await startEmailLogin(deviceId, email.trim().toLowerCase());
    return NextResponse.json(tokens);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login start failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
