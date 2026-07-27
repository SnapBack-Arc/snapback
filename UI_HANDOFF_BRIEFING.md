# SnapBack — UI Integration Briefing

This document is a self-contained handoff for a frontend contributor about to
redesign SnapBack's UI on a separate branch. You don't need any prior context
on this project — everything you need to not break real functionality while
freely redesigning the visuals is below.

---

## 1. What SnapBack is

SnapBack is a dispute-resolution and escrow safety layer for agent-to-agent
USDC payments, with an AI judge panel that settles disagreements
autonomously — built on Arc (Circle's EVM testnet).

Concretely: a buyer describes a task in plain language, gets a quote, funds
an escrow-backed job, and the delivery goes through an automated
buyer-agent validator with a judge-panel dispute path if it fails. The
payment/escrow/dispute/judge infrastructure is fully real — real Circle
wallets, real on-chain USDC locks, a real Claude-based validator, real
dispute filing and settlement — demonstrated end-to-end against **one real
integration** ("Research & Sourcing" — an agent that does live web research
via Claude), not a marketplace of many simulated listings. Everywhere the
app would show a second/third competing seller, it instead shows a visibly
non-interactive placeholder rather than pretending a fake listing is real —
this "disclosed, not hidden" principle matters for the redesign too (see
§4, point 7).

---

## 2. Tech stack, exact and current

- **Next.js 16.2.10**, App Router (`src/app/`), all real routes are Server
  Components by default; interactive pieces are separate `"use client"`
  components.
  - **⚠️ This Next.js version is newer than your training data and has
    breaking API/convention changes.** Before writing routing, data-fetching,
    or server/client-boundary code, check `node_modules/next/dist/docs/` in
    this repo rather than assuming you already know the API.
- **React 19.2.4** / **react-dom 19.2.4**.
- **TypeScript 5**, `strict: true`.
- **Tailwind CSS v4** — CSS-first config, no `tailwind.config.js`. Everything
  lives in `src/app/globals.css`: `@import "tailwindcss";` plus an
  `@theme inline` block mapping `--color-background`/`--color-foreground` to
  CSS vars, dark-mode override via `@media (prefers-color-scheme: dark)`.
  Built via `@tailwindcss/postcss`.
- **No UI component library.** Every component is hand-written JSX with raw
  Tailwind utility classes. No shadcn/Radix/Headless UI/MUI. The existing
  visual language is a dark `zinc-950/900/800` palette with `emerald`
  (primary actions/success), `amber` (costly/warning actions), `cyan`
  (real-agent/validator), `red` (danger/loss), and `violet`/`pink`/`blue`
  used for the agent-roster monogram colors (`AGENT_COLOR` in
  `AgentRoster.tsx`). You're free to redesign this entirely.
- **Fonts**: Geist Sans + Geist Mono via `next/font/google`, set as CSS vars
  on `<html>` in `src/app/layout.tsx`.
- **Auth**: custom, not NextAuth and not Supabase Auth. Real login uses
  Circle's `@circle-fin/w3s-pw-web-sdk` (a hosted email-OTP widget loaded
  client-side) plus a signed session cookie (`src/lib/session.ts`). Demo mode
  bypasses this with a fixed-account dropdown (see §4).
- **Supabase**: `@supabase/supabase-js`, but only ever used server-side via a
  **service-role client** (`createServiceSupabase()` in
  `src/lib/supabase/server.ts`). There is no client-side Supabase usage and
  no reliance on Row Level Security — access control is enforced entirely in
  application code (`src/lib/admin.ts`, session checks on every page).
- **Chain/wallets**: `viem` (read-side chain calls), Circle's
  `developer-controlled-wallets`, `user-controlled-wallets`,
  `smart-contract-platform`, and `w3s-pw-web-sdk` (client OTP widget) SDKs,
  plus `@x402/evm` / `@circle-fin/x402-batching` for the one real external
  payment (Parallel search API, on Base mainnet — separate from Arc).
- **LLM**: `@anthropic-ai/sdk` — used server-side only, for the validator,
  the judge panel, and the Research & Sourcing worker agent. Not called from
  any client component.

---

## 3. Every user-facing page/route that exists today

All non-login, non-admin pages require a session (redirect to `/login` if
none) and most require a generated Arc wallet (redirect to `/dashboard` if
none). "Buyer"/"Seller" below refers to the logged-in wallet's role **on a
given task**, not a fixed account type — the same wallet can be a buyer on
one task and, in principle, a seller on another.

