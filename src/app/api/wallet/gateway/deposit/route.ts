import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { ensureDelegateWallet } from "@/lib/app-wallets";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  ARC_USDC_ADDRESS,
  ARC_GATEWAY_WALLET,
  USDC_DECIMALS,
  ARC_CHAIN_ID,
} from "@/lib/arc";
import {
  GATEWAY_DEPOSIT_SIGNATURE,
  ERC20_APPROVE_SIGNATURE,
  GATEWAY_ADD_DELEGATE_SIGNATURE,
} from "@/lib/gateway";

const FEE = { type: "level" as const, config: { feeLevel: "MEDIUM" as const } };
const POLL_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 2500;
const CONFIRMED_STATES = new Set(["CONFIRMED", "COMPLETE"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /api/wallet/gateway/deposit
 * Body: { amount }  (human USDC, e.g. "5.0")
 *
 * Two Circle contract-execution transactions: approve USDC to the GatewayWallet,
 * wait for it to confirm, then call deposit. Both are recorded in `payments`.
 * NOTE: needs a funded testnet wallet to exercise end-to-end.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let amount: string;
  try {
    ({ amount } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const parsed = Number(amount);
  if (!amount || Number.isNaN(parsed) || parsed <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  const client = getDeveloperControlledWalletsClient();
  const supabase = createServiceSupabase();
  const amountBase = parseUnits(amount, USDC_DECIMALS).toString();

  const recordPayment = (circleTxId: string | undefined, note: string) =>
    supabase.from("payments").insert({
      from_wallet_id: wallet.id,
      kind: "deposit",
      status: "pending",
      amount_usdc: parsed,
      circle_tx_id: circleTxId ?? null,
      chain_id: ARC_CHAIN_ID,
      metadata: { step: note, gateway: ARC_GATEWAY_WALLET },
    });

  try {
    // 1) approve(GatewayWallet, amount) on the USDC contract
    const approve = await client.createContractExecutionTransaction({
      walletId: wallet.circle_wallet_id,
      contractAddress: ARC_USDC_ADDRESS,
      abiFunctionSignature: ERC20_APPROVE_SIGNATURE,
      abiParameters: [ARC_GATEWAY_WALLET, amountBase],
      fee: FEE,
    });
    const approveId = approve.data?.id;
    await recordPayment(approveId, "approve");

    // 2) wait for approve to confirm before depositing
    let approveConfirmed = false;
    for (let i = 0; i < POLL_ATTEMPTS && approveId; i++) {
      await sleep(POLL_INTERVAL_MS);
      const tx = await client.getTransaction({ id: approveId });
      const state = tx.data?.transaction?.state;
      if (state && CONFIRMED_STATES.has(state)) {
        approveConfirmed = true;
        break;
      }
      if (state === "FAILED") {
        return NextResponse.json(
          { error: "approve transaction failed", approveId },
          { status: 502 },
        );
      }
    }

    if (!approveConfirmed) {
      return NextResponse.json(
        {
          status: "approve_pending",
          approveId,
          message:
            "Approve submitted but not yet confirmed. Retry deposit once it confirms.",
        },
        { status: 202 },
      );
    }

    // 3) deposit(USDC, amount) on the GatewayWallet
    const deposit = await client.createContractExecutionTransaction({
      walletId: wallet.circle_wallet_id,
      contractAddress: ARC_GATEWAY_WALLET,
      abiFunctionSignature: GATEWAY_DEPOSIT_SIGNATURE,
      abiParameters: [ARC_USDC_ADDRESS, amountBase],
      fee: FEE,
    });
    const depositId = deposit.data?.id;
    await recordPayment(depositId, "deposit");

    // 4) authorize the shared EOA delegate to sign BurnIntents for this SCA's
    //    deposited USDC (Gateway rejects smart-contract signatures). Idempotent
    //    across deposits; best-effort so a delegate hiccup doesn't fail the deposit.
    let delegateId: string | undefined;
    try {
      const delegate = await ensureDelegateWallet();
      const del = await client.createContractExecutionTransaction({
        walletId: wallet.circle_wallet_id,
        contractAddress: ARC_GATEWAY_WALLET,
        abiFunctionSignature: GATEWAY_ADD_DELEGATE_SIGNATURE,
        abiParameters: [ARC_USDC_ADDRESS, delegate.address],
        fee: FEE,
      });
      delegateId = del.data?.id;
    } catch {
      // Non-fatal: delegate can be (re)authorized later.
    }

    return NextResponse.json({
      status: "submitted",
      approveId,
      depositId,
      delegateId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Deposit failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
