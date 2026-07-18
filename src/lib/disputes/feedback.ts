import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";

/**
 * Educational feedback for a buyer-won post-approval contest.
 *
 * Same Claude structured-output call pattern as the Estimator's spec parser
 * (lib/estimator/parser.ts): a system prompt, a hand-written JSON schema,
 * refusal check, text-block parse.
 */

export type EducationalFeedback = {
  /** 1-3 sentences on the ambiguity gap between what was asked for and what was delivered. */
  gap_summary: string;
  /** 2-3 sample rewrites of the original spec that would have avoided the ambiguity. */
  rewritten_specs: string[];
};

const SCHEMA = {
  type: "object",
  properties: {
    gap_summary: {
      type: "string",
      description:
        "1-3 plain sentences on the ambiguity gap between the buyer's original spec and what the seller delivered — the deciding factor in the judges' ruling for the buyer.",
    },
    rewritten_specs: {
      type: "array",
      items: { type: "string" },
      // Claude's structured-output API rejects minItems/maxItems other than
      // 0 or 1 on array schemas ("values other than 0 or 1 are not
      // supported") — every call was failing outright before this, silently
      // swallowed by the try/catch in resolveDispute's settleContestWin. The
      // 2-3 constraint now lives only in the description text below.
      description:
        "2-3 alternative phrasings of the ORIGINAL request, rewritten to close the ambiguity gap so a seller following the SLA couldn't reasonably deliver the same shortfall again.",
    },
  },
  required: ["gap_summary", "rewritten_specs"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You write educational feedback for a buyer who just won a post-approval contest — judges ruled the seller's delivery, while technically within its own published SLA, did not satisfy what the buyer actually needed because the buyer's original request was ambiguous or under-specified.

Rules:
- Do not blame the seller — the seller met their SLA; the judges' ruling was about the spec being underspecified, not seller fraud.
- gap_summary names the SPECIFIC ambiguity a well-specified request would have closed.
- rewritten_specs are full replacement versions of the original request, not diffs or bullet notes — text the buyer could paste in next time.
- Ground every rewrite in the actual gap found; do not invent unrelated requirements.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireServerEnv("ANTHROPIC_API_KEY") });
  }
  return client;
}

export async function generateEducationalFeedback(params: {
  originalSpec: unknown;
  sellerSla: unknown;
  delivered: unknown;
  validatorRationale: unknown;
}): Promise<EducationalFeedback> {
  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          "ORIGINAL TASK SPEC (what the buyer asked for):",
          JSON.stringify(params.originalSpec),
          "",
          "SELLER SLA (what the seller promised, and met):",
          JSON.stringify(params.sellerSla),
          "",
          "DELIVERED PAYLOAD:",
          JSON.stringify(params.delivered),
          "",
          "VALIDATOR'S ORIGINAL AUTO-APPROVE RATIONALE:",
          JSON.stringify(params.validatorRationale),
        ].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Educational feedback generation was refused.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Feedback generator returned no text block");
  }
  return JSON.parse(text.text) as EducationalFeedback;
}

/**
 * Buyer-facing feedback for a validator-rejected delivery (Phase 3B).
 *
 * The mirror-image case of the post-approval-contest feedback above: here the
 * seller's delivery genuinely fell short of its own SLA/the task's in-scope
 * criteria (that's exactly what the validator's `failures` array already
 * establishes, by construction — see lib/validator.ts), so unlike the
 * contest case this doesn't need to avoid blaming the seller. It exists so a
 * rejected buyer sees more than a frozen/refunded escrow: what the gap
 * actually was, and text they can carry into a resubmission.
 */

export type RejectionFeedback = {
  /** 1-3 sentences on what the SLA/criteria promised vs. what was missing or wrong. */
  gap_summary: string;
  /** Forward-looking paragraph the buyer can carry into a new task's description. */
  resubmission_context: string;
};

const REJECTION_SCHEMA = {
  type: "object",
  properties: {
    gap_summary: {
      type: "string",
      description:
        "1-3 plain sentences naming what the seller's SLA/the task's criteria promised and what was missing or wrong in the delivered work — the deciding factor in the validator's rejection.",
    },
    resubmission_context: {
      type: "string",
      description:
        "A short paragraph, written in the buyer's voice and ready to paste into a new task request, that closes the gap which caused this rejection so a resubmission doesn't repeat it. Forward-looking — not a rehash of the failure.",
    },
  },
  required: ["gap_summary", "resubmission_context"],
  additionalProperties: false,
} as const;

const REJECTION_SYSTEM_PROMPT = `You write feedback for a buyer whose task delivery was just auto-rejected by the validator against the seller's own published SLA and the buyer's in-scope task criteria.

Rules:
- Ground every claim in the validator's actual failures below — do not invent issues it didn't find.
- gap_summary names the SPECIFIC promise-vs-delivery gap: what was required and what was missing or wrong.
- resubmission_context is forward-looking text the buyer could paste into a new request to close that gap — not a restatement of the failure.
- Do not speculate about seller intent or recommend a different seller; stick to what the validator actually found.`;

export async function generateRejectionFeedback(params: {
  originalSpec: unknown;
  sellerSla: unknown;
  deliverable: unknown;
  failures: unknown;
  validatorRationale: unknown;
}): Promise<RejectionFeedback> {
  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    system: REJECTION_SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: REJECTION_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          "ORIGINAL TASK SPEC (what the buyer asked for):",
          JSON.stringify(params.originalSpec),
          "",
          "SELLER SLA (what the seller promised):",
          JSON.stringify(params.sellerSla),
          "",
          "DELIVERED PAYLOAD:",
          JSON.stringify(params.deliverable),
          "",
          "VALIDATOR FAILURES (in-scope criteria that failed):",
          JSON.stringify(params.failures),
          "",
          "VALIDATOR RATIONALE:",
          JSON.stringify(params.validatorRationale),
        ].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Rejection feedback generation was refused.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Feedback generator returned no text block");
  }
  return JSON.parse(text.text) as RejectionFeedback;
}
