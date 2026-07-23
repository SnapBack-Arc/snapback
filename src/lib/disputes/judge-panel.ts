import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { resolveDispute } from "@/lib/disputes/service";
import type { VoteChoice } from "@/lib/supabase/types";

/**
 * Real AI judge panel -- the sole dispute-resolution path. There is no admin
 * manual-override route anymore: every dispute resolves automatically,
 * either by tier-1/tier-2 vote or by the deterministic tie-break below.
 *
 * Tier 1 (first attempt, every dispute): 2x claude-opus-4-8 + 1x
 * claude-sonnet-5, fully independent (no judge sees another's vote),
 * unanimous-only. Any disagreement -- including a 2-1 split -- escalates.
 * A judge call failing outright (refusal, API error, unparseable output)
 * also escalates; it is recorded as an `abstain` vote, never retried at this
 * tier (retrying or dropping a failed call was explicitly ruled out).
 *
 * Tier 2 (escalation only): a fresh, disjoint panel -- 3x claude-opus-4-8 at
 * varying effort + 2x claude-sonnet-5 -- majority (>=3 agreeing), not
 * unanimous, so the dispute can actually resolve. A failed slot is retried
 * once; if it still fails it's recorded as `abstain` and majority is
 * evaluated over whatever real votes exist. If that's not a clean >=3
 * agreement (e.g. a 2-2 tie after a permanent failure), a deterministic
 * tie-break decides instead of leaving the dispute stuck: `standard`
 * disputes favor the buyer (the seller hadn't met its burden of proof),
 * `post_approval_contest`s favor the seller (the buyer hadn't met theirs) --
 * see the tie-break call at the end of runJudgePanel below.
 *
 * Both tiers' votes are persisted as real `judge_votes` rows on the same
 * dispute (up to 8 total on an escalated dispute) -- see
 * supabase/migrations/0016_judge_panel.sql for why that requires 8 distinct
 * fixed judge identities, not 5.
 *
 * resolveDispute (lib/disputes/service.ts) is the actual settlement --
 * every real money-moving step it runs is retry-safe (see
 * lib/disputes/settlement.ts). If those retries are exhausted, the dispute
 * lands in `settlement_failed`, not `voting` -- a genuine infra failure
 * (Circle API / chain), surfaced passively on /admin, not something this
 * function retries itself.
 */

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

type JudgeIdentity = {
  circleWalletId: string;
  model: "claude-opus-4-8" | "claude-sonnet-5";
  effort: Effort;
  tier: 3 | 5;
};

/**
 * Fixed, permanent system identities -- not drawn per-dispute. Tier-1's 2
 * opus + 1 sonnet and tier-2's fresh 3 opus + 2 sonnet must be disjoint sets
 * (judge_votes has unique(dispute_id, judge_wallet_id), and both tiers'
 * votes land on the same dispute when escalated).
 */
const IDENTITIES: JudgeIdentity[] = [
  { circleWalletId: "judge-opus-1-wallet", model: "claude-opus-4-8", effort: "high", tier: 3 },
  { circleWalletId: "judge-opus-2-wallet", model: "claude-opus-4-8", effort: "high", tier: 3 },
  { circleWalletId: "judge-sonnet-1-wallet", model: "claude-sonnet-5", effort: "high", tier: 3 },
  { circleWalletId: "judge-opus-3-wallet", model: "claude-opus-4-8", effort: "medium", tier: 5 },
  { circleWalletId: "judge-opus-4-wallet", model: "claude-opus-4-8", effort: "high", tier: 5 },
  { circleWalletId: "judge-opus-5-wallet", model: "claude-opus-4-8", effort: "xhigh", tier: 5 },
  { circleWalletId: "judge-sonnet-2-wallet", model: "claude-sonnet-5", effort: "high", tier: 5 },
  { circleWalletId: "judge-sonnet-3-wallet", model: "claude-sonnet-5", effort: "high", tier: 5 },
];

type ResolvedIdentity = JudgeIdentity & { walletId: string };

const SCHEMA = {
  type: "object",
  properties: {
    vote: { type: "string", enum: ["BUYER_WINS", "SELLER_WINS"] },
    reasoning: {
      type: "string",
      description:
        "1-3 plain sentences on the deciding factor, grounded only in the seller's SLA and the evidence provided.",
    },
  },
  required: ["vote", "reasoning"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are one independent judge on a panel resolving a marketplace dispute between a buyer and a seller. You do not see any other judge's vote or reasoning -- decide entirely on your own.

You will be given: the buyer's original task request, the seller's published SLA, the delivered work, the validator's original verdict and reasoning, and the reason this dispute was filed.

Rules:
- The seller is accountable ONLY for what their SLA actually promised. A buyer wanting more than the SLA committed to is not the seller's failure.
- Weigh the delivered work directly against the SLA and the dispute reason -- do not simply defer to the validator's verdict, but do treat it as evidence.
- If the SLA specifies min_distinct_sources: group any delivered findings connected by overlaps_with (in either direction) together, and count only one member per group toward that minimum -- a finding whose source_role is distributor_or_reseller and which overlaps_with another finding does not add an additional distinct source.
- vote must be exactly "BUYER_WINS" (refund the buyer) or "SELLER_WINS" (seller's payout stands) -- there is no third option and no partial credit.
- reasoning: 1-3 plain sentences naming the deciding factor.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireServerEnv("ANTHROPIC_API_KEY") });
  return client;
}