| Route | File | Shows | Who |
|---|---|---|---|
| `/login` | `src/app/login/page.tsx` | Email/OTP sign-in (or, in demo mode, a fixed-account dropdown) | Anyone unauthenticated |
| `/` | `src/app/page.tsx` | "Commission a task" — the task submission/quote/pay flow (`TaskSubmissionFlow`) | Any logged-in wallet holder |
| `/tasks` | `src/app/tasks/page.tsx` | List of the current wallet's tasks (as buyer or seller), status pills, linked disputes | Any logged-in wallet holder |
| `/tasks/[id]` | `src/app/tasks/[id]/page.tsx` | Full task detail: lifecycle stepper, agent roster, payments, validator runs, disputes, contest/claim-expired actions | Buyer or seller on that specific task |
| `/marketplace` | `src/app/marketplace/page.tsx` | Browse active listings (today: the one real Research & Sourcing listing) | Any logged-in wallet holder |
| `/dashboard` | `src/app/dashboard/page.tsx` | Wallet page: generate wallet, balances, faucet link, Gateway deposit | Any logged-in wallet holder |
| `/payments` | `src/app/payments/page.tsx` | Table of the wallet's payment history with on-chain tx links | Any logged-in wallet holder |
| `/admin` | `src/app/admin/page.tsx` | Treasury balances/revenue, disputes-in-progress (passive), sweep feed, real Parallel spend, demo-account reset | Admin-allowlisted wallet only |
| `/admin/history` | `src/app/admin/history/page.tsx` | Read-only list of buyers with task counts | Admin-allowlisted wallet only |
| `/admin/history/[walletId]` | `src/app/admin/history/[walletId]/page.tsx` | Read-only expandable "story" timeline per task for one buyer | Admin-allowlisted wallet only |
| `/admin/users` | `src/app/admin/users/page.tsx` | Searchable user list with volume/dispute counts, flagged status | Admin-allowlisted wallet only |
| `/admin/users/[walletId]` | `src/app/admin/users/[walletId]/page.tsx` | One user's full detail: flag/unflag, active session sweep, per-task admin actions (re-run validator, re-run agent, trigger autoRelease), payments, disputes | Admin-allowlisted wallet only |

The `/admin/*` pages are wrapped by `src/app/admin/layout.tsx`, which calls
`requireAdmin()` and redirects non-admins to `/dashboard` before rendering
anything.

---

## 4. PURE UI vs LOAD-BEARING — read this before touching anything

### Pure presentation (safe to fully redesign)

These have no business logic beyond "call this existing fetch/prop, render
it." Restyle, rearrange, rebuild the JSX/CSS freely — just keep calling the
same functions/routes with the same argument shapes.

- **`Nav.tsx`** — nav links + sign-out. Sign-out logic is just
  `DELETE /api/auth/session` → redirect to `/login`; keep that call, restyle
  everything else.
- **`AgentRoster.tsx`** — pure list renderer (monogram + role + description).
  Zero logic; the `AgentEntry[]` it receives is built elsewhere.
- **`WalletDashboard.tsx`** — wallet generation, balance display, Gateway
  deposit form. Logic is thin CRUD around three fetches
  (`/api/wallet/generate`, `/api/wallet/balances`,
  `/api/wallet/gateway/deposit`); redesign freely, keep those three calls and
  their request/response shapes.
- **`TaskHistoryAccordion.tsx`** (admin) — explicitly read-only; only local
  expand/collapse state, no API calls, no audit-log writes. Renders via
  `buildTaskTimeline()`/`deriveOutcomeLabel()`/`outcomeBadgeClass()` from
  `src/lib/admin-history-format.ts` — call those, don't reimplement the
  timeline logic inline.
- **`DeliverButton.tsx`** — triggers `POST /api/tasks/[id]/deliver` and
  swaps button text after a 4s timer (because judge-panel calls on a
  disputed delivery can take 4–12s). Keep the fetch + `router.refresh()` and
  some "this is taking a while" affordance; the visual chrome is free to
  redesign.
- **`DisputeEvidenceForm.tsx`** — textarea + submit to
  `POST /api/tasks/[id]/disputes/[disputeId]/evidence`. The 20-char minimum
  is a UX nicety (also enforced server-side); keep the hint, restyle freely.
