import "server-only";
import { createHash } from "node:crypto";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getUserWallet, createArcWalletForUser } from "@/lib/circle-wallets";
import { computeFilingFee, recordDisputeFiling, resolveDispute } from "@/lib/disputes/service";
import { filePostApprovalContest } from "@/lib/disputes/contest";
import { CIRCLE_ARC_BLOCKCHAIN, ARC_CHAIN_ID } from "@/lib/arc";
import { DEMO_TEST_ACCOUNT_EMAIL, DEMO_TEST_WALLET_REF_ID } from "@/lib/demo/config";
import type { Database } from "@/lib/supabase/types";

type WalletRow = Database["public"]["Tables"]["wallets"]["Row"];

/**
 * Seeds testAccount@snapback.com with a fixed, persistent history: five
 * tasks walking through the outcomes a demo/judge would want to see —
 * clean approval, a buyer-won dispute (refund), a seller-won dispute, a
 * post-approval contest, and a dispute that splits 3-judge and escalates to
 * a 5-judge panel. Idempotent: skips straight to a no-op if this wallet
 * already has tasks, so repeat demo logins never duplicate rows (this data
 * deliberately does NOT reset, unlike newAccount@snapback.com).
 *
 * The seller and judges are synthetic — plain Supabase rows with
 * deterministic fake circle_wallet_id/address values, not real Circle API
 * resources. Nothing in the seeded flow drives them through Circle (they're
 * read-only counterparties/voters for display), so minting five-plus real
 * dev-controlled wallets just to seed history would be pure overhead. The
 * buyer wallet itself (testAccount's own) IS a real Circle wallet, reused
 * across seed runs via DEMO_TEST_WALLET_REF_ID, since that one's balance
 * and address are genuinely shown on the dashboard.
 *
 * tx_hash values below are deterministic fake hashes (sha256 of a label) —
 * they render correctly in the payments table but won't resolve on the real
 * block explorer. That's an intentional trade-off: this seed never touches
 * Circle/Arc for the historical rows, so there's no real transaction to
 * link to.
 */

const SELLER = {
  email: "demo-seller@snapback.internal",
  circleWalletId: "demo-seller-wallet",
  // 40 hex chars, not real Circle-backed — fine here since this wallet is
  // only ever a counterparty in the 5 off-chain seeded historical tasks
  // below, never driven through a real on-chain call. (An earlier version
  // of this address was 2 characters short — harmless for those tasks, but
  // it matters a lot for MARKETPLACE_SELLER below, which real submissions
  // do drive on-chain.)
  address: "0x1111111111111111111111111111111111d3a1a1",
};

const MARKETPLACE_SELLER_EMAIL = "marketplace-seller@snapback.internal";
const MARKETPLACE_SELLER_WALLET_REF_ID = "demo-marketplace-seller";

/**
 * Real Circle-backed seller wallet behind the baseline marketplace listings
 * (BASELINE_LISTINGS below) — deliberately NOT the synthetic SELLER above.
 * A real task submission calls setJobBudget with the listing's seller
 * wallet, which requires Circle to actually sign as that wallet; a
 * synthetic DB-only row can never do that. Reused across seed runs via
 * refId, same pattern as the demo personas' wallets.
 */
async function ensureMarketplaceSellerWallet(): Promise<WalletRow> {
  const userId = await ensureUserId(MARKETPLACE_SELLER_EMAIL);
  return (
    (await getUserWallet(userId)) ??
    (await createArcWalletForUser(userId, MARKETPLACE_SELLER_WALLET_REF_ID))
  );
}

const JUDGES = [1, 2, 3, 4, 5].map((n) => ({
  email: `demo-judge-${n}@snapback.internal`,
  circleWalletId: `demo-judge-${n}-wallet`,
  address: `0x${"2".repeat(39)}${n}`,
}));

function fakeTxHash(label: string): string {
  return `0x${createHash("sha256").update(label).digest("hex")}`;
}

/** Exported so /api/auth/demo can look up (or create) the newAccount user row too. */
export async function ensureUserId(email: string): Promise<string> {
  const supabase = createServiceSupabase();
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("users")
    .insert({ email })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to seed user ${email}: ${error?.message}`);
  return data.id;
}

/** Synthetic (non-Circle) participant: a plain wallets row for display only. */
async function ensureSyntheticWallet(params: {
  email: string;
  circleWalletId: string;
  address: string;
}): Promise<WalletRow> {
  const supabase = createServiceSupabase();
  const userId = await ensureUserId(params.email);

  const { data: existing } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("wallets")
    .insert({
      user_id: userId,
      circle_wallet_id: params.circleWalletId,
      address: params.address,
      blockchain: CIRCLE_ARC_BLOCKCHAIN,
      account_type: "SCA",
      control: "developer",
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to seed wallet for ${params.email}: ${error?.message}`);
  }
  return data;
}

