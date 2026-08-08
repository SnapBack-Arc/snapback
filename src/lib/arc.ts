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

/** ERC-20 USDC interface over the native balance. 6 decimals. */
export const ARC_USDC_ADDRESS = (process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000") as Address;

/**
 * EURC on Arc Testnet, 6 decimals. Confirmed against Circle/Arc's own
 * official contract-addresses docs (docs.arc.io/arc/references/contract-addresses).
 */
export const ARC_EURC_ADDRESS = (process.env.NEXT_PUBLIC_ARC_EURC_ADDRESS ??
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as Address;

/**
 * cirBTC (Circle Wrapped Bitcoin) on Arc Testnet, 8 decimals — NOT 6 like
 * every other token on this page. Not published in Arc's official
 * contract-addresses docs as of this writing, so verified independently
 * two ways against a real wallet holding real faucet-claimed cirBTC: (1)
 * Blockscout's own indexed token-balances API for that address reported
 * this exact address with symbol "cirBTC" / name "Circle Wrapped Bitcoin",
 * and (2) a direct eth_call to balanceOf on this address returned the
 * identical raw balance Blockscout reported, with eth_getCode confirming
 * real deployed proxy-contract bytecode at this address.
 */
export const ARC_CIRBTC_ADDRESS = (process.env.NEXT_PUBLIC_ARC_CIRBTC_ADDRESS ??
  "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF") as Address;

/** Circle Gateway contracts on Arc Testnet (CCTP-style domain 26). */
export const ARC_GATEWAY_WALLET = (process.env.NEXT_PUBLIC_ARC_GATEWAY_WALLET ??
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9") as Address;

/** Decimals for the native gas token (USDC-as-gas). */
export const ARC_NATIVE_DECIMALS = 18;

/** Decimals for the ERC-20 USDC interface. */
export const USDC_DECIMALS = 6;

/** Decimals for the ERC-20 EURC interface — same 6dp as USDC. */
export const EURC_DECIMALS = 6;

/** Decimals for cirBTC — 8dp, the Bitcoin convention, unlike the 6dp stablecoins above. */
export const CIRBTC_DECIMALS = 8;

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
