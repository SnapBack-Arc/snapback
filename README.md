## SnapBack

An agentic-economy escrow/payments demo on Arc Testnet: buyers describe a task in
plain language, get a quote against Marketplace listings, fund an escrow-backed
job, and the delivery goes through an automated buyer-agent validator with a
judge-panel dispute path if it fails.

### Simulated vs. real sellers

The payment/escrow/dispute/judge infrastructure is fully real and live on Arc
Testnet — real Circle wallets, real on-chain USDC locks, a real Claude-based
validator, real dispute filing and settlement. **Most seller listings in the seed
marketplace are simulated placeholder data**, though: they demonstrate that
infrastructure working end-to-end, but nothing executes their side of the work.
A task commissioned against one just sits funded until a deliverable is submitted
by hand (e.g. via `POST /api/validate`).

**Research & Sourcing is the one exception** — a genuine, non-simulated worker
agent (`src/lib/agents/research-sourcing.ts`). Selecting it as a seller and
clicking "Run agent" on the task detail page actually calls Claude with a real
`web_search` tool, researches the request for real, and submits a structured
deliverable (sourced findings with confidence notes) built only from sources it
actually found. That deliverable flows through the exact same validator →
approve/dispute → settlement pipeline (`runValidation` in
`src/lib/validator-service.ts`) that any other seller's submission would — there
is no special-casing in that pipeline. The only place this listing is treated
differently is the trigger itself: `src/app/api/tasks/[id]/deliver/route.ts`
checks for a `sla.agent === "research-sourcing"` marker on the listing before
invoking the worker (see `src/lib/listing-agents.ts`).

Adding another real worker for a different listing means writing an equivalent
agent module and marking its listing the same way — the validation/dispute/
settlement side needs no changes to support it.

**Pricing** — Research & Sourcing is priced from its actual cost: a
`claude-opus-4-8` research call, a low-effort structuring call, and a handful
of `web_search` calls. Per real Anthropic pricing (Opus 4.8: $5/$25 per MTok
input/output; web search: $10 per 1,000 searches), that's fractions of a cent
for a trivial single-search task up to roughly $0.20–0.30 for a large,
high-difficulty one — computed per task from the Estimator's parsed
`difficulty`/`scope_quantity`, not a flat fee (`src/lib/agents/
research-sourcing-pricing.ts`). The same function prices both what's quoted
at submission time and what's actually escrowed — they can't diverge. Every
other seed listing's price ($12–$65) is unaudited placeholder pricing with no
real cost basis behind it; those figures are plausible for their category
(freelance/gig-style work) but aren't tied to anything real the way Research
& Sourcing's now is.

**Candidate display** — because only one listing is backed by a real worker,
the task submission flow (`src/components/TaskSubmissionFlow.tsx`) never
shows a simulated listing as if it were a competing quote. If a request
keyword-matches Research & Sourcing, that's the only candidate shown (at its
real, per-task price), alongside two reserved placeholder slots noting the
system is designed to surface 3–5 live candidates once more worker agents
exist. If nothing matches Research & Sourcing, no listing is shown as
selectable at all — just the same two placeholder slots explaining that this
demo currently runs one real worker agent. This intentionally means a task
can't be submitted through this flow against a category with no real agent;
the general `/marketplace` browse page still lists every seed listing (with
its own "Real agent" badge), since browsing inventory and picking a candidate
for a specific task are different concerns.

**Source independence** — a real dispute exposed a gap where "3 sources"
could quietly mean the same underlying brand counted twice (a manufacturer
and its own disclosed distributor, listed as if they were two independent
suppliers). The agent (`src/lib/agents/research-sourcing.ts`) now
self-reports two extra fields per finding, decided during the same
structuring call that already sees every finding at once: `source_role`
(`"primary"` / `"distributor_or_reseller"` / `"uncertain"` — never forced to
guess) and `overlaps_with` (the exact `url` of another finding in the *same*
deliverable it traces back to the same brand as, or `null`). The listing's
SLA (`src/lib/demo/seed.ts`) now commits to `min_distinct_sources: 3` —
findings connected by `overlaps_with` group together and count as one toward
that minimum — alongside `distinctness_basis: "self_reported"`, disclosing
plainly that this is the agent's own read of what the source material says,
not an independently verified check.

