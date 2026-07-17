import { defineChain, type Address } from "viem";

/**
 * Arc Testnet network configuration.
 *
 * IMPORTANT decimals note:
 *   - Native gas token = USDC with **18 decimals** (chain.nativeCurrency).
 *   - The ERC-20 USDC interface at ARC_USDC_ADDRESS reports **6 decimals**.
 * These are two different views of value on Arc. Never format a native-gas
 * balance with 6 decimals or an ERC-20 USDC balance with 18 — always use the
 * matching decimal constant below.
 */

export const ARC_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? "5042002",
);

export const ARC_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network";

export const ARC_EXPLORER_URL =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app";

export const ARC_FAUCET_URL =
  process.env.NEXT_PUBLIC_ARC_FAUCET_URL ?? "https://faucet.circle.com";

/** ERC-20 USDC interface over the native balance. 6 decimals. */
export const ARC_USDC_ADDRESS = (process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000") as Address;

/** Circle Gateway contracts on Arc Testnet (CCTP-style domain 26). */
export const ARC_GATEWAY_WALLET = (process.env.NEXT_PUBLIC_ARC_GATEWAY_WALLET ??
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9") as Address;

export const ARC_GATEWAY_MINTER = (process.env.NEXT_PUBLIC_ARC_GATEWAY_MINTER ??
  "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B") as Address;

export const ARC_GATEWAY_DOMAIN = Number(
  process.env.NEXT_PUBLIC_ARC_GATEWAY_DOMAIN ?? "26",
);

/** Decimals for the native gas token (USDC-as-gas). */
export const ARC_NATIVE_DECIMALS = 18;

/** Decimals for the ERC-20 USDC interface. */
export const USDC_DECIMALS = 6;

/** Circle wallet blockchain identifier for Arc Testnet. */
export const CIRCLE_ARC_BLOCKCHAIN = "ARC-TESTNET" as const;

/**
 * viem chain object for Arc Testnet. Native currency is USDC at 18 decimals —
 * this is the gas balance, distinct from the 6-decimal ERC-20 USDC interface.
 */
export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: ARC_NATIVE_DECIMALS,
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: ARC_EXPLORER_URL },
  },
  testnet: true,
});

/** Build a block-explorer link for a transaction hash. */
export function explorerTxUrl(hash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${hash}`;
}

/** Build a block-explorer link for an address. */
export function explorerAddressUrl(address: string): string {
  return `${ARC_EXPLORER_URL}/address/${address}`;
}

/** Minimal ERC-20 ABI covering balance/decimals/allowance/approve/transfer. */
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
