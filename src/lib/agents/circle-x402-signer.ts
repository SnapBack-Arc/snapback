import "server-only";
import { getLiveDeveloperControlledWalletsClient } from "@/lib/circle";
import type { Address, Hex } from "viem";

/**
 * Bridges Circle's Developer-Controlled Wallets `signTypedData` API into the
 * generic `{ address, signTypedData }` signer shape `@x402/evm`'s
 * `ExactEvmScheme` expects (see @x402/evm/exact/client's `ClientEvmSigner`).
 *
 * Circle's wallet never hands out a raw private key — `signTypedData` signs
 * whatever EIP-712 payload it's given, using the wallet's key held in
 * Circle's own infra, authenticated by API key + entity secret (the SDK
 * auto-injects `entitySecretCiphertext` on every call — same non-interactive
 * model this app's `escrow.ts` already uses for real on-chain transfers).
 * No human approval step exists anywhere in this path.
 *
 * `@x402/evm` builds its typed-data message as `{domain, types, primaryType,
 * message}` WITHOUT a `types.EIP712Domain` entry (viem-style signers derive
 * that internally) — Circle's REST API needs a fully standard
 * eth_signTypedData_v4 JSON document, so this adapter synthesizes
 * `EIP712Domain` from whichever domain fields are actually present before
 * forwarding to Circle.
 */

type TypedDataMessage = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
};

const DOMAIN_FIELD_TYPES: Record<string, string> = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32",
};

function buildEip712DomainType(domain: Record<string, unknown>) {
  return Object.keys(domain)
    .filter((key) => key in DOMAIN_FIELD_TYPES)
    .map((key) => ({ name: key, type: DOMAIN_FIELD_TYPES[key] }));
}

/** JSON.stringify chokes on BigInt — EIP-712 JSON represents uint256 values as decimal strings. */
function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toJsonSafe(v)]),
    );
  }
  return value;
}

export type CircleEip712Signer = {
  readonly address: Address;
  signTypedData(message: TypedDataMessage): Promise<Hex>;
};

/**
 * Circle-wallet-backed signer conforming to @x402/evm's ClientEvmSigner
 * interface. Only ever used for the `parallel_payer` wallet, which lives
 * under Circle's live/production entity — hence the live client, not the
 * sandbox one every other wallet in this app signs through.
 */
export function createCircleEip712Signer(params: {
  walletId: string;
  address: Address;
}): CircleEip712Signer {
  return {
    address: params.address,
    async signTypedData(msg: TypedDataMessage): Promise<Hex> {
      const client = getLiveDeveloperControlledWalletsClient();
      const domain = toJsonSafe(msg.domain) as Record<string, unknown>;
      const payload = {
        domain,
        types: {
          EIP712Domain: buildEip712DomainType(msg.domain),
          ...(toJsonSafe(msg.types) as Record<string, unknown>),
        },
        primaryType: msg.primaryType,
        message: toJsonSafe(msg.message),
      };

      const res = await client.signTypedData({
        walletId: params.walletId,
        data: JSON.stringify(payload),
      });
      const signature = res.data?.signature;
      if (!signature) {
        throw new Error("Circle signTypedData returned no signature");
      }
      return signature as Hex;
    },
  };
}