**This catches disclosed overlap, not all overlap.** It only works when a
source's own page (or another finding's page) actually states the
relationship — exactly what happened live (a distributor's page named the
brand it resells). An undisclosed private-label/OEM relationship neither
page mentions is invisible to this check; the honest failure mode here is
false negatives (missed overlap), never false positives, since the agent is
explicitly told to use `"uncertain"`/`null` rather than infer a speculative
connection. Both the validator (`src/lib/validator.ts`) and the judge panel
(`src/lib/disputes/judge-panel.ts`) read the identical `listings.sla` value
and apply the identical grouping rule in their system prompts, verified live
to reach matching conclusions independently (see below) — no drift between
what's checked pre-approval and what a dispute re-checks.

Live-tested end-to-end, unprompted for the outcome either way: one real run
found 4 genuinely independent primary manufacturers and passed; a second
real run (plainer task phrasing, same category) had the agent's own report
flag Good Start Packaging as a disclosed Vegware distributor, populated
`source_role`/`overlaps_with` correctly, and the validator correctly
rejected it citing `min_distinct_sources` by name — which auto-filed a
standard dispute whose judge panel then reached the identical unanimous
conclusion independently, using the same grouping logic, essentially
verbatim. **Known tradeoff, not a bug:** in a category where genuinely
independent primary sources are scarce relative to what's requested, this
now produces a real, correct validation failure instead of silently
accepting an inflated source count — which means a live demo run in such a
category is no longer guaranteed to sail through on the first attempt.

### Fee model (Phase 4)

Every quote is fee-inclusive (`src/lib/estimator/fees.ts`), three components
folded into or disclosed alongside the headline `guaranteed_total_usdc`:

- **Platform fee** — 0.075% of the seller's quoted job cost (`happyPathFeePct`),
  a buyer-side skim on top of the seller's price, routed to Treasury.
- **Validation fee** — a flat $0.03 (`validationFeeUsdc`), recovering the real
  cost of the buyer-agent validator's LLM call. Charged on every task
  regardless of approve/reject, since that call always runs exactly once.
- **Dispute contingency** — 2% of job cost for jobs under $50 seller-cost-estimate,
  1% at or above it (`arbitrationFeePctMicro`/`arbitrationFeePctLarge`,
  threshold `microTxThresholdUsdc`). Disclosed but never folded into
  `guaranteed_total_usdc`; held as a refundable escrow holdback rather than
  charged outright.

All three are collected as **one real Circle transfer, buyer → Treasury**, at
task-funding time — not just `payments` rows with no matching on-chain
movement (`creditSessionToTask` in `src/lib/estimator/service.ts`). The
platform and validation fees are unconditional and marked `released`
immediately; the contingency is marked `escrowed` and settled for real later —
refunded in full on clean completion or a buyer-won dispute, kept as real
Treasury revenue only on a buyer-lost dispute
(`settleDisputeContingency`/`sweepUncontestedContingencies` in
`src/lib/disputes/service.ts`).

### Dispute resolution: the real judge panel

**`runJudgePanel()` (`src/lib/disputes/judge-panel.ts`) is the real,
live, fully off-chain dispute-resolution path — pure Claude API calls, no
blockchain involved — and it runs automatically on every dispute, both a
standard validator-filed dispute and a buyer-filed post-approval contest:**

- **Tier 1** (first attempt, every dispute): 2× `claude-opus-4-8` @ high effort
  + 1× `claude-sonnet-5` @ high effort, fully independent — no judge sees
  another's vote or reasoning. Resolution requires all three to agree
  (unanimous); any split, including 2–1, escalates. A judge call that fails
  outright (refusal, API error, unparseable output) is recorded as an
  `abstain` and also escalates — it is never retried at this tier.
- **Tier 2** (escalation only, on any tier-1 split or failure): a fresh,
  disjoint panel of 3× `claude-opus-4-8` at varying effort + 2× `claude-sonnet-5`
  @ high effort. Resolution requires a majority (≥3 of 5 agreeing), not
  unanimity. A failed slot is retried once; if it still fails it's recorded
  as `abstain` and the majority is evaluated over whatever real votes exist.

Both tiers' votes persist as real `judge_votes` rows on the same dispute (up
to 8 total on an escalated dispute — see `supabase/migrations/0016_judge_panel.sql`).

**No admin fallback — a deterministic tie-break resolves every remaining
case automatically.** If tier 2 also fails to reach a clean ≥3 majority
(e.g. a 2–2 tie after a permanent slot failure, or all 5 calls failing
outright), `runJudgePanel` decides instead of leaving the dispute stuck in
`voting`: a `standard` dispute favors the **buyer** (the seller was claiming
their delivery earned payment; an inconclusive panel hasn't met that
burden), a `post_approval_contest` favors the **seller** (the buyer was
claiming a refund on work already paid out; same burden-of-proof logic,
opposite direction). There is no admin manual-override route anymore —
every dispute resolves automatically, no exceptions, no human in the loop.