- **`FlagUserForm.tsx` / `InsurancePoolForm.tsx`** (admin) — thin wrappers
  around `ConfirmAction`; redesign the inputs/layout, keep the payload shapes
  (`{reason}` and `{direction, amount_usdc, reason}`) matching their API
  routes.
- Most page-level list/table rendering (`/tasks`, `/payments`,
  `/marketplace`, `/admin/users`, `/admin/history`) — these are thin
  fetch-and-map. The `src/lib/*` functions they call
  (`getTasksForWallet`, `getPaymentsForWallet`, `getActiveListings`,
  `listUsersForAdmin`, `listBuyersWithTaskHistory`, `getUserDetail`, …) are
  the load-bearing part; don't touch those, but the JSX around their results
  is entirely yours.

### Load-bearing (contains real logic — preserve behavior, restyle output freely)

**1. `deriveStage()` and the `Stage` type — `src/app/tasks/[id]/page.tsx`**

```ts
type Stage = "quoted" | "escrowed" | "validated" | "approved" | "disputed" | "settled" | "refunded";
```

`deriveStage(task: TaskDetail)` computes the task's *effective* lifecycle
stage from real data, in this exact precedence order — `tasks.status` alone
is not trustworthy because it's never advanced past `"disputed"` once a
dispute resolves:

1. If there's a dispute at all → `"settled"` if its `status === "resolved"`,
   else `"disputed"` (using the most-recently-created dispute).
2. Else if `task.validations.length > 0` → `"approved"`.
3. Else if any `escrow`-kind payment has `status === "refunded"` →
   `"refunded"` (only `ClaimExpired`/reclaim paths set this outside the
   dispute-resolved case, already handled above).
4. Else if there's an `escrow`-kind payment, or `task.status !== "assigned"`
   → `"escrowed"`.
5. Else → `"quoted"`.

**Do not change this function's logic or the `Stage` values.** The
`Stepper` component that renders it is 100% restylable — colors, shape,
animation, layout — as long as it keeps taking a `stage: Stage` prop and
keeps distinguishing "done" / "current" / "disputed-override" /
"refunded-override" the way it does today (disputed/refunded render as a
colored override on top of an index into `STAGE_ORDER`, they aren't part of
the 5-step base sequence `quoted → escrowed → validated → approved →
settled`).

**2. `ContestDeliveryButton.tsx` — the buyer's typed-CONFIRM money-moving action**

A buyer can contest a delivery the validator already **auto-approved**. This
is a real state machine (`collapsed → form → confirm`) with:
- A required objection of ≥20 characters (`MIN_REASON_LENGTH`), enforced
  client-side here and re-validated server-side.
- A typed `CONFIRM` gate: the submit button is disabled unless the user
  types the literal string `CONFIRM` into a text input.
- `POST /api/tasks/[id]/contest` with body `{ reason, confirmText }`.
- A fee, computed by `computeContestFee(guaranteed_total_usdc)` in
  `src/lib/disputes/service.ts` = flat 50% of the task's guaranteed total —
  charged regardless of outcome, refunded on a win.

Its visibility on the task page is gated by:
```ts
canContest = role === "Buyer" && stage === "approved" && !latestDispute &&
             contestDeadline !== null && isBeforeDeadline(contestDeadline);
// contestDeadline = task.accepted_at + contestWindowHours() (default 24h,
// env POST_APPROVAL_CONTEST_WINDOW_HOURS)
```
**Preserve**: the 3-step flow, the 20-char minimum, the exact typed-`CONFIRM`
gate, the request body shape, and the `canContest` gating logic (don't show
this button under different conditions). Restyle every pixel of it freely.

**3. `ClaimExpiredButton.tsx` — the buyer's refund-for-unresponsive-seller action**

Same typed-`CONFIRM` pattern, no reason field (nothing to explain — the
seller just never delivered). Two states: pre-eligibility (disabled,
shows the date it unlocks) and post-eligibility (confirm gate →
`POST /api/tasks/[id]/claim-expired`, no body). Eligibility is
`Date.now() >= expiredAtIso`, computed once via a lazy `useState`
initializer. Rendered on the task page only when
`role === "Buyer" && stage === "escrowed" && jobId` (via
`resolveEscrowExpiredAt()`). **Preserve** the confirm gate and the
eligibility condition; restyle freely.

**4. The shared typed-CONFIRM pattern — `admin/ConfirmAction.tsx`**

