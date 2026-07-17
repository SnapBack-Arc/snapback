/**
 * One-shot setup for Phase 4's event-driven state: registers (or reuses) a
 * Circle notification subscription pointed at /api/webhooks/circle, imports
 * SnapBackEscrow + JudgeRegistry into Circle Contracts, and creates an event
 * monitor for every event this app reacts to (lib/webhooks/events.ts).
 *
 * Safe to re-run — every step checks for an existing match first (by
 * endpoint, by contract name+address, by contractAddress+eventSignature)
 * before creating anything, so running this again after a URL change (e.g.
 * a new ngrok session) just updates the subscription's endpoint in place.
 *
 * Usage:
 *   1. Start the app locally: npm run dev
 *   2. In another terminal: ngrok http 3000
 *   3. WEBHOOK_PUBLIC_URL=https://<your-ngrok-subdomain>.ngrok-free.app npm run webhooks:setup
 *
 * On Vercel, set WEBHOOK_PUBLIC_URL to the deployed URL instead and run this
 * once after each deploy that changes the domain (preview URLs rotate).
 *
 * Deliberately does NOT import src/lib/circle.ts or src/lib/escrow.ts: both
 * start with `import "server-only"`, which throws unconditionally outside
 * Next.js's own bundler (its no-op behavior only applies via a webpack/
 * Turbopack server-condition alias Next sets up internally — plain
 * Node/tsx just gets the real package's default export, which always
 * throws by design). This script re-declares the handful of constants and
 * client-init calls it needs instead of pulling in those modules.
 */
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { CIRCLE_ARC_BLOCKCHAIN } from "../src/lib/arc";
import {
  SNAPBACK_ESCROW_EVENT_SIGNATURES,
  JUDGE_REGISTRY_EVENT_SIGNATURES,
} from "../src/lib/webhooks/events";

const BLOCKCHAIN = CIRCLE_ARC_BLOCKCHAIN as "ARC-TESTNET";

const SNAPBACK_ESCROW =
  process.env.NEXT_PUBLIC_SNAPBACK_ESCROW ?? "0x73D35909D28b79a5F88DC5fDBA82EcBbe7C18Ee8";
const JUDGE_REGISTRY =
  process.env.NEXT_PUBLIC_JUDGE_REGISTRY ?? "0x740724012b7502D708e41c89D00AF7cDd63A20C9";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const walletsClient = initiateDeveloperControlledWalletsClient({
  apiKey: requireEnv("CIRCLE_API_KEY"),
  entitySecret: requireEnv("CIRCLE_ENTITY_SECRET"),
});
const contractsClient = initiateSmartContractPlatformClient({
  apiKey: requireEnv("CIRCLE_API_KEY"),
  entitySecret: requireEnv("CIRCLE_ENTITY_SECRET"),
});

async function ensureSubscription(endpoint: string): Promise<void> {
  const { data } = await walletsClient.listSubscriptions();
  // Subscriptions' TrimDataResponse unwraps straight to the array itself
  // (unlike list*Contracts/list*EventMonitors, whose wrapper has a named
  // inner field) — confirmed against the published SDK's .d.ts.
  const existing = data?.find((s) => s.endpoint === endpoint);
  if (existing) {
    console.log(`Subscription already registered for ${endpoint} (${existing.id})`);
    return;
  }

  // The installed SDK's CreateSubscriptionInput (v10.8.0) only accepts
  // `endpoint` — it hasn't caught up to the raw API's `notificationTypes`
  // filter field yet (confirmed against the published .d.ts), so this
  // subscription ends up unrestricted (every notification family, per
  // Circle's documented default). Not a problem in practice:
  // handleCircleNotification already no-ops on anything that isn't
  // `contracts.eventLog` or `transactions.*`.
  const created = await walletsClient.createSubscription({ endpoint });
  console.log(`Created subscription ${created.data?.id} -> ${endpoint}`);
}

async function ensureContractImported(
  name: string,
  address: string,
): Promise<void> {
  const { data } = await contractsClient.listContracts({ name, blockchain: BLOCKCHAIN });
  const existing = data?.contracts?.find(
    (c) => c.contractAddress?.toLowerCase() === address.toLowerCase(),
  );
  if (existing) {
    console.log(`${name} already imported (${existing.id})`);
    return;
  }

  const imported = await contractsClient.importContract({
    name,
    address,
    blockchain: BLOCKCHAIN,
  });
  console.log(`Imported ${name} -> ${imported.data?.contract.id}`);
}

async function ensureEventMonitors(address: string, signatures: readonly string[]): Promise<void> {
  const { data } = await contractsClient.listEventMonitors({
    contractAddress: address,
    blockchain: BLOCKCHAIN,
  });
  const existingSignatures = new Set(
    (data?.eventMonitors ?? []).map((m) => m.eventSignature),
  );

  for (const eventSignature of signatures) {
    if (existingSignatures.has(eventSignature)) {
      console.log(`  monitor already exists: ${eventSignature}`);
      continue;
    }
    const created = await contractsClient.createEventMonitor({
      blockchain: BLOCKCHAIN,
      contractAddress: address,
      eventSignature,
    });
    console.log(`  created monitor: ${eventSignature} -> ${created.data?.eventMonitor.id}`);
  }
}

async function main() {
  const endpoint = process.env.WEBHOOK_PUBLIC_URL;
  if (!endpoint) {
    throw new Error(
      "WEBHOOK_PUBLIC_URL is required — e.g. an ngrok HTTPS URL for local dev, or your Vercel deployment URL. See this file's header comment.",
    );
  }
  const webhookUrl = `${endpoint.replace(/\/$/, "")}/api/webhooks/circle`;

  console.log("1. Notification subscription");
  await ensureSubscription(webhookUrl);

  console.log("2. Import contracts");
  await ensureContractImported("SnapBackEscrow", SNAPBACK_ESCROW);
  await ensureContractImported("JudgeRegistry", JUDGE_REGISTRY);

  console.log("3. Event monitors — SnapBackEscrow");
  await ensureEventMonitors(SNAPBACK_ESCROW, SNAPBACK_ESCROW_EVENT_SIGNATURES);

  console.log("4. Event monitors — JudgeRegistry");
  await ensureEventMonitors(JUDGE_REGISTRY, JUDGE_REGISTRY_EVENT_SIGNATURES);

  console.log(`\nDone. Webhook receiver: ${webhookUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