/** Generic insert-or-throw — every unchecked Supabase insert below was silently
 * swallowing errors (the promise resolves with `{ error }` rather than
 * rejecting), which is exactly how a previous seed run ended up "succeeding"
 * with release/judge_fee payments quietly missing. */
async function insertRow<T extends keyof Database["public"]["Tables"]>(
  table: T,
  row: Database["public"]["Tables"][T]["Insert"],
  label: string,
): Promise<void> {
  const supabase = createServiceSupabase();
  const { error } = await supabase.from(table).insert(row as never);
  if (error) throw new Error(`Seed insert into ${table} failed (${label}): ${error.message}`);
}

async function insertPayment(params: {
  taskId?: string;
  fromWalletId?: string;
  toWalletId?: string;
  kind: Database["public"]["Enums"]["payment_kind"];
  status: Database["public"]["Enums"]["payment_status"];
  amountUsdc: number;
  label: string;
}): Promise<void> {
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("payments").insert({
    task_id: params.taskId ?? null,
    from_wallet_id: params.fromWalletId ?? null,
    to_wallet_id: params.toWalletId ?? null,
    kind: params.kind,
    status: params.status,
    amount_usdc: params.amountUsdc,
    tx_hash: fakeTxHash(params.label),
    chain_id: ARC_CHAIN_ID,
    metadata: { demo: true },
  });
  if (error) throw new Error(`Seed payment failed (${params.label}): ${error.message}`);
}

async function payJudges(
  taskId: string,
  disputeId: string,
  judges: WalletRow[],
  amountUsdc: number,
): Promise<void> {
  for (const judge of judges) {
    // taskId matters beyond bookkeeping: it's what lets purgeDemoTestAccountHistory
    // find and clean these up on reseed — judge_fee payments never touch
    // testAccount's own wallet (from/to are both third parties), so task_id
    // is the only link back to "this is part of testAccount's demo history".
    await insertPayment({
      taskId,
      toWalletId: judge.id,
      kind: "judge_fee",
      status: "released",
      amountUsdc,
      label: `${disputeId}:judge_fee:${judge.id}`,
    });
  }
}

async function seedCleanApprovedTask(
  buyer: WalletRow,
  seller: WalletRow,
): Promise<void> {
  const supabase = createServiceSupabase();
  const amount = 12.5;

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      payer_wallet_id: buyer.id,
      payee_wallet_id: seller.id,
      title: "Weekly competitor pricing report",
      description: "Compile pricing across 5 named competitors into a structured table.",
      status: "accepted",
      amount_usdc: amount,
      accepted_at: new Date().toISOString(),
      metadata: { demo: true },
    })
    .select()
    .single();
  if (error || !task) throw new Error(`Seed task1 failed: ${error?.message}`);

  await insertRow(
    "quotes",
    { task_id: task.id, payee_wallet_id: seller.id, amount_usdc: amount, accepted: true },
    `${task.id}:quote`,
  );

  await insertRow(
    "validations",
    {
      task_id: task.id,
      outcome: "approved",
      policy_pass: true,
      task_pass: true,
      sla_pass: true,
      rationale: "Delivery matched task criteria, standing policy, and the seller's published SLA.",
    },
    `${task.id}:validation`,
  );

  await insertPayment({
    taskId: task.id,
    fromWalletId: buyer.id,
    kind: "escrow",
    status: "escrowed",
    amountUsdc: amount,
    label: `${task.id}:escrow`,
  });
  await insertPayment({
    taskId: task.id,
    toWalletId: seller.id,
    kind: "release",
    status: "released",
    amountUsdc: amount,
    label: `${task.id}:release`,
  });
}

