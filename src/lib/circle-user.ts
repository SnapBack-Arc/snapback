import "server-only";
import { getUserControlledWalletsClient } from "@/lib/circle";
import { CIRCLE_ARC_BLOCKCHAIN } from "@/lib/arc";

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
  } catch (err) {
    console.error("[diag] resolveCircleUserId error:", JSON.stringify(err, Object.getOwnPropertyNames(err || {})));
    return null;
  }
}

/**
 * PIN-only signup fallback: skips email-OTP entirely. Creates a brand-new
 * Circle end user under a server-generated userId, mints its userToken
 * directly (no OTP challenge involved), and starts the PIN-setup challenge.
 * The client completes the challenge with sdk.execute() using the returned
 * userToken/encryptionKey via sdk.updateConfigs({ authentication: ... }).
 *
 * Signup-only: createUserToken(userId) isn't gated by proof of email
 * ownership the way OTP is, so this must never be used for returning-user
 * login — only for a userId the caller just created and has not exposed to
 * the client.
 */
export async function createPinOnlyUser(userId: string) {
  const client = getUserControlledWalletsClient();
  await client.createUser({ userId });

  const tokenRes = await client.createUserToken({ userId });
  const { userToken, encryptionKey } = tokenRes.data ?? {};
  if (!userToken || !encryptionKey) {
    throw new Error("Circle did not return a user token");
  }

  const pin = await client.createUserPinWithWallets({
    userToken,
    blockchains: [CIRCLE_ARC_BLOCKCHAIN],
    accountType: "SCA",
  });
  const challengeId = pin.data?.challengeId;
  if (!challengeId) {
    throw new Error("Circle did not return a PIN-setup challenge");
  }

  return { userToken, encryptionKey, challengeId };
}
