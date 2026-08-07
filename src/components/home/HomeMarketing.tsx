import Link from "next/link";

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "An agent pays another agent",
    body: "One agent pays a live data source in USDC for an answer — an agent-to-agent transaction, not a user checkout.",
  },
  {
    step: "2",
    title: "SnapBack checks the answer",
    body: "An AI judge reviews what was paid for against what was actually asked, and rules correct or incorrect.",
  },
  {
    step: "3",
    title: "Wrong? You're insured",
    body: "Flagged incorrect and you're paid back automatically, on the spot — priced off that source's track record across every SnapBack user, not a flat refund.",
  },
];

const WHY_THIS_BEATS = [
  {
    lead: "No subscription.",
    body: "You pay a small validation fee only when you actually check an answer — nothing recurring.",
  },
  {
    lead: "The payout is priced by reliability.",
    body: "A rare miss on a source that's almost always right pays more; a miss on a source that's often wrong pays less, since that's already expected. Priced from data gathered across every SnapBack user, not a flat number.",
  },
  {
    lead: "Fully automatic.",
    body: "The payout happens the moment the verdict comes back wrong — you don't ask for it.",
  },
];

const BUILT_ON = [
  {
    title: "x402 protocol",
    body: "The nanopayment mechanism SnapBack insures — a research agent pays a live data source in USDC for every answer it validates.",
  },
  {
    title: "Circle Developer-Controlled Wallets",
    body: "Server-signed wallets for the Treasury and the paying agent, custodied by Circle.",
  },
  {
    title: "On-chain settlement",
    body: "The validation fee and the insurance payout both settle as Circle-signed USDC transfers on Arc Testnet — not internal ledger entries.",
  },
  {
    title: "Circle Gateway",
    body: "Every validation fee settles through Circle Gateway's batched, gasless x402 flow — signed by SnapBack's own wallet on your behalf, so you never touch gas or sign anything yourself.",
  },
  {
    title: "Nanopayments",
    body: "SnapBack is entirely built around one trigger: an agent paying another agent, not a user paying an agent. No agent-to-agent nanopayment, nothing for SnapBack to activate on, insure, or price.",
  },
];

// The root page (src/app/page.tsx) — always public, regardless of session.
// The authenticated Demo/VerifyFlow experience lives at /demo instead.
export default function HomeMarketing() {
  return (
    <div className="min-h-screen text-[#fafafa]">
      <header className="mx-auto flex max-w-[1600px] items-center justify-between px-16 py-6">
        <span className="text-lg font-semibold tracking-tight">
          Snap<span className="text-[#10b981]">Back</span>
        </span>
        <Link
          href="/login"
          className="rounded-xl bg-[#10b981] px-4 py-2 text-sm font-semibold text-[#052e1f] transition hover:bg-[#34d399]"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[900px] space-y-6 px-16 py-24 text-center">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[#fafafa]">
          Insurance for agent-to-agent nanopayments
        </h1>
        <p className="mx-auto max-w-[640px] text-lg leading-relaxed text-[#a1a1aa]">
          SnapBack activates the moment one agent pays another for an answer. A real AI judge
          checks whether that answer holds up — and if it doesn&apos;t, you get paid back
          automatically, priced by how reliable that source has actually been across every
          SnapBack user. No subscription, no disputes, no waiting.
        </p>
        <div className="flex items-center justify-center gap-4 pt-2">
          <Link
            href="/login"
            className="rounded-xl bg-[#10b981] px-5 py-2.5 font-semibold text-[#052e1f] transition hover:bg-[#34d399]"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1600px] px-16 py-16">
        <h2 className="mb-10 text-2xl font-semibold tracking-tight text-[#fafafa]">How it works</h2>
        <div className="space-y-4">
          {HOW_IT_WORKS.map((item) => (
            <div
              key={item.step}
              className="flex items-center gap-6 rounded-xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#10b981] bg-[#10b981]/10 text-sm font-semibold text-[#10b981] font-[family-name:var(--font-app-mono)]">
                {item.step}
              </div>
              <h3 className="w-64 shrink-0 text-lg font-semibold text-[#fafafa]">{item.title}</h3>
              <p className="flex-1 text-sm leading-relaxed text-[#a1a1aa]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why this beats not having it */}
      <section className="mx-auto max-w-[1600px] px-16 py-16">
        <h2 className="mb-10 text-2xl font-semibold tracking-tight text-[#fafafa]">
          Why this beats not having it
        </h2>
        <div className="space-y-4">
          {WHY_THIS_BEATS.map((item) => (
            <div
              key={item.lead}
              className="flex items-center gap-6 rounded-xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px]"
            >
              <p className="w-64 shrink-0 font-semibold text-[#fafafa]">{item.lead}</p>
              <p className="flex-1 text-sm leading-relaxed text-[#a1a1aa]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What we've built on */}
      <section className="mx-auto max-w-[1600px] px-16 py-16">
        <h2 className="mb-10 text-2xl font-semibold tracking-tight text-[#fafafa]">What we&apos;ve built on</h2>
        <div className="space-y-4">
          {BUILT_ON.map((item) => (
            <div
              key={item.title}
              className="flex items-center gap-6 rounded-xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px]"
            >
              <p className="w-72 shrink-0 font-semibold text-[#fafafa]">{item.title}</p>
              <p className="flex-1 text-sm leading-relaxed text-[#a1a1aa]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-[1600px] border-t border-[#ffffff14] px-16 py-8 text-center text-sm text-[#a1a1aa]">
        Powered by Circle User-Controlled Wallets · Arc Testnet
      </footer>
    </div>
  );
}
