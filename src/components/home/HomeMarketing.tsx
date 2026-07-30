import Link from "next/link";
import { Inter } from "next/font/google";
import JourneyDiagram from "./JourneyDiagram";

// Scoped to this component only (next/font/google scopes to wherever its
// className is applied) — not the root layout, so no other page's
// typography changes. Matches the font used on the /login redesign.
const inter = Inter({ subsets: ["latin"], variable: "--font-home-sans" });

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Commission a task",
    body: "Describe what you need, get a price that already includes protection.",
  },
  {
    step: "2",
    title: "AI checks the work",
    body: "Before you're ever charged for real, a validator reviews it against what was promised.",
  },
  {
    step: "3",
    title: "Bad work? You're covered",
    body: "If it doesn't hold up, an independent AI judge panel reviews it and refunds you automatically. No arguing, no waiting on a human.",
  },
];

const WHY_THIS_BEATS = [
  {
    lead: "No subscription.",
    body: "You're not paying a flat fee every month hoping it's worth it. You pay a small amount only on the transactions you actually make.",
  },
  {
    lead: "The cost is proportional.",
    body: "Real tasks here run in cents, not dollars — and the protection scales with them. You're never paying enterprise-level fees to protect something that costs a fraction of a dollar to begin with.",
  },
  {
    lead: "No lawyers, no arbitration fees.",
    body: "Disputes are resolved by AI in minutes, not a costly, slow legal process — that protection is already built into the small fee you pay.",
  },
  {
    lead: "Automatic, not manual.",
    body: "You don't file a claim and wait. If the panel rules in your favor, the refund happens on its own.",
  },
];

const BUILT_ON = [
  {
    title: "Circle Developer-Controlled Wallets",
    body: "Real wallets for Treasury, the arbiter, the seller, and the agent's own payment wallet, all custodied and signed server-side.",
  },
  {
    title: "Circle User-Controlled Wallets",
    body: "Real buyer wallets, created via genuine email OTP sign-in, no password.",
  },
  {
    title: "Circle Smart Contract Platform",
    body: "Every real fund, release, refund, and dispute resolution is an actual on-chain contract call through Circle's execution API.",
  },
  {
    title: "Circle Gateway",
    body: "Real wallet deposits, letting a user fund their balance without manually bridging.",
  },
  {
    title: "x402 protocol",
    body: "A real agent-to-agent payment: the system's own research agent pays another live service in real USDC for the data it uses.",
  },
  {
    title: "Arc Testnet",
    body: "The whole escrow and dispute contract runs live on Circle's own L1, built for exactly this kind of agent-native activity.",
  },
];

// Rendered only for anonymous visitors (see src/app/page.tsx) — a logged-in
// session with a wallet always gets TaskSubmissionFlow instead, unchanged.
export default function HomeMarketing() {
  return (
    <div className={`${inter.variable} min-h-screen bg-[#09090b] font-[family-name:var(--font-home-sans)] text-[#fafafa]`}>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-8 py-6">
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
      <section className="mx-auto grid max-w-6xl grid-cols-2 items-center gap-16 px-8 py-16">
        <div className="space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[#fafafa]">
            Protection that only costs something when you need it
          </h1>
          <p className="text-lg leading-relaxed text-[#a1a1aa]">
            Most safety nets make you pay whether or not anything goes wrong. SnapBack
            doesn&apos;t. You pay a small amount tied to what you&apos;re actually spending — and
            if the work turns out bad, you get your money back automatically. No
            subscription, no monthly fee, no paying for protection you might never use.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <Link
              href="/login"
              className="rounded-xl bg-[#10b981] px-5 py-2.5 font-semibold text-[#052e1f] transition hover:bg-[#34d399]"
            >
              Get started
            </Link>
          </div>
        </div>

        <div className="flex justify-center rounded-2xl border border-[#ffffff1c] bg-[#111113cc] p-6 backdrop-blur-[24px]">
          <JourneyDiagram />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="mb-10 text-2xl font-semibold tracking-tight text-[#fafafa]">How it works</h2>
        <div className="grid grid-cols-3 gap-6">
          {HOW_IT_WORKS.map((item) => (
            <div
              key={item.step}
              className="space-y-3 rounded-2xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#10b981] bg-[#10b981]/10 text-sm font-semibold text-[#10b981]">
                {item.step}
              </div>
              <h3 className="text-lg font-semibold text-[#fafafa]">{item.title}</h3>
              <p className="text-sm leading-relaxed text-[#a1a1aa]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why this beats not having it */}
      <section className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="mb-10 text-2xl font-semibold tracking-tight text-[#fafafa]">
          Why this beats not having it
        </h2>
        <div className="grid grid-cols-2 gap-6">
          {WHY_THIS_BEATS.map((item) => (
            <div
              key={item.lead}
              className="space-y-2 rounded-2xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px]"
            >
              <p className="font-semibold text-[#fafafa]">{item.lead}</p>
              <p className="text-sm leading-relaxed text-[#a1a1aa]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What we've built on */}
      <section className="mx-auto max-w-6xl px-8 py-16">
        <h2 className="mb-10 text-2xl font-semibold tracking-tight text-[#fafafa]">What we&apos;ve built on</h2>
        <div className="grid grid-cols-3 gap-6">
          {BUILT_ON.map((item) => (
            <div
              key={item.title}
              className="space-y-2 rounded-2xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px]"
            >
              <p className="font-semibold text-[#fafafa]">{item.title}</p>
              <p className="text-sm leading-relaxed text-[#a1a1aa]">{item.body}</p>
            </div>
          ))}

          {/* Visually distinct — real integration path exists (SDK installed,
              matching signer infra built, correct contracts deployed) but not
              yet built/proven end-to-end. Deliberately not blended in with
              the six confirmed-real items above. */}
          <div className="space-y-2 rounded-2xl border border-dashed border-[#f59e0b66] bg-[#f59e0b0f] p-6">
            <div className="flex items-center gap-2">
              <p className="font-semibold italic text-[#f59e0b]">Nanopayments (powered by Circle Gateway)</p>
              <span className="rounded-full border border-[#f59e0b66] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f59e0b]">
                Coming soon
              </span>
            </div>
            <p className="text-sm italic leading-relaxed text-[#a1a1aa]">
              Not yet live. The real integration path exists — SDK already installed,
              matching signer infrastructure already built, correct contracts already
              deployed — but it hasn&apos;t been built and proven end-to-end yet.
            </p>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-8 py-12 text-center text-xs text-[#52525b]">
        Powered by Circle User-Controlled Wallets · Arc Testnet
      </footer>
    </div>
  );
}
