import "server-only";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { x402Client } from "@x402/core/client";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, x402HTTPClient } from "@x402/core/http";
import { registerBatchScheme } from "@circle-fin/x402-batching/client";
import type { Address } from "viem";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { createCircleEip712Signer } from "@/lib/agents/circle-x402-signer";
import { demoVerificationFeeUsdc } from "@/lib/agents/verify";
import { ensureGatewayPayerWallet, ensureTreasuryWallet } from "@/lib/app-wallets";
import { ARC_GATEWAY_WALLET, ARC_USDC_ADDRESS } from "@/lib/arc";

export const DEMO_VERIFY_NETWORK = "eip155:5042002" as const;
export const DEMO_VERIFY_GATEWAY_URL = "https://gateway-api-testnet.circle.com";

export const demoVerificationFacilitator = new BatchFacilitatorClient({
  url: DEMO_VERIFY_GATEWAY_URL,
});

/**
 * App-funded verification payment (demo).
 *
 * The Gateway x402 buyer must be an EOA the app controls. The logged-in user's
 * wallet stays an SCA, but this backend-funded payer signs the payment on the
 * server using the same Circle EIP-712 pattern as parallel-client.ts.
 */
export async function createDemoVerificationPaymentRequirements() {
  const treasury = await ensureTreasuryWallet();
  const feeUsdc = demoVerificationFeeUsdc();
  const amount = Math.round(feeUsdc * 1_000_000).toString();

  return {
    x402Version: 2,
    scheme: "exact",
    network: DEMO_VERIFY_NETWORK,
    asset: ARC_USDC_ADDRESS,
    amount,
    payTo: treasury.address as Address,
    maxTimeoutSeconds: 604900,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_GATEWAY_WALLET,
    },
  } as const;
}

export async function createDemoVerificationPaymentRequired() {
  const acceptedRequirements = await createDemoVerificationPaymentRequirements();

  return {
    x402Version: 2,
    resource: {
      url: "https://snapback.app/api/demo/verify",
      description: "SnapBack demo verification payment",
      mimeType: "application/json",
    },
    accepts: [acceptedRequirements],
    extensions: undefined,
  } as const;
}

export async function createDemoVerificationPaymentSignature() {
  const gatewayPayer = await ensureGatewayPayerWallet();
  const signer = createCircleEip712Signer({
    walletId: gatewayPayer.circle_wallet_id,
    address: gatewayPayer.address as Address,
    client: getDeveloperControlledWalletsClient(),
  });
  const paymentRequired = await createDemoVerificationPaymentRequired();
  const client = new x402Client();
  registerBatchScheme(client, { signer, networks: [DEMO_VERIFY_NETWORK] });
  const httpClient = new x402HTTPClient(client);
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired as any);
  const paymentSignatureHeader = httpClient.encodePaymentSignatureHeader(paymentPayload);

  return {
    paymentRequired,
    paymentPayload,
    paymentSignatureHeader,
  };
}

export async function getDemoVerificationPaymentRequiredHeader() {
  const paymentRequired = await createDemoVerificationPaymentRequired();
  return {
    paymentRequirements: paymentRequired,
    paymentRequiredHeader: encodePaymentRequiredHeader(paymentRequired as any),
  };
}

export async function settleDemoVerificationPayment(paymentSignatureHeader: string | null) {
  if (!paymentSignatureHeader) return null;

  const paymentPayload = decodePaymentSignatureHeader(paymentSignatureHeader) as any;
  const acceptedRequirements = paymentPayload.accepted ?? (await createDemoVerificationPaymentRequirements());

  return demoVerificationFacilitator.settle(paymentPayload as any, acceptedRequirements as any);
}