Whichever way a dispute resolves — tier-1 unanimous, tier-2 majority, or the
tie-break — settlement goes through `resolveDispute` (`src/lib/disputes/
service.ts`), which for a `standard` dispute makes a real on-chain call:
`SnapBackEscrow.resolveDispute` is `onlyArbiter`, and `arbiter` is a
Circle-managed app wallet (`contracts/script/SetArbiterToAppWallet.s.sol`,
`scripts/provision-arbiter-wallet.ts`, `lib/app-wallets.ts`'s
`ensureArbiterWallet`) that `resolveDispute` signs
`resolveDispute(jobId, favorBuyer, reason)` with directly (`lib/escrow.ts`'s
`resolveJobDispute`) before touching any off-chain row. This on-chain call
only applies to `standard` disputes — a `post_approval_contest` never froze
anything on-chain (the seller was already auto-paid), so a buyer win there
settles from Treasury's insurance pool instead. Every real money-moving step
here — the on-chain call, the filing-fee refund, the dispute-contingency
refund, and the insurance-pool payout — runs through a shared retry-safe
helper (`src/lib/disputes/settlement.ts:runSettlementLeg`); see "Settlement
retry-safety" below.

### Settlement retry-safety

Every real money-moving call during dispute resolution (the on-chain
arbiter call, the filing-fee refund, the dispute-contingency refund, and
the insurance-pool payout) is a Circle `createContractExecutionTransaction`
call, which has a real ambiguous-failure mode: if the request reaches Circle
and a transaction is genuinely created, but the response is lost before this
app reads it (timeout, connection reset), the call throws with **no local
record that anything was submitted**. Circle supports exactly this case via
a caller-supplied `idempotencyKey` — reusing the same key on a retry
"is treated as the same request and the original response will be
returned" — but nothing in this app passed one before this fix, so a naive
retry risked a second real submission.

`runSettlementLeg` (`src/lib/disputes/settlement.ts`) fixes this: before the
first attempt of a settlement leg, it generates a UUID and persists it to
`disputes.settlement_state.<leg>` **before** submitting, and persists the
returned Circle transaction id **before** waiting for confirmation. A retry
after any failure resumes rather than blind-resubmits — no tx id yet, retry
submits with the *same* idempotency key; a tx id exists, retry re-polls the
*same* tx id unless it's confirmed genuinely dead (reverted/denied/
cancelled/stuck), in which case the tx id is abandoned and a fresh
idempotency key is generated for the next attempt. Bounded at 3 attempts
with backoff; if none succeed, the dispute is marked `settlement_failed` —
not left in `voting` — a distinct status meaning a genuine Circle/chain
infra failure needs a human to check state directly, surfaced passively (no
action button) in the "Disputes in progress" panel on `/admin`.

**`JudgeRegistry.sol` is a separate, dormant on-chain contract — not the
system described above.** Its `selectPanel()` is `onlyOwner`, gated by a
local Foundry deployer keystore (`--account snapback-deployer
--password-file ...`), not a Circle-managed wallet, and the real on-chain
judge pool has zero staked judges today, so the call would revert regardless.
The webhook receiver (`src/app/api/webhooks/circle/route.ts`) reflects
`PanelSelected`/`VoteCast`/`VerdictReached` if they ever fire, but nothing in
this app ever calls `selectPanel` — it's an unused on-chain design, entirely
separate from the real off-chain panel above.

### Post-approval contest

A buyer can contest a delivery the validator already **auto-approved** —
distinct from a standard dispute, which the system auto-files itself on a
validator rejection. Filing a contest (`filePostApprovalContest` in
`src/lib/disputes/contest.ts`, `POST /api/tasks/[id]/contest`,
`ContestDeliveryButton.tsx`):

- Only within a window after auto-approval — 24h by default
  (`contestWindowHours`, `POST_APPROVAL_CONTEST_WINDOW_HOURS`).
- Charges a flat filing fee of **50% of the task's full guaranteed quote**
  (`computeContestFee`, `CONTEST_FEE_PCT` in `src/lib/disputes/service.ts`) —
  a deterrent against contesting lightly, not a risk-priced charge. Refunded
  in full on a win, kept as real Treasury revenue on a loss.
- Requires a specific written objection, not just a click — minimum 20
  characters, enforced both client-side and re-validated server-side — behind
  a typed `CONFIRM` gate before it submits.

