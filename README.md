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