/** A standard (non-contest) dispute: escrow lock, judge panel, resolution, settlement leg. */
async function seedStandardDisputeTask(params: {
  buyer: WalletRow;
  seller: WalletRow;
  title: string;
  description: string;
  amount: number;
  reason: string;
  votes: { judge: WalletRow; choice: Database["public"]["Enums"]["vote_choice"] }[];
  outcome: "favor_payer" | "favor_payee";
  evidence: Database["public"]["Tables"]["disputes"]["Insert"]["evidence"];
}): Promise<void> {
  const supabase = createServiceSupabase();
  const { buyer, seller, amount, outcome } = params;

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      payer_wallet_id: buyer.id,
      payee_wallet_id: seller.id,
      title: params.title,
      description: params.description,
      status: "disputed",
      amount_usdc: amount,
      metadata: { demo: true },
    })
    .select()
    .single();
  if (taskError || !task) throw new Error(`Seed task failed: ${taskError?.message}`);

  await insertRow(
    "quotes",
    { task_id: task.id, payee_wallet_id: seller.id, amount_usdc: amount, accepted: true },
    `${task.id}:quote`,
  );

  await insertRow(
    "validations",
    {
      task_id: task.id,
      outcome: "disputed",
      policy_pass: outcome === "favor_payer",
      task_pass: outcome === "favor_payer",
      sla_pass: true,
      rationale: params.reason,
    },
    `${task.id}:validation`,
  );

  await insertPayment({
    taskId: task.id,
    fromWalletId: buyer.id,
    kind: "escrow",
    status: "escrowed",
    amountUsdc: amount,
    label: `${task.id}:escrow`,
  });

  const { data: dispute, error: disputeError } = await supabase
    .from("disputes")
    .insert({
      task_id: task.id,
      opened_by_wallet: buyer.id,
      status: "voting",
      dispute_kind: "standard",
      reason: params.reason,
      evidence: params.evidence,
    })
    .select("id")
    .single();
  if (disputeError || !dispute) throw new Error(`Seed dispute failed: ${disputeError?.message}`);

  const fee = await computeFilingFee(buyer.id);
  await recordDisputeFiling({ disputeId: dispute.id, walletId: buyer.id, amountUsdc: fee.amount_usdc });

  for (const { judge, choice } of params.votes) {
    await insertRow(
      "judge_votes",
      {
        dispute_id: dispute.id,
        judge_wallet_id: judge.id,
        choice,
        rationale:
          choice === outcome
            ? "Sided with the winning position after reviewing the deliverable against the task spec and SLA."
            : choice === "abstain"
              ? "Insufficient evidence to decide either way."
              : "Sided with the losing position — outvoted by the panel majority.",
      },
      `${dispute.id}:vote:${judge.id}`,
    );
  }

  await resolveDispute(dispute.id, outcome);

  await insertPayment({
    taskId: task.id,
    ...(outcome === "favor_payer"
      ? { toWalletId: buyer.id, kind: "refund" as const }
      : { toWalletId: seller.id, kind: "release" as const }),
    status: outcome === "favor_payer" ? "refunded" : "released",
    amountUsdc: amount,
    label: `${task.id}:settlement`,
  });

  await payJudges(
    task.id,
    dispute.id,
    params.votes.map((v) => v.judge),
    0.5,
  );
}

async function seedFavorPayerDispute(buyer: WalletRow, seller: WalletRow, judges: WalletRow[]): Promise<void> {
  await seedStandardDisputeTask({
    buyer,
    seller,
    title: "Landing page copy rewrite",
    description: "Rewrite hero + 3 sections per the provided brand voice guide.",
    amount: 8,
    reason: "Delivered copy ignored the brand voice guide entirely — read as generic marketing filler.",
    outcome: "favor_payer",
    evidence: { demo: true },
    votes: [
      { judge: judges[0], choice: "favor_payer" },
      { judge: judges[1], choice: "favor_payer" },
      { judge: judges[2], choice: "favor_payee" },
    ],
  });
}

async function seedFavorPayeeDispute(buyer: WalletRow, seller: WalletRow, judges: WalletRow[]): Promise<void> {
  await seedStandardDisputeTask({
    buyer,
    seller,
    title: "Icon set for mobile app",
    description: "24 line-style icons, SVG, matching the provided style reference.",
    amount: 25,
    reason: "Buyer disputed style consistency; seller's published SLA only commits to the reference silhouette, not exact stroke weight.",
    outcome: "favor_payee",
    evidence: { demo: true },
    votes: [
      { judge: judges[0], choice: "favor_payee" },
      { judge: judges[1], choice: "favor_payee" },
      { judge: judges[2], choice: "favor_payer" },
    ],
  });
}