type JudgeVerdict = { vote: "BUYER_WINS" | "SELLER_WINS"; reasoning: string };
type JudgeOutcome = JudgeVerdict | { error: string };

async function callJudge(identity: JudgeIdentity, evidence: string): Promise<JudgeVerdict> {
  const response = await getClient().messages.create({
    model: identity.model,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { effort: identity.effort, format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: evidence }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Judge call was refused.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Judge returned no text block");
  }
  const parsed = JSON.parse(text.text) as { vote?: unknown; reasoning?: unknown };
  if (parsed.vote !== "BUYER_WINS" && parsed.vote !== "SELLER_WINS") {
    throw new Error(`Judge returned an unrecognized vote: ${JSON.stringify(parsed.vote)}`);
  }
  return { vote: parsed.vote, reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "" };
}

async function attemptJudge(identity: JudgeIdentity, evidence: string): Promise<JudgeOutcome> {
  try {
    return await callJudge(identity, evidence);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Tier-2 only: one retry on failure, never at tier-1 (that must escalate, not retry). */
async function attemptJudgeWithRetry(identity: JudgeIdentity, evidence: string): Promise<JudgeOutcome> {
  const first = await attemptJudge(identity, evidence);
  if (!("error" in first)) return first;
  return attemptJudge(identity, evidence);
}

function buildEvidence(params: {
  taskRequest: unknown;
  sellerSla: unknown;
  deliveredWork: unknown;
  validatorVerdict: unknown;
  disputeReason: string;
  disputeReasonLabel: string;
  disputeSource: string;
}): string {
  return [
    "BUYER'S ORIGINAL TASK REQUEST:",
    JSON.stringify(params.taskRequest),
    "",
    "SELLER'S PUBLISHED SLA:",
    JSON.stringify(params.sellerSla),
    "",
    "DELIVERED WORK:",
    JSON.stringify(params.deliveredWork),
    "",
    "VALIDATOR'S ORIGINAL VERDICT AND REASONING:",
    JSON.stringify(params.validatorVerdict),
    "",
    `DISPUTE SOURCE: ${params.disputeSource}`,
    `${params.disputeReasonLabel}:`,
    params.disputeReason,
  ].join("\n");
}

async function resolveIdentities(
  supabase: ReturnType<typeof createServiceSupabase>,
): Promise<ResolvedIdentity[]> {
  const { data: wallets, error } = await supabase
    .from("wallets")
    .select("id, circle_wallet_id")
    .in(
      "circle_wallet_id",
      IDENTITIES.map((i) => i.circleWalletId),
    );
  if (error || !wallets || wallets.length !== IDENTITIES.length) {
    throw new Error(
      `Judge panel identities not fully provisioned (found ${wallets?.length ?? 0}/${IDENTITIES.length}) -- see supabase/migrations/0016_judge_panel.sql`,
    );
  }
  const byCircleId = new Map(wallets.map((w) => [w.circle_wallet_id, w.id]));
  return IDENTITIES.map((identity) => {
    const walletId = byCircleId.get(identity.circleWalletId);
    if (!walletId) throw new Error(`Missing wallet for judge identity ${identity.circleWalletId}`);
    return { ...identity, walletId };
  });
}

/** favor_payer if a genuine >=3-of-however-many-cast-a-real-vote majority agrees; null if tied/ambiguous. */
function tallyMajority(choices: VoteChoice[]): "favor_payer" | "favor_payee" | null {
  const payer = choices.filter((c) => c === "favor_payer").length;
  const payee = choices.filter((c) => c === "favor_payee").length;
  if (payer >= 3) return "favor_payer";
  if (payee >= 3) return "favor_payee";
  return null;
}

/** All 3 tier-1 votes must be present and identical (an abstain never counts as agreement). */
function tallyUnanimous(choices: VoteChoice[]): "favor_payer" | "favor_payee" | null {
  if (choices.length === 3 && choices.every((c) => c === "favor_payer")) return "favor_payer";
  if (choices.length === 3 && choices.every((c) => c === "favor_payee")) return "favor_payee";
  return null;
}

async function writeVotes(
  supabase: ReturnType<typeof createServiceSupabase>,
  disputeId: string,
  identities: ResolvedIdentity[],
  outcomes: JudgeOutcome[],
  tier: 3 | 5,
): Promise<VoteChoice[]> {
  const rows = identities.map((identity, i) => {
    const outcome = outcomes[i];
    const choice: VoteChoice =
      "error" in outcome ? "abstain" : outcome.vote === "BUYER_WINS" ? "favor_payer" : "favor_payee";
    const rationale = "error" in outcome ? `Judge call failed: ${outcome.error}` : outcome.reasoning;
    return {
      dispute_id: disputeId,
      judge_wallet_id: identity.walletId,
      choice,
      rationale,
      model: identity.model,
      effort: identity.effort,
      tier,
    };
  });
  const { error } = await supabase.from("judge_votes").insert(rows);
  if (error) throw new Error(`Failed to record ${tier === 3 ? "tier-1" : "tier-2"} judge votes: ${error.message}`);
  return rows.map((r) => r.choice);
}

export async function runJudgePanel(disputeId: string): Promise<void> {
  const supabase = createServiceSupabase();

  const { data: dispute } = await supabase.from("disputes").select("*").eq("id", disputeId).single();
  if (!dispute) throw new Error(`Dispute ${disputeId} not found`);

  const { data: task } = await supabase
    .from("tasks")
    .select("*, listings(sla)")
    .eq("id", dispute.task_id)
    .single();
  if (!task) throw new Error(`Task ${dispute.task_id} not found for dispute ${disputeId}`);

  const isContest = dispute.dispute_kind === "post_approval_contest";
  const { data: validation } = await supabase
    .from("validations")
    .select("*")
    .eq("task_id", dispute.task_id)
    .eq("outcome", isContest ? "approved" : "disputed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const evidence = buildEvidence({
    taskRequest: (task.metadata as { criteria?: unknown } | null)?.criteria ?? task.description,
    sellerSla: (task.listings as { sla: unknown } | null)?.sla ?? {},
    deliveredWork: validation?.deliverable ?? null,
    validatorVerdict: isContest
      ? dispute.validator_reasoning_snapshot
      : { rationale: validation?.rationale, failures: validation?.failures },
    disputeReason: dispute.reason ?? "(no reason given)",
    disputeReasonLabel: isContest ? "BUYER'S STATED OBJECTION" : "DISPUTE REASON",
    disputeSource: isContest
      ? "buyer-initiated post-approval contest (validator had already approved; seller already paid)"
      : "auto-filed by the buyer-agent validator's rejection of the delivery",
  });

  await supabase.from("disputes").update({ status: "voting" }).eq("id", disputeId);

  const identities = await resolveIdentities(supabase);

  // Tier 1: first attempt on every dispute. No retry on a failed call -- it
  // escalates, same as a genuine split.
  const tier1Identities = identities.filter((i) => i.tier === 3);
  const tier1Outcomes = await Promise.all(tier1Identities.map((id) => attemptJudge(id, evidence)));
  const tier1Choices = await writeVotes(supabase, disputeId, tier1Identities, tier1Outcomes, 3);

  const unanimous = tallyUnanimous(tier1Choices);
  if (unanimous) {
    await resolveDispute(disputeId, unanimous);
    return;
  }

  // Escalate: fresh, disjoint 5-judge panel. Record why, for the admin
  // history view and JudgeVotesList's escalation display.
  await supabase
    .from("disputes")
    .update({
      evidence: {
        ...((dispute.evidence as Record<string, unknown>) ?? {}),
        panel: {
          escalated: true,
          tier1_result:
            tier1Choices.filter((c) => c === "abstain").length > 0
              ? "a tier-1 judge call failed outright"
              : "tier-1 split with no unanimous result",
        },
      },
    })
    .eq("id", disputeId);

  const tier2Identities = identities.filter((i) => i.tier === 5);
  const tier2Outcomes = await Promise.all(tier2Identities.map((id) => attemptJudgeWithRetry(id, evidence)));
  const tier2Choices = await writeVotes(supabase, disputeId, tier2Identities, tier2Outcomes, 5);

  const majority = tallyMajority(tier2Choices);
  if (majority) {
    await resolveDispute(disputeId, majority);
    return;
  }

  // No genuine, unambiguous majority even after retry (e.g. a 2-2 tie after
  // a permanently-failed slot). Deterministic tie-break, not left for a
  // human: the seller was claiming their delivery/payout was earned, so an
  // inconclusive panel hasn't met that burden -- standard disputes favor the
  // buyer. A post-approval contest inverts the claim (the buyer is claiming
  // a refund on work already paid out), so it favors the seller instead.
  await resolveDispute(disputeId, isContest ? "favor_payee" : "favor_payer");
}
