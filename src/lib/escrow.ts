import "server-only";
import { parseUnits, parseEventLogs, type Address, type Hash } from "viem";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { publicClient } from "@/lib/viem";
import { ARC_USDC_ADDRESS, USDC_DECIMALS } from "@/lib/arc";

/**
 * Task escrow — standalone SnapBackEscrow, not an ERC-8183/AgenticCommerce
 * hook anymore.
 *
 * ARCHITECTURE CHANGE: every real createJob call against AgenticCommerce
 * (hook = SnapBackEscrow) reverted with HookNotWhitelisted() — verified
 * on-chain that AgenticCommerce's ADMIN_ROLE is held by a third-party
 * address (also its platformTreasury()), not anything we control, and no
 * self-service whitelisting path exists in the Arc docs. SnapBackEscrow is
 * now a standalone contract that holds USDC directly: buyer and seller
 * wallets call it (createJob/setBudget/fund/submit/release/dispute)
 * directly, with no external job-settlement contract in the loop. See
 * contracts/src/SnapBackEscrow.sol for the full contract-level story.
 *
 * Every `*CircleWalletId` param below is Circle's own wallet id
 * (`wallets.circle_wallet_id`) — NOT this app's internal `wallets.id`
 * primary key. Passing the internal id 404s against Circle's API.
 */

const FEE = { type: "level" as const, config: { feeLevel: "MEDIUM" as const } };

export const SNAPBACK_ESCROW = (process.env.NEXT_PUBLIC_SNAPBACK_ESCROW ??
  "0x73D35909D28b79a5F88DC5fDBA82EcBbe7C18Ee8") as Address;

/** JudgeRegistry — SnapBackEscrow's arbiter. Used by lib/webhooks/* to attribute decoded events. */
export const JUDGE_REGISTRY = (process.env.NEXT_PUBLIC_JUDGE_REGISTRY ??
  "0x740724012b7502D708e41c89D00AF7cDd63A20C9") as Address;

const SIG = {
  createJob: "createJob(address,uint64,string)",
  setBudget: "setBudget(uint256,uint256)",
  approve: "approve(address,uint256)",
  fund: "fund(uint256)",
  submit: "submit(uint256,bytes32)",
  resolveDispute: "resolveDispute(uint256,bool,bytes32)",
  transfer: "transfer(address,uint256)",
} as const;

/**
 * JobCreated event — transcribed directly from contracts/src/SnapBackEscrow.sol,
 * not guessed, since decoding a job-creation receipt against the wrong
 * signature could silently misattribute a jobId used in every subsequent
 * fund/submit/release call.
 */
const JOB_CREATED_EVENT = {
  type: "event",
  name: "JobCreated",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "client", type: "address", indexed: true },
    { name: "provider", type: "address", indexed: true },
    { name: "expiredAt", type: "uint64", indexed: false },
    { name: "description", type: "string", indexed: false },
  ],
} as const;

/**
 * Waits for a Circle-submitted transaction to confirm and returns its on-chain
 * hash. SCA wallets (this app's default account type) only populate `txHash`
 * once the transaction reaches CONFIRMED, so this is also a confirmation wait.
 */
export async function waitForTxHash(circleTxId: string): Promise<Hash> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.getTransaction({ id: circleTxId, waitForTxHash: true });
  return res.data.transaction.txHash as Hash;
}

/**
 * Recovers the on-chain jobId from a `createJob` transaction's receipt.
 * SnapBackEscrow.createJob assigns jobs a sequential counter and only
 * exposes the new id via the `JobCreated` event — there is no return-value
 * path through a Circle contract-execution transaction.
 */
export async function getJobIdFromTxHash(txHash: Hash): Promise<string> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const logs = receipt.logs.filter(
    (log) => log.address.toLowerCase() === SNAPBACK_ESCROW.toLowerCase(),
  );
  const [event] = parseEventLogs({
    abi: [JOB_CREATED_EVENT],
    logs,
  });
  if (!event) {
    throw new Error("JobCreated event not found in createJob transaction receipt");
  }
  return event.args.jobId.toString();
}

/**
 * Buyer commissions a job directly on SnapBackEscrow. No funds move yet.
 * @returns the Circle transaction id — call waitForTxHash + getJobIdFromTxHash
 * to recover the on-chain jobId once it confirms.
 */