/** Escalated dispute: an initial 3-judge panel splits with no majority, so two more judges are added. */
async function seedEscalatedPanelDispute(buyer: WalletRow, seller: WalletRow, judges: WalletRow[]): Promise<void> {
  await seedStandardDisputeTask({
    buyer,
    seller,
    title: "Data migration script",
    description: "One-off script to migrate legacy CSV exports into the new schema.",
    amount: 40,
    reason: "Migrated records dropped a subset of rows silently — no error surfaced, discovered only on manual spot-check.",
    outcome: "favor_payer",
    evidence: {
      demo: true,
      panel: {
        escalated: true,
        initial_panel_size: 3,
        initial_result: "split — no 2-of-3 majority (1 favor_payer, 1 favor_payee, 1 abstain)",
        escalated_to: 5,
        final_tally: "3 favor_payer, 1 favor_payee, 1 abstain",
      },
    },
    votes: [
      { judge: judges[0], choice: "favor_payer" },
      { judge: judges[1], choice: "favor_payee" },
      { judge: judges[2], choice: "abstain" },
      { judge: judges[3], choice: "favor_payer" },
      { judge: judges[4], choice: "favor_payer" },
    ],
  });
}

async function seedPostApprovalContest(buyer: WalletRow, seller: WalletRow, judges: WalletRow[]): Promise<void> {
  const supabase = createServiceSupabase();
  const amount = 15.75;
  const acceptedAt = new Date();

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      payer_wallet_id: buyer.id,
      payee_wallet_id: seller.id,
      title: "Onboarding email sequence",
      description: "5-email drip sequence for new signups, matching the disclosed tone guide.",
      status: "accepted",
      amount_usdc: amount,
      accepted_at: acceptedAt.toISOString(),
      metadata: { demo: true },
    })
    .select()
    .single();
  if (taskError || !task) throw new Error(`Seed contest task failed: ${taskError?.message}`);

  await insertRow(
    "quotes",
    { task_id: task.id, payee_wallet_id: seller.id, amount_usdc: amount, accepted: true },
    `${task.id}:quote`,
  );

  await insertRow(
    "validations",
    {
      task_id: task.id,
      outcome: "approved",
      policy_pass: true,
      task_pass: true,
      sla_pass: true,
      rationale: "Auto-approved: all 5 emails present, tone-guide keywords matched threshold.",
      deliverable: { emails: 5, note: "Demo seed placeholder deliverable." },
    },
    `${task.id}:validation`,
  );

  await insertPayment({
    taskId: task.id,
    fromWalletId: buyer.id,
    kind: "escrow",
    status: "escrowed",
    amountUsdc: amount,
    label: `${task.id}:escrow`,
  });
  // Post-approval means the seller is already paid before any contest is filed.
  await insertPayment({
    taskId: task.id,
    toWalletId: seller.id,
    kind: "release",
    status: "released",
    amountUsdc: amount,
    label: `${task.id}:release`,
  });

  const { dispute_id: disputeId } = await filePostApprovalContest(
    task.id,
    buyer.id,
    "Auto-approve matched keyword thresholds, but 2 of the 5 emails used the wrong tone entirely — read as generic instead of the disclosed casual/technical mix.",
  );

  const votes: { judge: WalletRow; choice: Database["public"]["Enums"]["vote_choice"] }[] = [
    { judge: judges[0], choice: "favor_payer" },
    { judge: judges[1], choice: "favor_payer" },
    { judge: judges[2], choice: "favor_payee" },
  ];
  for (const { judge, choice } of votes) {
    await insertRow(
      "judge_votes",
      {
        dispute_id: disputeId,
        judge_wallet_id: judge.id,
        choice,
        rationale:
          choice === "favor_payer"
            ? "Tone mismatch confirmed against the disclosed guide — auto-approve missed it on keyword matching alone."
            : "Auto-approve's own criteria were satisfied; treating this as buyer taste rather than an SLA miss.",
      },
      `${disputeId}:vote:${judge.id}`,
    );
  }

  // Buyer wins: settles from the Treasury's insurance pool (resolveDispute
  // handles this via settleContestWin — never a seller clawback).
  await resolveDispute(disputeId, "favor_payer");

  await payJudges(task.id, disputeId, votes.map((v) => v.judge), 0.75);
}

const EXPECTED_TASK_COUNT = 5;