Every admin action that moves funds or changes state (`FlagUserForm`,
`InsurancePoolForm`, sweep/revalidate/auto-release buttons in
`/admin/users/[walletId]`, the sweep-abandoned and demo-reset buttons on
`/admin`) goes through this one component: collapsed button → expands to an
input that must contain exactly `CONFIRM` before the real request fires
(`POST` to whatever `url` prop was passed, body `{...body, confirmText}`).
The server independently re-checks `confirmText` on every `/api/admin/*`
route — this component is the UX, not the actual enforcement — but **the
requirement that a user type `CONFIRM` before any destructive/costly action
fires must survive** in whatever new design replaces this component's
visuals.

**5. Buyer/seller/admin visibility gating**

All real access control is server-side and redirect-based — hiding a button
in a redesign does not, by itself, protect anything, but you also must not
rely on client-side conditionals as if they were the boundary:

- Every page: `getSession()` → redirect `/login` if absent.
- Wallet-scoped pages: redirect `/dashboard` if no wallet yet.
- `role = task.payer_wallet_id === wallet.id ? "Buyer" : "Seller"` on the
  task detail page — drives which of `DeliverButton` /
  `ContestDeliveryButton` / `ClaimExpiredButton` / the resubmit link render.
- **Admin**: `requireAdmin()` (pages, via `admin/layout.tsx`) and
  `requireAdminApi()` (every `/api/admin/*` route) both independently check
  a wallet-address allowlist (`ADMIN_WALLET_ADDRESSES` env var) —
  `src/lib/admin.ts`. This is real, server-enforced access control, not a
  hidden-nav-link convention. **Do not add any admin-only UI reachable
  outside `/admin/*` pages or `/api/admin/*` routes** — both already
  re-check the allowlist regardless of how a user navigates there, so
  routing around the existing pages would not actually grant access, but it
  would create a confusing dead end.

**6. `TaskLiveUpdates.tsx` — webhook-driven live state**

