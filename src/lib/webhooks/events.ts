import { decodeEventLog, type Hex } from "viem";

/**
 * Event ABI fragments for the two contracts we monitor, transcribed
 * directly from contracts/src/SnapBackEscrow.sol and
 * contracts/src/JudgeRegistry.sol — not guessed, for the same reason
 * lib/escrow.ts's JOB_CREATED_EVENT isn't: decoding a webhook payload
 * against the wrong signature could silently misattribute a jobId.
 *
 * `eventSignature` strings (used when registering monitors — see
 * scripts/circle-webhooks-setup.ts) must exactly match these, with no
 * spaces, per Circle's error 175303.
 */
export const SNAPBACK_ESCROW_EVENTS = [
  {
    type: "event",
    name: "Funded",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Submitted",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "deliverableHash", type: "bytes32", indexed: false },
      { name: "acceptDeadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Released",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "reason", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AutoReleased",
    inputs: [{ name: "jobId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "SnappedBack",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "reason", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Disputed",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "by", type: "address", indexed: true },
      { name: "reason", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DisputeResolved",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "favorBuyer", type: "bool", indexed: false },
      { name: "reason", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ExpiredClaimed",
    inputs: [{ name: "jobId", type: "uint256", indexed: true }],
  },
] as const;

export const JUDGE_REGISTRY_EVENTS = [
  {
    type: "event",
    name: "PanelSelected",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "judges", type: "address[]", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PanelEscalated",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "added", type: "address[]", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VoteCast",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "judge", type: "address", indexed: true },
      { name: "favorBuyer", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VerdictReached",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "favorBuyer", type: "bool", indexed: false },
      { name: "forBuyer", type: "uint8", indexed: false },
      { name: "forSeller", type: "uint8", indexed: false },
      { name: "tieBreak", type: "bool", indexed: false },
    ],
  },
] as const;

/** Every event signature string an event monitor gets created for. */
export const SNAPBACK_ESCROW_EVENT_SIGNATURES = [
  "Funded(uint256,uint256)",
  "Submitted(uint256,bytes32,uint64)",
  "Released(uint256,bytes32)",
  "AutoReleased(uint256)",
  "SnappedBack(uint256,bytes32)",
  "Disputed(uint256,address,bytes32)",
  "DisputeResolved(uint256,bool,bytes32)",
  "ExpiredClaimed(uint256)",
] as const;

export const JUDGE_REGISTRY_EVENT_SIGNATURES = [
  "PanelSelected(uint256,address[],uint64)",
  "PanelEscalated(uint256,address[],uint64)",
  "VoteCast(uint256,address,bool)",
  "VerdictReached(uint256,bool,uint8,uint8,bool)",
] as const;

export type DecodedContractEvent = {
  eventName: string;
  jobId: string;
  args: Record<string, unknown>;
};

/**
 * Decodes a `contracts.eventLog` webhook notification's topics/data against
 * whichever of the two ABIs matches. Returns null on a signature this app
 * doesn't recognize (e.g. a future event added to either contract without
 * updating this file) rather than throwing — one unrecognized event must
 * not take down the whole webhook receiver.
 */
export function decodeContractEvent(topics: Hex[], data: Hex): DecodedContractEvent | null {
  for (const abi of [SNAPBACK_ESCROW_EVENTS, JUDGE_REGISTRY_EVENTS]) {
    try {
      const decoded = decodeEventLog({ abi, topics: topics as [Hex, ...Hex[]], data, strict: false });
      const args = decoded.args as Record<string, unknown>;
      const jobId = args.jobId;
      if (jobId === undefined) continue;
      return { eventName: decoded.eventName, jobId: String(jobId), args };
    } catch {
      // Wrong ABI for this log — try the next one.
    }
  }
  return null;
}
