import "server-only";
import { parseUnits, parseEventLogs, type Address, type Hash } from "viem";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { publicClient } from "@/lib/viem";
import { ARC_USDC_ADDRESS, USDC_DECIMALS } from "@/lib/arc";

/**
 * Task escrow on ERC-8183.
 *
 * SnapBackEscrow is an ERC-8183 *hook* — it holds no funds. The "lock" is
 * `AgenticCommerce.fund(jobId)` on a job created with `hook = SnapBackEscrow`,
 * so USDC lands in the audited ERC-8183 escrow rather than on the seller. It
 * only leaves on validator auto-approve (`complete`) or judge settlement
 * (`resolveDispute`), which is exactly the snapback guarantee.
 *
 * Every `*CircleWalletId` param below is Circle's own wallet id
 * (`wallets.circle_wallet_id`) — NOT this app's internal `wallets.id` primary
 * key. Passing the internal id 404s against Circle's API. Every function here
 * used to take a bare `walletId` and nothing that called them ever passed the
 * right one (confirmed against the real deployed contracts — see
 * setJobBudget below); the param names are explicit now to make that mistake
 * harder to repeat.
 */

const FEE = { type: "level" as const, config: { feeLevel: "MEDIUM" as const } };

export const AGENTIC_COMMERCE = (process.env.NEXT_PUBLIC_ARC_AGENTIC_COMMERCE ??
  "0x0747EEf0706327138c69792bF28Cd525089e4583") as Address;

export const SNAPBACK_ESCROW = (process.env.NEXT_PUBLIC_SNAPBACK_ESCROW ??
  "0x1f0c71FEBb5082e61785e17d7Be38Dfd23Eee9Cf") as Address;

const SIG = {
  createJob: "createJob(address,address,uint256,string,address)",
  setBudget: "setBudget(uint256,uint256,bytes)",
  approve: "approve(address,uint256)",
  fund: "fund(uint256,bytes)",
  submit: "submit(uint256,bytes32,bytes)",
} as const;

/**
 * JobCreated event, transcribed from AgenticCommerce's verified implementation
 * source (`cast source --chain arc-testnet <impl address>` against the live
 * ERC-1967 proxy) — not guessed, since decoding a job-creation receipt against
 * the wrong signature could silently misattribute a jobId used in every
 * subsequent fund/submit/release call.
 */
const JOB_CREATED_EVENT = {
  type: "event",
  name: "JobCreated",
  inputs: [
    { name: "jobId", type: "uint256", indexed: true },
    { name: "client", type: "address", indexed: true },
    { name: "provider", type: "address", indexed: true },
    { name: "evaluator", type: "address", indexed: false },
    { name: "expiredAt", type: "uint256", indexed: false },
    { name: "hook", type: "address", indexed: false },
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
 * `AgenticCommerce.createJob` assigns jobs a sequential counter and only
 * exposes the new id via the `JobCreated` event — there is no return-value
 * path through a Circle contract-execution transaction.
 */
export async function getJobIdFromTxHash(txHash: Hash): Promise<string> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const logs = receipt.logs.filter(
    (log) => log.address.toLowerCase() === AGENTIC_COMMERCE.toLowerCase(),
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
 * Create an ERC-8183 job wired to the SnapBackEscrow hook.
 * @returns the Circle transaction id — call waitForTxHash + getJobIdFromTxHash
 * to recover the on-chain jobId once it confirms.
 */
export async function createEscrowJob(params: {
  buyerCircleWalletId: string;
  sellerAddress: Address;
  evaluatorAddress: Address;
  expiredAt: number; // unix seconds
  description: string;
}): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: params.buyerCircleWalletId,
    contractAddress: AGENTIC_COMMERCE,
    abiFunctionSignature: SIG.createJob,
    abiParameters: [
      params.sellerAddress,
      params.evaluatorAddress,
      String(params.expiredAt),
      params.description,
      SNAPBACK_ESCROW, // ← the hook: snapback semantics attach here
    ],
    fee: FEE,
  });
  return res.data?.id;
}

/**
 * Set the job budget before funding.
 *
 * @dev Per the deployed AgenticCommerce.setBudget: `msg.sender != job.provider`
 *      reverts Unauthorized — this MUST be called with the seller's wallet,
 *      not the buyer's (verified against the live contract's source; this
 *      param used to be misnamed `buyerWalletId` and would have reverted if
 *      ever actually invoked — nothing called it before now).
 */
export async function setJobBudget(
  sellerCircleWalletId: string,
  jobId: string,
  amountUsdc: string,
): Promise<string | undefined> {
  const client = getDeveloperControlledWalletsClient();
  const res = await client.createContractExecutionTransaction({
    walletId: sellerCircleWalletId,
    contractAddress: AGENTIC_COMMERCE,
    abiFunctionSignature: SIG.setBudget,
    abiParameters: [jobId, parseUnits(amountUsdc, USDC_DECIMALS).toString(), "0x"],
    fee: FEE,
  });
  return res.data?.id;
}

/**
 * THE LOCK: approve USDC to AgenticCommerce, then fund the job.
 * After this, the budget is escrowed — the seller cannot be paid directly.
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
    abiParameters: [AGENTIC_COMMERCE, base],
    fee: FEE,
  });

  const fund = await client.createContractExecutionTransaction({
    walletId: buyerCircleWalletId,
    contractAddress: AGENTIC_COMMERCE,
    abiFunctionSignature: SIG.fund,
    abiParameters: [jobId, "0x"],
    fee: FEE,
  });

  return { approveId: approve.data?.id, fundId: fund.data?.id };
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
    contractAddress: AGENTIC_COMMERCE,
    abiFunctionSignature: SIG.submit,
    abiParameters: [jobId, deliverableHash, "0x"],
    fee: FEE,
  });
  return res.data?.id;
}

/** Hook-side calls: auto-approve (release) or open a dispute. */
export async function escrowAction(
  circleWalletId: string,
  fn: "autoRelease(uint256)" | "dispute(uint256,bytes32)",
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