export async function createEscrowJob(params: {
  buyerCircleWalletId: string;
  sellerAddress: Address;
  expiredAt: number; // unix seconds
  description: string;
}): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: params.buyerCircleWalletId,
    contractAddress: SNAPBACK_ESCROW,
    abiFunctionSignature: SIG.createJob,
    abiParameters: [params.sellerAddress, String(params.expiredAt), params.description],
    fee: FEE,
  });
  return res.data?.id;
}

/**
 * Set the job budget before funding.
 * @dev setBudget is gated to job.provider on-chain — MUST be called with the
 *      seller's wallet, not the buyer's.
 */
export async function setJobBudget(
  sellerCircleWalletId: string,
  jobId: string,
  amountUsdc: string,
): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: sellerCircleWalletId,
    contractAddress: SNAPBACK_ESCROW,
    abiFunctionSignature: SIG.setBudget,
    abiParameters: [jobId, parseUnits(amountUsdc, USDC_DECIMALS).toString()],
    fee: FEE,
  });
  return res.data?.id;
}

/**
 * THE LOCK: approve USDC to SnapBackEscrow, then fund the job.
 * After this, the budget is escrowed in this contract itself — the seller
 * cannot be paid directly.
 *
 * @dev MUST wait for approve to actually confirm on-chain before submitting
 *      fund. A prior version of this function assumed same-wallet
 *      sequential Circle transactions were "nonce-ordered" and skipped the
 *      wait — true for on-chain *mining* order, but Circle estimates gas
 *      for fund at *submission* time, before approve has been mined, so it
 *      simulates against a stale zero allowance and rejects the fund
 *      transaction outright (INSUFFICIENT_TOKEN: transfer amount exceeds
 *      allowance) — verified by hitting this for real once the standalone
 *      contract made it possible to reach this step at all.
 */
export async function lockFunds(
  buyerCircleWalletId: string,
  jobId: string,
  amountUsdc: string,
): Promise<{ approveId?: string; fundId?: string }> {
  const client = getDeveloperControlledWalletsClient();
  const base = parseUnits(amountUsdc, USDC_DECIMALS).toString();

  const approve = await client.createContractExecutionTransaction({
    walletId: buyerCircleWalletId,
    contractAddress: ARC_USDC_ADDRESS,
    abiFunctionSignature: SIG.approve,
    abiParameters: [SNAPBACK_ESCROW, base],
    fee: FEE,
  });
  if (approve.data?.id) {
    await waitForTxHash(approve.data.id);
  }

  const fund = await client.createContractExecutionTransaction({
    walletId: buyerCircleWalletId,
    contractAddress: SNAPBACK_ESCROW,
    abiFunctionSignature: SIG.fund,
    abiParameters: [jobId],
    fee: FEE,
  });

  return { approveId: approve.data?.id, fundId: fund.data?.id };
}

/**
 * Job.status enum, transcribed from SnapBackEscrow.sol — used to check
 * on-chain state before deciding whether `submit` needs to be called (see
 * `getJobStatus` below).
 */
export const JOB_STATUS = {
  Open: 0,
  Funded: 1,
  Submitted: 2,
  Completed: 3,
  Rejected: 4,
} as const;

const GET_JOB_ABI = [
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "client", type: "address" },
          { name: "provider", type: "address" },
          { name: "budget", type: "uint256" },
          { name: "expiredAt", type: "uint64" },
          { name: "submittedAt", type: "uint64" },
          { name: "acceptDeadline", type: "uint64" },
          { name: "status", type: "uint8" },
          { name: "disputed", type: "bool" },
        ],
      },
    ],
  },
] as const;

/**
 * Reads a job's on-chain status directly (a view call — no wallet/gas
 * needed). This is the ground truth `submitDeliverable`'s caller checks
 * before calling `submit`: calling it a second time (e.g. an admin
 * "revalidate" re-run) would revert with NotFunded once the job is already
 * past Status.Funded, since `submit` requires exactly that status.
 */
export async function getJobStatus(jobId: string): Promise<number> {
  const job = await publicClient.readContract({
    address: SNAPBACK_ESCROW,
    abi: GET_JOB_ABI,
    functionName: "getJob",
    args: [BigInt(jobId)],
  });
  return job.status;
}

