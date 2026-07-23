import "server-only";
import { randomUUID } from "crypto";
import type { Hash } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { waitForTxHash, getTxState, isTerminalFailureState } from "@/lib/escrow";
import type { Json } from "@/lib/supabase/types";

/**
 * Real money-moving settlement legs during dispute resolution. Each one is a
 * Circle contract-execution call (an on-chain call or a USDC transfer) that
 * must never be blind-resubmitted after an ambiguous failure — see
 * runSettlementLeg's docblock.
 *
 * dispute_contingency_refund only covers the resolveDispute-triggered path
 * (a disputeId exists to key retry state on). The sweepUncontestedContingencies
 * path (a clean completion with no dispute ever filed) has no dispute row to
 * attach settlement_state to and stays on the old, non-retry-safe pattern —
 * see the README's Known limitations.
 */
export type SettlementLeg =
  | "onchain_resolve"
  | "filing_fee_refund"
  | "dispute_contingency_refund"
  | "insurance_payout";

type LegStatus = "pending" | "submitted" | "confirmed" | "failed";

type LegState = {
  idempotency_key: string;
  circle_tx_id: string | null;
  attempt: number;
  status: LegStatus;
};

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2000, 5000, 10000];

export class SettlementFailedError extends Error {
  constructor(
    public readonly leg: SettlementLeg,
    public readonly disputeId: string,
  ) {
    super(`Settlement leg "${leg}" failed for dispute ${disputeId} after ${MAX_ATTEMPTS} attempts`);
    this.name = "SettlementFailedError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freshLegState(): LegState {
  return { idempotency_key: randomUUID(), circle_tx_id: null, attempt: 0, status: "pending" };
}

async function readSettlementState(disputeId: string): Promise<Record<string, LegState>> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("disputes")
    .select("settlement_state")
    .eq("id", disputeId)
    .single();
  if (error || !data) throw new Error(`Dispute ${disputeId} not found while reading settlement_state`);
  return ((data.settlement_state as Record<string, LegState> | null) ?? {}) as Record<string, LegState>;
}

async function writeLegState(disputeId: string, leg: SettlementLeg, legState: LegState): Promise<void> {
  const supabase = createServiceSupabase();
  const current = await readSettlementState(disputeId);
  const merged = { ...current, [leg]: legState };
  const { error } = await supabase
    .from("disputes")
    .update({ settlement_state: merged as Json })
    .eq("id", disputeId);
  if (error) throw new Error(`Failed to persist settlement_state for dispute ${disputeId}, leg ${leg}: ${error.message}`);
}

/**
 * Runs a real money-moving Circle call (an on-chain contract execution or a
 * USDC transfer) with retry-safe idempotency. Persists a UUID idempotency
 * key BEFORE the first submit attempt and the returned Circle tx id BEFORE
 * waiting for confirmation, so a retry after ANY failure resumes rather than
 * blind-resubmits:
 *
 *   - No tx id persisted yet -> submit with the SAME idempotency key on every
 *     retry. Circle's own idempotency contract ("if the same key is reused,
 *     it will be treated as the same request and the original response will
 *     be returned") makes this safe even if a prior submit's response was
 *     lost after the transaction actually went through server-side.
 *   - A tx id is persisted -> wait for its confirmation. If that throws,
 *     check the transaction's real current state: a genuine terminal
 *     failure (reverted/denied/cancelled/stuck) means that tx id is dead —
 *     clear it and generate a fresh idempotency key for the next attempt.
 *     Anything else (a transient poll/network error, or no terminal state
 *     yet) means the underlying transaction may still be live — re-poll the
 *     SAME tx id on the next attempt, never resubmit.
 *
 * `submit(idempotencyKey)` must be the one function that actually calls
 * transferUsdc/resolveJobDispute, forwarding the given key through.
 *
 * Throws SettlementFailedError after MAX_ATTEMPTS with no definitive
 * outcome. Callers must treat that as "needs a human to check Circle/chain
 * state directly" — never retry further themselves, never assume any
 * particular outcome, and never write a `payments` row as if it settled.
 */
export async function runSettlementLeg(
  disputeId: string,
  leg: SettlementLeg,
  submit: (idempotencyKey: string) => Promise<string | undefined>,
): Promise<Hash> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existing = (await readSettlementState(disputeId))[leg];
    let state: LegState = existing ?? freshLegState();
    state = { ...state, attempt };
    await writeLegState(disputeId, leg, state);

    if (!state.circle_tx_id) {
      try {
        const txId = await submit(state.idempotency_key);
        if (!txId) throw new Error(`${leg} submit did not return a transaction id`);
        state = { ...state, circle_tx_id: txId, status: "submitted" };
        await writeLegState(disputeId, leg, state);
      } catch {
        if (attempt === MAX_ATTEMPTS) break;
        await sleep(BACKOFF_MS[attempt - 1]);
        continue;
      }
    }

    const circleTxId = state.circle_tx_id;
    if (!circleTxId) {
      // Unreachable in practice — the submit branch above always either sets
      // circle_tx_id or `continue`s away before falling through here. Guard
      // exists only to narrow the type for the calls below.
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(BACKOFF_MS[attempt - 1]);
      continue;
    }

    try {
      const txHash = await waitForTxHash(circleTxId);
      await writeLegState(disputeId, leg, { ...state, status: "confirmed" });
      return txHash;
    } catch {
      const txState = await getTxState(circleTxId).catch(() => undefined);
      if (isTerminalFailureState(txState)) {
        // Dead tx id -- abandon it, get a fresh idempotency key for the next attempt.
        await writeLegState(disputeId, leg, { ...freshLegState(), attempt });
      }
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(BACKOFF_MS[attempt - 1]);
    }
  }

  const finalState = (await readSettlementState(disputeId))[leg] ?? freshLegState();
  await writeLegState(disputeId, leg, { ...finalState, status: "failed" });
  throw new SettlementFailedError(leg, disputeId);
}