A contest reuses the exact same `disputes`/`judge_votes` tables and the same
real judge panel described above, tagged `dispute_kind = 'post_approval_contest'`.
The buyer's objection text is injected into the judge panel's evidence prompt
labeled **`BUYER'S STATED OBJECTION:`**, versus **`DISPUTE REASON:`** for a
standard dispute — the same shared `buildEvidence()` function
(`src/lib/disputes/judge-panel.ts`), just a relabeled line. The panel weighs
it as context alongside the SLA and delivered work; it does not gate on it —
there's no keyword match or automatic accept based on the objection text
alone.

### Contest resolution feedback

Once a contest resolves — win or loss — the buyer sees a short outcome box in
the same page slot the "Contest this delivery" button occupied
(`ContestResolutionFeedback` in `src/app/tasks/[id]/page.tsx`): the outcome
("Contest successful"/"Contest unsuccessful"), one line of reasoning, and the
fee outcome (refunded/forfeited). The one-line reasoning is condensed from
already-stored data — the decisive tier's `judge_votes.rationale`, first
sentence of the first vote agreeing with the final outcome
(`condenseJudgeReason`, same file) — **no new LLM call**. If no votes exist
yet, or none of the decisive tier's votes actually match the recorded outcome
(e.g. an admin force-resolve that overrode what the panel voted), it falls
back to a generic line rather than guessing or crashing.

This is separate from the existing, richer `educational_feedback` box (a real
Claude call — `generateEducationalFeedback`, `src/lib/disputes/feedback.ts`,
invoked from `settleContestWin` in `src/lib/disputes/service.ts`) that
already renders further down the page specifically on a contest **win**
(gap summary + rewritten-spec suggestions). That box is untouched: on a win,
both boxes now render; on a loss, the short box is the only feedback shown,
where previously there was none.

### Event-driven state (no keeper/cron)

Nothing schedules quote-escrow sweeps, validator runs, or judge draws — there
is no cron/keeper process anywhere in this app. Instead, on-chain state is
observed via Circle Contract Event Monitoring + wallet transaction webhooks,
delivered to a single receiver: `src/app/api/webhooks/circle/route.ts`. It
verifies `X-Circle-Signature` (`src/lib/webhooks/signature.ts`) before trusting
anything, then dispatches by `notificationType`
(`src/lib/webhooks/handle-notification.ts`):

- `contracts.eventLog` — SnapBackEscrow/JudgeRegistry events, decoded against
  the ABI fragments in `src/lib/webhooks/events.ts`. This is what confirms an
  on-chain action actually took effect (funded, submitted, released, disputed,
  refunded, judge votes/verdicts) and reconciles `payments`/`tasks` status
  accordingly — including `DisputeResolved`, which flips the escrow
  `payments` row to `refunded`/`released` off the event's `favorBuyer` flag.
  Every observed event is also logged to `job_events`, which the task detail
  page renders as a small on-chain activity feed.

  For a force-resolved `standard` dispute, this event is now the direct
  result of the same admin action that updates the `disputes` row
  (`lib/disputes/service.ts:resolveDispute` calls
  `SnapBackEscrow.resolveDispute` on-chain as the contract's `arbiter`
  *before* touching any off-chain row — see the priority-fix note there),
  so the two stay in sync. **Known limitation:** this webhook path is still
  the only thing that would reconcile `payments` for a *real* judge-panel
  verdict (once JudgeRegistry has staked judges — see below); that path
  would settle funds correctly but leave its `disputes` row permanently
  `open` with no outcome recorded and no effect on buyer abuse stats,
  since nothing but the admin route updates those today. Deferred until
  the judge pipeline is actually live.
- `transactions.*` — wallet-level tx status, correlated against `payments`
  rows that carry a `circle_tx_id` (today: `lib/x402.ts`, the Gateway deposit
  route). Used to catch a transaction that actually failed on-chain (flips
  `payments.status` to `'failed'` instead of leaving it silently stuck
  `'escrowed'`/`'pending'` forever) and to backfill `tx_hash`.

