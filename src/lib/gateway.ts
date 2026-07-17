import { formatUnits, type Address } from "viem";
import { publicClient } from "@/lib/viem";
import {
  ARC_GATEWAY_WALLET,
  ARC_USDC_ADDRESS,
  USDC_DECIMALS,
} from "@/lib/arc";

/**
 * Circle Gateway (GatewayWallet) minimal interface.
 *
 * Deposit is done via Circle's contract-execution API (see the deposit route),
 * so here we only need the read side. `availableBalance(token, account)` returns
 * the depositor's usable Gateway balance. The Gateway contract ABI is not vendored
 * in this repo, so the read is best-effort: if the signature differs on-chain the
 * call reverts and we surface null rather than crashing the dashboard.
 */
export const gatewayAbi = [
  {
    type: "function",
    name: "availableBalance",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Function signatures used by the deposit flow (Circle contract-execution API). */
export const GATEWAY_DEPOSIT_SIGNATURE = "deposit(address,uint256)";
export const ERC20_APPROVE_SIGNATURE = "approve(address,uint256)";
/**
 * Authorize an EOA delegate to sign BurnIntents for the caller's deposited USDC.
 * addDelegate(token, delegate) — Gateway rejects smart-contract signatures, so
 * SCA depositors must delegate signing to an EOA.
 */
export const GATEWAY_ADD_DELEGATE_SIGNATURE = "addDelegate(address,address)";

/**
 * Read the depositor's available USDC balance held in the Gateway (6 decimals).
 * Returns null if the contract read is unavailable so the UI can show "—".
 */
export async function getGatewayBalance(
  account: Address,
): Promise<{ raw: bigint; formatted: string } | null> {
  try {
    const raw = (await publicClient.readContract({
      address: ARC_GATEWAY_WALLET,
      abi: gatewayAbi,
      functionName: "availableBalance",
      args: [ARC_USDC_ADDRESS, account],
    })) as bigint;
    return { raw, formatted: formatUnits(raw, USDC_DECIMALS) };
  } catch {
    return null;
  }
}
