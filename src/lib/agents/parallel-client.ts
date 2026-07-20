import "server-only";
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { Address } from "viem";
import { ensureParallelPayerWallet } from "@/lib/app-wallets";
import { createCircleEip712Signer } from "@/lib/agents/circle-x402-signer";

/**
 * Real, paid call to Parallel's x402-gated search endpoint
 * (https://parallelmpp.dev/api/search) — the one genuine external
 * marketplace payment behind the Research & Sourcing agent. Real USDC on
 * Base mainnet, real per-call cost ($0.01, confirmed live against
 * Parallel's own 402 response), paid non-interactively by the
 * `parallel_payer` admin wallet (see lib/app-wallets.ts) via Circle's
 * signTypedData API — no human approval step.
 *
 * Every failure mode throws ParallelPaymentError so the caller
 * (research-sourcing.ts) can fall back to Claude's own web_search alone —
 * that fallback is required behavior, not optional, per the standing rule
 * that a real marketplace outage must never block a task from completing.
 */

const PARALLEL_SEARCH_URL = "https://parallelmpp.dev/api/search";
const PARALLEL_NETWORK = "eip155:8453";

export class ParallelPaymentError extends Error {}

export type ParallelSearchResult = {
  /** Raw JSON body Parallel returned for the paid search. */
  result: unknown;
  txHash: string;
  amountUsdc: number;
  payerAddress: string;
  payeeAddress: string;
};

export async function payParallelSearch(query: string): Promise<ParallelSearchResult> {
  const wallet = await ensureParallelPayerWallet().catch((err: unknown) => {
    throw new ParallelPaymentError(
      `Could not resolve the Parallel payer wallet: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  const signer = createCircleEip712Signer({
    walletId: wallet.circle_wallet_id,
    address: wallet.address as Address,
  });
  const httpClient = new x402HTTPClient(
    new x402Client().register(PARALLEL_NETWORK, new ExactEvmScheme(signer)),
  );

  const requestBody = JSON.stringify({ query });
  const baseHeaders = { "Content-Type": "application/json" };

  const challenge = await fetch(PARALLEL_SEARCH_URL, {
    method: "POST",
    headers: baseHeaders,
    body: requestBody,
  }).catch((err: unknown) => {
    throw new ParallelPaymentError(
      `Network error reaching Parallel: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  if (challenge.status !== 402) {
    throw new ParallelPaymentError(
      `Expected Parallel to challenge with 402, got ${challenge.status} — no payment was made`,
    );
  }

  const challengeBody = await challenge.json().catch((err: unknown) => {
    throw new ParallelPaymentError(
      `Failed to parse Parallel's 402 response body: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  const paymentRequired = httpClient.getPaymentRequiredResponse(
    (name) => challenge.headers.get(name),
    challengeBody,
  );

  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired).catch((err: unknown) => {
    throw new ParallelPaymentError(
      `Failed to sign the payment authorization: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  const paidResponse = await fetch(PARALLEL_SEARCH_URL, {
    method: "POST",
    headers: { ...baseHeaders, ...paymentHeaders },
    body: requestBody,
  }).catch((err: unknown) => {
    throw new ParallelPaymentError(
      `Network error retrying Parallel with payment: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  if (!paidResponse.ok) {
    const text = await paidResponse.text().catch(() => "");
    throw new ParallelPaymentError(
      `Parallel rejected the paid request (${paidResponse.status}): ${text}`,
    );
  }

  const settlement = httpClient.getPaymentSettleResponse((name) => paidResponse.headers.get(name));
  if (!settlement.success || !settlement.transaction) {
    throw new ParallelPaymentError(
      `Parallel processed the request but settlement did not confirm: ${settlement.errorReason ?? "unknown"}`,
    );
  }

  const result = await paidResponse.json().catch((err: unknown) => {
    throw new ParallelPaymentError(
      `Payment settled but response body couldn't be parsed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  return {
    result,
    txHash: settlement.transaction,
    amountUsdc: Number(paymentPayload.accepted.amount) / 1_000_000,
    payerAddress: wallet.address,
    payeeAddress: paymentPayload.accepted.payTo,
  };
}
