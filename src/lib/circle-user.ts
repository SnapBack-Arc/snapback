import "server-only";
import { getUserControlledWalletsClient } from "@/lib/circle";

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