/**
 * Wipes this wallet's task/payment history (but not the wallet itself —
 * unlike newAccount's reset, testAccount's wallet is never deleted). Same
 * RESTRICT-FK ordering as lib/demo/reset.ts: judge_votes/disputes cascade
 * away with their task (disputes.task_id is ON DELETE CASCADE), but
 * payments are only ON DELETE SET NULL, so they're cleared explicitly.
 */
async function purgeDemoTestAccountHistory(walletId: string): Promise<void> {
  const supabase = createServiceSupabase();

  // Payments must be purged by task_id, not just from/to this wallet: judge_fee
  // and release payments settle to the seller/judge wallets, never to
  // testAccount's own wallet, so a from/to filter on this wallet alone misses
  // them entirely and they'd leak across reseeds forever.
  const { data: tasks } = await supabase.from("tasks").select("id").eq("payer_wallet_id", walletId);
  const taskIds = (tasks ?? []).map((t) => t.id);
  if (taskIds.length > 0) {
    await supabase.from("payments").delete().in("task_id", taskIds);
  }
  await supabase
    .from("payments")
    .delete()
    .or(`from_wallet_id.eq.${walletId},to_wallet_id.eq.${walletId}`);
  await supabase.from("tasks").delete().eq("payer_wallet_id", walletId);

  // buyer_dispute_stats is keyed by wallet_id, not task_id — since testAccount's
  // wallet persists across reseeds (unlike its tasks), the win/loss counters
  // would otherwise keep accumulating across every reseed instead of
  // reflecting only the disputes that currently exist. recordDisputeFiling
  // recreates this row from scratch (getOrCreateStats) on the next filing.
  await supabase.from("buyer_dispute_stats").delete().eq("wallet_id", walletId);
}

/**
 * Baseline marketplace inventory. Prices are graduated by rough
 * complexity/turnaround, all micro-task scale consistent with the
 * platform's own fee schedule (e.g. a $2 base filing fee, a 0.075%
 * happy-path skim) — except Data engineering, deliberately priced above
 * the $50 micro/large threshold (see arbitrationFeePct in
 * lib/estimator/fees.ts) so both contingent-fee tiers are actually
 * reachable from the live marketplace, not just the 2% micro tier.
 *
 * Categories span genuinely different domains on purpose — the Estimator's
 * matching (lib/estimator/marketplace.ts) is a keyword ILIKE against
 * title/description with no category taxonomy, so a narrow set of listings
 * means most real task descriptions fall through to its "no match, use
 * cheapest overall" fallback and get paired with irrelevant sellers. This
 * doesn't fix that fallback behavior — it can't, by itself, guarantee a
 * relevant match for every possible task — but it gives real matching a
 * fighting chance across the request types a demo is likely to try.
 */
const BASELINE_LISTINGS: {
  title: string;
  description: string;
  price_usdc: number;
  sla: Record<string, unknown>;
}[] = [
  {
    title: "Copywriting & content",
    description: "Web copy, email sequences, and marketing content matching your brand voice guide.",
    price_usdc: 12,
    sla: { turnaround_hours: 12, tone_match: true },
  },
  {
    title: "Market research report",
    description: "Structured research reports on any market or competitor set, delivered as a table.",
    price_usdc: 18,
    sla: { turnaround_hours: 24, revisions: 1 },
  },
  {
    title: "Research & Sourcing",
    description: "Real research: finds and compares sources, suppliers, or vendors for your request using live web search, delivered as a sourced findings list with confidence notes per source.",
    // Baseline/display price only — a Claude call + a few web searches costs
    // fractions of a cent to low tens of cents, nowhere near a flat $25.
    // What a buyer is actually charged is computed per-task from difficulty
    // + scope_quantity at quote and submission time (see
    // lib/agents/research-sourcing-pricing.ts); this value is just what
    // shows on the general /marketplace browse listing and feeds the
    // Estimator's blended cost average, priced for a moderate/typical task.
    price_usdc: 0.15,
    // `agent: "research-sourcing"` is the marker checked by
    // /api/tasks/[id]/deliver and the task detail page: this is the ONE
    // listing in the seed marketplace backed by a genuine, non-simulated
    // worker (lib/agents/research-sourcing.ts) — every other listing here
    // is placeholder inventory with no seller-side execution behind it at
    // all. See README.md "Simulated vs. real sellers" for the full picture.
    sla: { turnaround_hours: 6, min_sources: 3, agent: "research-sourcing" },
  },
  {
    title: "Icon & illustration design",
    description: "Custom icon sets and illustrations in SVG, matched to your style reference.",
    price_usdc: 28,
    sla: { format: "SVG", revisions: 2 },
  },
  {
    title: "Data engineering & scripts",
    description: "One-off scripts for data migration, cleaning, and transformation.",
    price_usdc: 65,
    sla: { turnaround_hours: 48, tested: true },
  },
];

