import "server-only";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { requireServerEnv } from "@/lib/env";

/**
 * Circle SDK clients. Server-only: both read CIRCLE_API_KEY and the
 * developer-controlled client also needs CIRCLE_ENTITY_SECRET. These secrets
 * must never reach the browser.
 *
 * - Developer-Controlled Wallets: we create/manage SCA wallets on Arc Testnet.
 * - User-Controlled Wallets: email-OTP login + user-owned wallet challenges.
 */

let devClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null =
  null;
let userClient: ReturnType<typeof initiateUserControlledWalletsClient> | null =
  null;

export function getDeveloperControlledWalletsClient() {
  if (!devClient) {
    devClient = initiateDeveloperControlledWalletsClient({
      apiKey: requireServerEnv("CIRCLE_API_KEY"),
      entitySecret: requireServerEnv("CIRCLE_ENTITY_SECRET"),
    });
  }
  return devClient;
}

export function getUserControlledWalletsClient() {
  if (!userClient) {
    userClient = initiateUserControlledWalletsClient({
      apiKey: requireServerEnv("CIRCLE_API_KEY"),
    });
  }
  return userClient;
}