Real on-chain confirmations arrive via a Circle webhook receiver
(`src/app/api/webhooks/circle/route.ts`) that writes `job_events`/`payments`
rows server-side, entirely independent of anything in the browser. This
component is *only* the client-side nudge to re-fetch that server state —
`useEffect` that calls `router.refresh()` every 6 seconds, armed only while
`active` (the task isn't `"settled"`/`"refunded"`). **Preserve**: its
presence on the task detail page, and the `active` prop wired to
`stage !== "settled" && stage !== "refunded"`. Removing it would make the
stepper/payments list go stale until the user manually reloads, since
webhooks land server-side with no push mechanism to the client.

**7. Demo-mode conditional rendering**

Three places check `NEXT_PUBLIC_DEMO_MODE=true` (server-side via
`isDemoModeEnabled()` in `src/lib/demo/config.ts`, client-side via the same
raw env read since it's a `NEXT_PUBLIC_` var) — **all must keep reading the
same single flag, don't introduce a second demo-mode condition**:

- `src/app/layout.tsx` — a small low-opacity "SB" link, bottom-right corner,
  linking to `/admin`. Pure navigation convenience — `requireAdmin()`'s
  allowlist check still fully applies once there. Only show this in demo
  mode; its absence doesn't change who can reach `/admin`.
- `LoginForm.tsx` — in demo mode, the email `<input>` becomes a `<select>`
  of fixed demo accounts (today: only `testAccount@snapback.com`), and
  selecting one calls `POST /api/auth/demo` instead of the real Circle
  email-OTP flow (`W3SSdk`, `/api/auth/device-token`, `/api/auth/session`).
  **These are two structurally different code paths** — when demo mode is
  off, the real OTP flow must be completely untouched; a redesign should
  not make it possible for a non-demo build to accidentally hit
  `/api/auth/demo`.
- `admin/page.tsx` — the "Demo test account" reset section (wipes
  `testAccount@snapback.com`'s history back to seeded baseline).

**8. `isResearchSourcingListing()` gating in `TaskSubmissionFlow.tsx`**

Only one listing in this app is real (a live Claude + web-search worker);
everything else in that category slot is an intentionally
non-interactive, dashed-border `PlaceholderSlot`. The flow checks
`isResearchSourcingListing(matchedListing.sla)` before ever showing a
listing as clickable/selectable, and separately handles a
`category_mismatch` quote response (the request doesn't fit the one live
category) by showing a rewrite prompt instead of a listing. **Do not wire
the placeholder slots up to fake/random data or make them selectable** —
this app's stated design principle is to disclose "there's only one real
seller today" rather than simulate competition, and the redesign should
preserve that (restyle the placeholders, don't make them functional fakes).

**9. `DisputeCard`'s evidence-window gating (`tasks/[id]/page.tsx`)**

```ts
windowOpen = dispute.status === "open" && !!dispute.evidence_window_deadline
             && isBeforeDeadline(new Date(dispute.evidence_window_deadline));
canSubmitEvidence = windowOpen && !rebuttals[myRole];
```
Controls whether `DisputeEvidenceForm` renders at all for the current
role. Preserve this condition (also enforced server-side, but keeping the
client gate avoids a confusing wasted round-trip).

**10. `condenseJudgeReason()` / tier-splitting in `JudgeVotesList`/`ContestResolutionFeedback`**

Deterministic derivations from already-stored `judge_votes.rationale` (no
new LLM call): which tier is "decisive" (tier-2 if the dispute escalated,
else tier-1), and a one-sentence extraction from the first matching vote.
This is real business logic, not formatting — call these existing functions
from any new markup rather than re-deriving the tally/tier split yourself.

---

## 5. Real data shapes

These are the actual types the load-bearing components consume today.
Keep prop shapes compatible with these so a visual redesign doesn't require
backend changes.

```ts
// src/lib/history.ts — what the task detail page (and admin history pages) receive
type TaskDetail = TaskRow & {
  quotes: QuoteRow[];
  disputes: (DisputeRow & { judge_votes: JudgeVoteRow[] })[];
  payments: PaymentRow[];
  validations: ValidationRow[];
  listings: { title: string; sla: unknown } | null;
  jobEvents: JobEventRow[];
};

// src/lib/supabase/types.generated.ts — tasks table
type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "open" | "quoted" | "assigned" | "in_progress" | "submitted" | "accepted" | "disputed" | "resolved" | "cancelled";
  payer_wallet_id: string;
  payee_wallet_id: string | null;
  listing_id: string | null;
  policy_id: string | null;
  amount_usdc: number | null;
  guaranteed_total_usdc: number | null;
  disclosed_contingent_fee_pct: number | null;
  validation_fee_usdc: number | null;
  accepted_at: string | null;      // when the validator auto-approved — anchors the contest window
  deadline_at: string | null;
  metadata: Json;                  // { erc8183_job_id?, expiredAt?, submission_error? }
  created_at: string;
  updated_at: string;
};

// disputes table
type DisputeRow = {
  id: string;
  task_id: string;
  dispute_kind: "standard" | "post_approval_contest";
  status: "open" | "voting" | "resolved" | "settlement_failed" | string;
  outcome: "pending" | "favor_payer" | "favor_payee" | "split";
  opened_by_wallet: string;
  reason: string | null;
  evidence: Json;                  // { rebuttals?: { buyer?: {text, submitted_at}, seller?: {text, submitted_at} } }
  evidence_window_deadline: string | null;
  validator_reasoning_snapshot: Json | null;
  educational_feedback: Json | null; // EducationalFeedback | RejectionFeedback — see src/lib/disputes/feedback.ts
  filing_fee_usdc: number | null;
  filing_fee_payment_id: string | null;
  insurance_payout_usdc: number | null;
  insurance_payout_payment_id: string | null;
  settlement_state: Json;          // per-leg retry state, only meaningful when status === "settlement_failed"
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

// judge_votes table
type JudgeVoteRow = {
  id: string;
  dispute_id: string;
  judge_wallet_id: string;
  choice: "favor_payer" | "favor_payee" | "abstain";
  rationale: string | null;
  model: string | null;
  effort: string | null;
  tier: number | null;             // 3 = tier-1 panel, 5 = tier-2 escalation panel
  weight: number;
  usage: Json | null;
  created_at: string;
};

// payments table
type PaymentRow = {
  id: string;
  task_id: string | null;
  from_wallet_id: string | null;
  to_wallet_id: string | null;
  kind: "deposit" | "escrow" | "release" | /* + more */ string;
  status: "pending" | "escrowed" | "released" | /* + more */ string;
  amount_usdc: number;
  tx_hash: string | null;
  circle_tx_id: string | null;
  chain_id: number;
  error: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

// validations table
type ValidationRow = {
  id: string;
  task_id: string;
  outcome: "approved" | "disputed";
  policy_pass: boolean;
  task_pass: boolean;
  sla_pass: boolean;
  rationale: string | null;
  deliverable: Json | null;        // for the real agent: { overall_summary: string, findings: [{title, url, summary, confidence, source_role?, overlaps_with?}] }
  deliverable_hash: string | null;
  failures: Json;
  erc8183_job_id: string | null;
  usage: Json | null;
  created_at: string;
};

// listings table
type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;                 // only "research_sourcing" exists today
  price_usdc: number | null;        // null for the real listing (priced per-task, not fixed)
  sla: Json;                        // { agent?: "research-sourcing", min_distinct_sources?, distinctness_basis?, ... }
  active: boolean;
  seller_wallet_id: string;
  created_at: string;
  updated_at: string;
};

// wallets table
type WalletRow = {
  id: string;
  user_id: string;
  address: string;                  // Arc Testnet SCA address
  circle_wallet_id: string;
  control: "developer" | "user";
  account_type: string;
  blockchain: string;
  label: string | null;
  created_at: string;
  updated_at: string;
};
```

```ts
// src/components/TaskSubmissionFlow.tsx — local response types for the quote flow
type QuoteResponse = {
  gate_result: "original" | "retry_free" | "retry_charged" | "topic_change";
  attempt_no: number;
  charged_usdc: number;
  swept: { session_id: string; amount_usdc: number } | null;
  quote: {
    guaranteed_total_usdc: number;
    seller_cost_estimate_usdc: number;
    happy_path_fee_usdc: number;
    validation_fee_usdc: number;
    dispute_insurance_premium_usdc: number;
    disclosed_contingent_fee_pct: number;
    contingent_disclosure: string | null;
    within_budget_ceiling: boolean;
    policy_max_amount_usdc: number | null;
  };
  session: {
    id: string;
    category: "research_sourcing";
    subject: string;
    difficulty: number;
    scope_quantity: number | null;
    attempt_count: number;
    escrow_held_usdc: number;
    matched_listing_ids: string[];
  };
};
type CategoryMismatchResponse = { gate_result: "category_mismatch"; reason: string };
```

```ts
// src/components/AgentRoster.tsx
type AgentEntry = { role: string; monogram: string; colorClass: string; description: string };
```

---

## 6. Ground rules for the redesign branch

1. **Work on a new branch** (e.g. `ui-redesign`) — never commit directly to
   `main`.
2. **Pull latest `main` before starting.** Several files — especially
   `src/app/tasks/[id]/page.tsx` — changed significantly and recently
   (dispute evidence windows, real cost telemetry, contest resolution
   feedback). Don't redesign against a stale copy.
3. **Do not modify:**
   - Anything in `src/lib/`.
   - Any file under `src/app/api/**` (every API route).
   - `deriveStage()`'s logic in `src/app/tasks/[id]/page.tsx` — restyle the
     `Stepper`'s *output* freely, don't change what determines the stage.
   - The typed-`CONFIRM` gate logic on money-moving buttons
     (`ContestDeliveryButton`, `ClaimExpiredButton`, every admin
     `ConfirmAction` usage) — restyle the button/input, keep the exact-text
     confirmation requirement intact.
4. **Safe to fully redesign:** layout, colors, typography, component visual
   structure, animations, page composition — as long as the same
   data/props still flow through and the same API calls still fire on the
   same user actions. See §4 for the specific list of what's pure
   presentation vs. load-bearing.
5. **If a redesign genuinely requires a new prop or a changed data shape,
   that's fine** — just flag it clearly (a comment, a running list in your
   PR description) rather than silently diverging, so it's an easy, visible
   integration point rather than a surprise for whoever wires it up to the
   backend.
6. **Run the app with demo data — no real credentials needed for pure UI
   work.** Copy `.env.example` to `.env.local`, set
   `NEXT_PUBLIC_DEMO_MODE=true`, and fill in `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ask a teammate for the shared dev
   Supabase project's values, or point at your own instance seeded via
   `src/lib/demo/seed.ts`) — you don't need real Circle or Anthropic API
   keys to view and click through the seeded `testAccount@snapback.com`
   demo history. `npm run dev`, then log in via the demo dropdown on
   `/login`.
7. **Remember this app runs Next.js 16**, not the Next.js you likely trained
   on — check `node_modules/next/dist/docs/` before assuming an App Router
   convention or API behaves the way you remember.
