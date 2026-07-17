import "server-only";
import { getUserControlledWalletsClient } from "@/lib/circle";

/**
 * Start the Circle email-OTP login: mint a device token bound to the browser's
 * deviceId. The browser web SDK completes OTP verification with these values.
 */
export async function startEmailLogin(deviceId: string, email: string) {
  const client = getUserControlledWalletsClient();
  const res = await client.createDeviceTokenForEmailLogin({ deviceId, email });
  const data = res.data;
  if (!data?.deviceToken || !data?.deviceEncryptionKey) {
    throw new Error("Circle did not return a device token");
  }
  return {
    deviceToken: data.deviceToken,
    deviceEncryptionKey: data.deviceEncryptionKey,
    otpToken: data.otpToken,
  };
}

/**
 * Resolve the Circle userId from a userToken produced by the web SDK login.
 * Doubles as validation that the userToken is genuine/current.
 */
export async function resolveCircleUserId(
  userToken: string,
): Promise<string | null> {
  const client = getUserControlledWalletsClient();
  try {
    const res = await client.getUserStatus({ userToken });
    // Response data carries the end-user id.
    const data = res.data as { id?: string; userId?: string } | undefined;
    return data?.id ?? data?.userId ?? null;
  } catch {
    return null;
  }
}
