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
  accordingly. Every observed event is also logged to `job_events`, which the
  task detail page renders as a small on-chain activity feed.
- `transactions.*` — wallet-level tx status, correlated against `payments`
  rows that carry a `circle_tx_id` (today: `lib/x402.ts`, the Gateway deposit
  route). Used to catch a transaction that actually failed on-chain (flips
  `payments.status` to `'failed'` instead of leaving it silently stuck
  `'escrowed'`/`'pending'` forever) and to backfill `tx_hash`.

**JudgeRegistry's panel-draw is observed, never triggered.** `selectPanel()`
is `onlyOwner`, gated by a local Foundry deployer keystore (`--account
snapback-deployer --password-file ...`) — not a Circle-managed wallet — and
the real judge pool has zero staked judges today, so the call would revert
regardless. The webhook reflects `PanelSelected`/`VoteCast`/`VerdictReached`
if they ever fire, but never calls `selectPanel` itself; the admin dashboard's
"force-resolve dispute" action remains the real, live path for a stuck
dispute.

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

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
