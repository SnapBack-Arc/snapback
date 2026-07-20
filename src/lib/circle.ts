import "server-only";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { requireServerEnv } from "@/lib/env";

/**
 * Circle SDK clients. Server-only: all three read CIRCLE_API_KEY, and the
 * developer-controlled + contracts clients also need CIRCLE_ENTITY_SECRET.
 * These secrets must never reach the browser.
 *
 * - Developer-Controlled Wallets: we create/manage SCA wallets on Arc Testnet,
 *   and also expose the notification-subscription/public-key endpoints used
 *   by webhook verification (lib/webhooks/signature.ts) — those live on this
 *   client, not the Contracts one, despite being generic "notifications" API.
 * - User-Controlled Wallets: email-OTP login + user-owned wallet challenges.
 * - Smart Contract Platform ("Circle Contracts"): import/monitor our deployed
 *   contracts for event-driven state (lib/webhooks/*). Confirmed to support
 *   ARC-TESTNET (`Blockchain.ArcTestnet` in the published SDK types) since
 *   Circle's 2025-11-25 release note "Expanded Contracts support to include
 *   the Arc testnet."
 *
 * getLiveDeveloperControlledWalletsClient is a separate client authenticated
 * against CIRCLE_LIVE_API_KEY/CIRCLE_LIVE_ENTITY_SECRET (Circle's production
 * entity, not the TEST_API_KEY sandbox the rest of this app runs against).
 * Circle segregates sandbox and production wallets entirely, so this is the
 * only client that can see or sign for the `parallel_payer` wallet (real
 * Base mainnet, real USDC — see lib/app-wallets.ts).
 */

let devClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null =
  null;
let liveDevClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null =
  null;
let userClient: ReturnType<typeof initiateUserControlledWalletsClient> | null =
  null;
let contractsClient: ReturnType<typeof initiateSmartContractPlatformClient> | null =
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

export function getLiveDeveloperControlledWalletsClient() {
  if (!liveDevClient) {
    liveDevClient = initiateDeveloperControlledWalletsClient({
      apiKey: requireServerEnv("CIRCLE_LIVE_API_KEY"),
      entitySecret: requireServerEnv("CIRCLE_LIVE_ENTITY_SECRET"),
    });
  }
  return liveDevClient;
}

export function getUserControlledWalletsClient() {
  if (!userClient) {
    userClient = initiateUserControlledWalletsClient({
      apiKey: requireServerEnv("CIRCLE_API_KEY"),
    });
  }
  return userClient;
}

export function getSmartContractPlatformClient() {
  if (!contractsClient) {
    contractsClient = initiateSmartContractPlatformClient({
      apiKey: requireServerEnv("CIRCLE_API_KEY"),
      entitySecret: requireServerEnv("CIRCLE_ENTITY_SECRET"),
    });
  }
  return contractsClient;
}