/** Seller submits a deliverable hash — starts the snapback accept window. */
export async function submitDeliverable(
  sellerCircleWalletId: string,
  jobId: string,
  deliverableHash: string,
): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: sellerCircleWalletId,
    contractAddress: SNAPBACK_ESCROW,
    abiFunctionSignature: SIG.submit,
    abiParameters: [jobId, deliverableHash],
    fee: FEE,
  });
  return res.data?.id;
}

/**
 * Buyer-agent calls: approve+release now, or open a dispute freezing
 * auto-release. Both are gated `onlyClient` on-chain, so `circleWalletId`
 * must be the buyer's own wallet — matches how the app already signs these
 * (the buyer agent acting on the buyer's behalf), not a separate
 * "evaluator" role.
 *
 * `release` replaces what used to be a broken call to `autoRelease` on
 * validator approval: autoRelease unconditionally requires the accept
 * window to have already elapsed (it's the keeper/timeout path), so calling
 * it immediately after a fresh submission — which is exactly when the
 * validator runs — would always have reverted. `release` is the actual
 * "buyer approved early" path; see SnapBackEscrow.sol's docblock.
 *
 * `fn` deliberately excludes `snapback(uint256,bytes32)`: the contract lets
 * the client refund itself instantly, with no dispute filing, no fee, and no
 * judge review (see SnapBackEscrow.sol's `snapback`). Do not widen this union
 * to include it — that would reopen a free/uncosted buyer-reject path. A
 * buyer rejection belongs on the `dispute` path above, which is fee-costed
 * and judge-reviewed.
 */
export async function escrowAction(
  circleWalletId: string,
  fn: "release(uint256,bytes32)" | "dispute(uint256,bytes32)",
  args: string[],
): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: circleWalletId,
    contractAddress: SNAPBACK_ESCROW,
    abiFunctionSignature: fn,
    abiParameters: args,
    fee: FEE,
  });
  return res.data?.id;
}

/**
 * Arbiter settles a disputed job on-chain — the priority-fix counterpart to
 * `escrowAction`'s buyer-gated calls. `resolveDispute` is `onlyArbiter`
 * (SnapBackEscrow.sol), and `arbiter` is now the app's Circle-managed
 * `arbiter` app_wallet (see lib/app-wallets.ts's ensureArbiterWallet and
 * contracts/script/SetArbiterToAppWallet.s.sol — arbiter used to be
 * JudgeRegistry, which nothing calls, so every force-resolve previously
 * only updated the off-chain `disputes` row while the on-chain job stayed
 * frozen forever).
 */
export async function resolveJobDispute(
  arbiterCircleWalletId: string,
  jobId: string,
  favorBuyer: boolean,
  reason: string,
): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: arbiterCircleWalletId,
    contractAddress: SNAPBACK_ESCROW,
    abiFunctionSignature: SIG.resolveDispute,
    abiParameters: [jobId, favorBuyer, reason],
    fee: FEE,
  });
  return res.data?.id;
}

/**
 * Priority fix (Phase 4): a plain ERC-20 transfer, direct wallet-to-wallet,
 * with no escrow contract in the loop at all. Used to actually collect the
 * happy-path/validation fees and the dispute contingency at task-funding
 * time (buyer -> Treasury), and to actually refund the contingency later
 * (Treasury -> buyer) — both real on-chain transfers where previously these
 * amounts only ever existed as `payments` rows with no matching transfer.
 */
export async function transferUsdc(
  fromCircleWalletId: string,
  toAddress: Address,
  amountUsdc: string,
): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: fromCircleWalletId,
    contractAddress: ARC_USDC_ADDRESS,
    abiFunctionSignature: SIG.transfer,
    abiParameters: [toAddress, parseUnits(amountUsdc, USDC_DECIMALS).toString()],
    fee: FEE,
  });
  return res.data?.id;
}

/**
 * Permissionless keeper call once the accept window lapses — nothing in the
 * app currently schedules this (no cron/keeper route exists yet, same as
 * before this rewrite), but the contract supports it and any wallet can
 * call it, matching the original "keeper autoRelease" guarantee.
 */
export async function triggerAutoRelease(
  callerCircleWalletId: string,
  jobId: string,
): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: callerCircleWalletId,
    contractAddress: SNAPBACK_ESCROW,
    abiFunctionSignature: "autoRelease(uint256)",
    abiParameters: [jobId],
    fee: FEE,
  });
  return res.data?.id;
}
