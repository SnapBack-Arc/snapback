import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";

/**
 * Buyer-agent validator (Phase 6d).
 *
 * The buyer agent's validator is the SOLE checker at this stage — no human
 * review. Criteria are narrowed BEFORE checking, not after:
 *
 *   1. Start from the person's standing policy + the buyer agent's
 *      task-specific criteria.
 *   2. Narrow that set to only what the seller's published SLA actually
 *      committed to — a criterion the SLA never covers is dropped entirely,
 *      not merely tagged. It cannot produce a failure because it is never
 *      checked.
 *   3. Check the delivered payload only against this narrowed/effective set.
 *
 * A failure outside the seller's SLA scope is therefore not just "excused" —
 * it structurally cannot occur, because narrowing happens first. Every failure
 * in the result is tagged with which source it came from (policy/task/sla),
 * and by construction every one of them is within what the seller promised.
 *
 * NOTE: `max_amount_usdc` (budget ceiling) and `auto_release_hours` are NOT
 * part of this narrowing — they aren't dimensions a delivered payload can
 * "violate"; they're a spend cap and a timing parameter, and by the time this
 * validator runs the amount is already locked in escrow. Only
 * `accuracy_tolerance` is a genuine delivery-quality policy criterion.
 */

export type StandingPolicy = {
  accuracy_tolerance: number | null;
};

export type Failure = {
  /** Which of the three sources this failing criterion came from. */
  source: "policy" | "task" | "sla";
  criterion: string;
  detail: string;
};

export type ValidationResult = {
  outcome: "approved" | "disputed";
  policy_pass: boolean;
  task_pass: boolean;
  sla_pass: boolean;
  /** Every entry here is, by construction, within what the seller's SLA covers. */
  failures: Failure[];
  rationale: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "array",
      description:
        "Every candidate criterion from POLICY and TASK, narrowed against the SLA.",
      items: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["policy", "task", "sla"] },
          criterion: { type: "string", description: "What is being checked." },
          in_scope: {
            type: "boolean",
            description:
              "True only if the seller's SLA actually committed to this. False if the buyer/policy wants it but the SLA never promised it — such items must NOT be evaluated further.",
          },
          pass: {
            type: "boolean",
            description:
              "Whether the delivered payload satisfies this criterion. Meaningless (set true) when in_scope=false.",
          },
          detail: { type: "string" },
        },
        required: ["source", "criterion", "in_scope", "pass", "detail"],
        additionalProperties: false,
      },
    },
    rationale: { type: "string" },
  },
  required: ["criteria", "rationale"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are a buyer agent's delivery validator. You do this in two steps, in order — do not skip step 1.

STEP 1 — NARROW. Build the candidate criteria from POLICY (accuracy tolerance) and TASK (this request's specific asks). For each one, decide in_scope: is this something the seller's SLA actually committed to? A seller is only accountable for what it promised. If the SLA is silent on a criterion, or only partially covers it, that criterion is out of scope (in_scope=false) — the buyer wanting more than the seller promised is not the seller's failure.
Also include the SLA's own commitments as their own criteria (source="sla"), always in_scope=true — the SLA is what it is.

STEP 2 — CHECK. Only for criteria with in_scope=true, evaluate the delivered payload against it and set pass accordingly. For in_scope=false criteria, set pass=true (vacuous — they are excluded from judgment, not failed).

Rules:
- Be strict and literal on in-scope criteria. Do not assume unstated quality.
- Do not invent criteria the buyer/policy/SLA didn't actually state.
- If the SLA specifies min_distinct_sources: group any delivered findings connected by overlaps_with (in either direction) together, and count only one member per group toward that minimum — a finding whose source_role is distributor_or_reseller and which overlaps_with another finding does not add an additional distinct source.
- rationale: one or two plain sentences on the deciding factor.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireServerEnv("ANTHROPIC_API_KEY") });
  return client;
}

type CriterionResult = {
  source: "policy" | "task" | "sla";
  criterion: string;
  in_scope: boolean;
  pass: boolean;
  detail: string;
};

/**
 * Narrow policy+task criteria to the seller's SLA scope, then check the
 * delivered payload against only that narrowed set.
 */
export async function validateDelivery(params: {
  policy: StandingPolicy;
  taskCriteria: unknown;
  sellerSla: unknown;
  deliverable: unknown;
  /**
   * Set when the buyer has crossed the hard dispute-abuse loss-rate
   * threshold (see lib/disputes/service.ts). Adds an extra-rigor instruction
   * so a buyer with a documented history of losing disputes can't lean on a
   * trigger-happy auto-file to keep generating them.
   */
  heightenedScrutiny?: boolean;
}): Promise<ValidationResult> {
  const scrutinyNote = params.heightenedScrutiny
    ? "\n\nEXTRA SCRUTINY: this buyer has a documented history of disputes judges ruled against. Before marking any in-scope criterion as failed, require clear, unambiguous evidence — do not rule against the seller on a benefit-of-the-doubt or borderline call."
    : "";

  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    system: SYSTEM + scrutinyNote,
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          "POLICY (standing — accuracy tolerance only):",
          JSON.stringify(params.policy),
          "",
          "TASK criteria (this request):",
          JSON.stringify(params.taskCriteria),
          "",
          "SELLER SLA (what the seller promised):",
          JSON.stringify(params.sellerSla),
          "",
          "DELIVERED PAYLOAD:",
          JSON.stringify(params.deliverable),
        ].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Validation was refused for this payload.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Validator returned no text");

  const parsed = JSON.parse(text.text) as { criteria: CriterionResult[]; rationale: string };

  const inScope = parsed.criteria.filter((c) => c.in_scope);
  const failures: Failure[] = inScope
    .filter((c) => !c.pass)
    .map((c) => ({ source: c.source, criterion: c.criterion, detail: c.detail }));

  const passBy = (source: CriterionResult["source"]) =>
    !inScope.some((c) => c.source === source && !c.pass);

  return {
    outcome: failures.length === 0 ? "approved" : "disputed",
    policy_pass: passBy("policy"),
    task_pass: passBy("task"),
    sla_pass: passBy("sla"),
    failures,
    rationale: parsed.rationale,
  };
}