/**
 * The Estimator (estimateSellerCost) requires at least 2 active listings to
 * produce any quote at all, and the marketplace page has nothing to show
 * without them — this is baseline marketplace inventory, not demo-account
 * history, so it's ensured unconditionally (not gated behind the task-count
 * short-circuit below) and used by real (non-demo) buyers too.
 *
 * BASELINE_LISTINGS is treated as the full declarative source of truth:
 * upserts by (seller_wallet_id, title), then prunes any of this seller's
 * listings whose title isn't in the current array. Matching by title means
 * a rename (not just a price/description edit) reads as "new listing" —
 * without the prune step that leaves the old title behind as an orphaned,
 * still-active duplicate. That's exactly what happened here once already:
 * renaming "Supplier sourcing & procurement" to "Research & Sourcing" left
 * the old listing sitting in the marketplace, matchable and selectable,
 * even though nothing referenced it from BASELINE_LISTINGS anymore.
 */
async function ensureSellerListings(sellerWalletId: string): Promise<void> {
  const supabase = createServiceSupabase();
  const { data: existing } = await supabase
    .from("listings")
    .select("id, title")
    .eq("seller_wallet_id", sellerWalletId);
  const existingByTitle = new Map((existing ?? []).map((l) => [l.title, l.id]));

  for (const l of BASELINE_LISTINGS) {
    const row = {
      seller_wallet_id: sellerWalletId,
      title: l.title,
      description: l.description,
      price_usdc: l.price_usdc,
      sla: l.sla as never,
      active: true,
    };
    const existingId = existingByTitle.get(l.title);
    const { error } = existingId
      ? await supabase.from("listings").update(row).eq("id", existingId)
      : await supabase.from("listings").insert(row);
    if (error) throw new Error(`Seed listing "${l.title}" failed: ${error.message}`);
  }

  const currentTitles = new Set(BASELINE_LISTINGS.map((l) => l.title));
  const staleIds = (existing ?? [])
    .filter((l) => !currentTitles.has(l.title))
    .map((l) => l.id);
  if (staleIds.length > 0) {
    const { error } = await supabase.from("listings").delete().in("id", staleIds);
    if (error) throw new Error(`Failed to prune stale listings: ${error.message}`);
  }
}

export async function ensureDemoTestAccountSeeded(): Promise<{ userId: string; walletId: string }> {
  const supabase = createServiceSupabase();
  const userId = await ensureUserId(DEMO_TEST_ACCOUNT_EMAIL);

  const wallet =
    (await getUserWallet(userId)) ?? (await createArcWalletForUser(userId, DEMO_TEST_WALLET_REF_ID));

  const marketplaceSeller = await ensureMarketplaceSellerWallet();
  await ensureSellerListings(marketplaceSeller.id);

  const seller = await ensureSyntheticWallet(SELLER);

  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("payer_wallet_id", wallet.id);
  if ((count ?? 0) === EXPECTED_TASK_COUNT) {
    return { userId, walletId: wallet.id }; // fully seeded already — never duplicate
  }
  if ((count ?? 0) > 0) {
    // A previous seed attempt died partway through (e.g. a concurrent
    // duplicate demo-login click racing this one) and, on an older version
    // of this function, wasn't cleaned up on the way out. Leaving that
    // behind would permanently wedge this account at "some tasks exist"
    // without ever completing — wipe it and redo cleanly.
    await purgeDemoTestAccountHistory(wallet.id);
  }

  const judges = await Promise.all(JUDGES.map((j) => ensureSyntheticWallet(j)));

  try {
    await seedCleanApprovedTask(wallet, seller);
    await seedFavorPayerDispute(wallet, seller, judges);
    await seedFavorPayeeDispute(wallet, seller, judges);
    await seedPostApprovalContest(wallet, seller, judges);
    await seedEscalatedPanelDispute(wallet, seller, judges);
  } catch (err) {
    // Don't leave a half-seeded account behind for the next attempt to get
    // stuck on — clear whatever this run managed to create before rethrowing.
    await purgeDemoTestAccountHistory(wallet.id);
    throw err;
  }

  return { userId, walletId: wallet.id };
}