**The task detail stepper** updates live from webhook-driven `job_events`/
`payments` writes, with a client-side poll (`TaskLiveUpdates`, 6s, only while
the task isn't in a settled stage) as the fallback for a delayed or missed
delivery — Circle's webhooks are at-least-once but not guaranteed instant.

**The 15-minute session-abandonment sweep** has no on-chain event to key off
(it's a pure time-based idle check on an off-chain `estimator_sessions` row).
Rather than leave it silently unscheduled, `submitQuoteRequest`
(`src/lib/estimator/service.ts`) checks the buyer's own active session's age
every time they submit *any* quote request and sweeps it first if it's past
the abandonment window — the same outcome a cron would produce, triggered by
the next natural touchpoint instead. A session whose buyer never comes back at
all stays un-swept until an admin clicks "Sweep all abandoned now"
(`/admin`) — a known, accepted limitation of check-on-next-request over cron.

**Setup** — `npm run webhooks:setup` (see `scripts/circle-webhooks-setup.ts`
for the full flow: registers the notification subscription, imports both
contracts into Circle Contracts, creates one event monitor per event). It's
idempotent, so re-running it after the public URL changes just updates the
subscription's endpoint. Webhooks require a publicly reachable HTTPS URL —
there's no Vercel deployment yet, so for now:

```bash
npm run dev              # terminal 1
ngrok http 3000          # terminal 2 — copy the https:// forwarding URL
WEBHOOK_PUBLIC_URL=https://<your-subdomain>.ngrok-free.app npm run webhooks:setup
```

Re-run the last command whenever the ngrok URL changes (a new `ngrok http`
session gets a new random subdomain on the free tier). Once this app has a
real Vercel deployment, set `WEBHOOK_PUBLIC_URL` to that deployment's URL
instead and re-run the setup script once per domain change — preview URLs
rotate per-deploy, so this is a production/custom-domain-only setup, not
something to re-run per preview.

### Known limitations

- **No evidence/rebuttal submission during an open dispute.** Once a dispute
  is open (buyer-filed, seller auto-disputed by the validator, or a
  post-approval contest), neither party has a way to actively submit
  additional evidence or a rebuttal before it's resolved — both sides are
  passive once filed. This applies symmetrically to buyers and sellers; it
  isn't specific to validator rejections (sellers already get judge-reviewed
  disputes at zero cost on every rejection, so no separate seller-side
  contest path is needed — see `src/lib/disputes/contest.ts`'s docblock for
  why that asymmetry only exists on the buyer/auto-approve side). Noted as a
  future improvement, not built yet.
- **The admin dashboard's treasury discrepancy note is now stale, and its
  kept-revenue total undercounts.** `getTreasuryOverview`
  (`src/lib/admin-data.ts`) still surfaces a `discrepancyNote` claiming no
  revenue line has a matching on-chain transfer — no longer true since the
  Phase 4 fee model above made platform, validation, and contingency fees
  real Circle transfers. Separately, `totalKeptRevenueUsdc` omits the
  validation fee entirely and any settled/forfeited dispute-contingency
  holdback — both are real kept revenue with no corresponding line in
  `revenueLines` or the total.
- **`settlement_failed` disputes have no staleness alert.** A dispute that
  exhausts `runSettlementLeg`'s bounded retries (genuine Circle/chain infra
  failure, not a judgment call — see "Settlement retry-safety" above) is
  invisible until an admin manually opens `/admin` —
  `listOpenDisputesForAdmin` (`src/lib/admin-data.ts`) is a plain worklist
  query, not a proactive notification of any kind. Same underlying gap the
  old tier-2-fallback note used to describe here, now against a narrower,
  rarer trigger since the deterministic tie-break resolves every ordinary
  no-majority case automatically.
- **The sweep-path dispute-contingency refund still isn't retry-safe.**
  `sweepUncontestedContingencies`'s clean-completion refund (a task that
  auto-approved with no contest ever filed) calls the older
  `refundOrReleaseHeldPayment` (`src/lib/disputes/service.ts`) — no
  idempotency key, no persisted tx id, same ambiguous-failure risk every
  other real transfer in this app used to have. Every dispute-triggered
  refund (filing fee, contingency-on-a-resolved-dispute, insurance payout)
  now goes through the retry-safe `runSettlementLeg` path instead, keyed on
  `disputes.settlement_state` — but this one has no dispute row to key
  retry state against (a clean completion never opens a dispute), so it's
  structurally harder to fix without a different state-storage approach.
  Disclosed, not silently inconsistent with the rest of this section.
- **Genuine buyer wins are hard to reach organically through the real
  contest path.** The judge panel's system prompt holds that "the seller is
  accountable ONLY for what their SLA actually promised" — combined with the
  current Research & Sourcing SLA's low bar (≥3 sources, 6-hour turnaround),
  almost any competent delivery clears it, so judges consistently treat a
  buyer's broader expectation as scope creep rather than a seller failure.
  Several live-tested contests this week, across a range of framings (a
  missing item, a strict format requirement, two genuine spec-ambiguity
  arguments), all resolved unanimously in the seller's favor at tier 1. This
  is disclosed here rather than hidden, consistent with the honesty
  principle used throughout this project.

---

This is a Next.js project bootstrapped with `create-next-app`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Geist, a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
