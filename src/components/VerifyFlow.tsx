"use client";

import { useState } from "react";

type ResearchFinding = {
  title: string;
  url: string;
  summary: string;
  confidence: string;
};

type ResearchDeliverable = {
  overall_summary: string;
  findings: ResearchFinding[];
};

type VerifyVerdict = {
  verdict: "CORRECT" | "INCORRECT";
  reasoning: string;
  payoutUsdc: number;
  site: string;
};

type NanopaymentInfo = {
  paymentId: string | null;
  amountUsdc: number;
  site: string;
};

function formatSmallUsdc(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.005) {
    const trimmed = value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `$${trimmed}`;
  }
  return `$${value.toFixed(2)}`;
}

/** Honest "working" indicator for a real, variable-duration LLM call — a
 * sliding fill, not a fake percentage or countdown. Shared by the "Get
 * Answer" and "Verify" steps, which both wait on a real Claude call. */
function ProgressBar({ label }: { label: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-[#3f3f46] bg-[#18181b]/40 px-4 py-6">
      <p className="text-center text-sm text-[#a1a1aa]">{label}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ffffff14]">
        <div className="h-full w-1/3 rounded-full bg-[#10b981] progress-indeterminate-bar" />
      </div>
    </div>
  );
}

/** The real free-research deliverable — findings with real urls/confidence. */
function DeliverableView({ deliverable }: { deliverable: ResearchDeliverable }) {
  return (
    <div className="space-y-3 rounded-xl border border-[#3f3f46] bg-[#18181b] px-4 py-4 text-left">
      <p className="text-sm text-[#a1a1aa]">{deliverable.overall_summary}</p>
      <div className="space-y-1">
        {deliverable.findings.map((f, i) => (
          <div
            key={i}
            className="rounded-lg border border-[#ffffff14] bg-[#18181b73] px-3 py-2 text-xs backdrop-blur-[28px]"
          >
            <div className="flex items-center gap-2">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[#10b981] hover:underline"
              >
                {f.title}
              </a>
              <span className="rounded-full bg-[#ffffff14] px-2 py-0.5 text-[#a1a1aa]">
                {f.confidence} confidence
              </span>
            </div>
            <p className="mt-1 text-[#71717a]">{f.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VerifyFlow() {
  const [instruction, setInstruction] = useState("");

  const [answering, setAnswering] = useState(false);
  const [answerResult, setAnswerResult] = useState<ResearchDeliverable | null>(null);
  const [nanopayment, setNanopayment] = useState<NanopaymentInfo | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyVerdict | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  async function getAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim() || answerResult) return;
    setAnswering(true);
    setAnswerError(null);
    try {
      const res = await fetch("/api/demo/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to get an answer");
      setAnswerResult(body.deliverable as ResearchDeliverable);
      setNanopayment(body.nanopayment as NanopaymentInfo);
    } catch (err) {
      setAnswerError(err instanceof Error ? err.message : "Failed to get an answer");
    } finally {
      setAnswering(false);
    }
  }

  async function verify() {
    if (!answerResult || verifyResult) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch("/api/demo/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, deliverable: answerResult, nanopayment }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Verification failed");
      setVerifyResult({
        verdict: body.verdict,
        reasoning: body.reasoning,
        payoutUsdc: body.payoutUsdc,
        site: body.site,
      });
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  function reset() {
    setInstruction("");
    setAnswering(false);
    setAnswerResult(null);
    setNanopayment(null);
    setAnswerError(null);
    setVerifying(false);
    setVerifyResult(null);
    setVerifyError(null);
  }

  const busy = answering || verifying;
  const answered = !!answerResult;
  const verified = !!verifyResult;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-6 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#fafafa]">Try SnapBack</h1>
        <p className="text-sm text-[#a1a1aa]">
          A real agent pays another agent to answer this — a real nanopayment, insured. Verify it,
          and a wrong answer gets you paid back.
        </p>
      </div>

      <div className="space-y-6 rounded-2xl border border-[#ffffff1c] bg-[#111113cc] p-8 backdrop-blur-[24px]">
        <form onSubmit={getAnswer} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="instruction"
              className="text-xs font-medium uppercase tracking-widest text-[#71717a]"
            >
              Instruction
            </label>
            <textarea
              id="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              placeholder="e.g. Summarize the top 3 competitors in EU fintech"
              disabled={busy || answered}
              className="w-full rounded-xl border border-[#3f3f46] bg-[#18181b] px-3 py-2.5 text-[#fafafa] outline-none transition focus:border-[#10b981] disabled:opacity-60"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-widest text-[#71717a]">
              Agent&apos;s result
            </label>
            {answerResult ? (
              <>
                <DeliverableView deliverable={answerResult} />
                {nanopayment && (
                  <p className="text-xs text-[#71717a]">
                    Real nanopayment: {formatSmallUsdc(nanopayment.amountUsdc)} agent-to-agent to{" "}
                    {nanopayment.site}
                    {nanopayment.amountUsdc === 0 && " (payment failed — fell back to free web search)"}
                  </p>
                )}
              </>
            ) : answering ? (
              <ProgressBar label="Working — an agent is paying another agent to research this, for real." />
            ) : answerError ? (
              <p className="rounded-lg border border-[#7f1d1d77] bg-[#450a0a66] px-3 py-2 text-sm text-[#f87171]">
                {answerError}
              </p>
            ) : (
              <div className="w-full cursor-not-allowed select-none rounded-xl border border-dashed border-[#3f3f46] bg-[#18181b]/40 px-3 py-8 text-center text-sm italic text-[#71717a]">
                Not available yet — click Get Answer to have an agent pay another agent to research
                this for you.
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || answered || !instruction.trim()}
              className="rounded-xl bg-[#10b981] px-5 py-2.5 font-semibold text-[#052e1f] transition hover:bg-[#34d399] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {answering ? "Working…" : "Get Answer"}
            </button>
            {answered && (
              <button
                type="button"
                onClick={verify}
                disabled={verifying || verified}
                className="rounded-xl bg-[#10b981] px-5 py-2.5 font-semibold text-[#052e1f] transition hover:bg-[#34d399] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verified ? "Verified ✓" : verifying ? "Verifying…" : "Verify"}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-xl border border-[#3f3f46] px-5 py-2.5 font-semibold text-[#a1a1aa] transition hover:bg-[#ffffff0a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </form>

        {verifying && !verifyResult && (
          <div className="border-t border-[#ffffff14] pt-6">
            <ProgressBar label="Working — a real judge is verifying this answer." />
          </div>
        )}

        {verifyResult && (
          <div className="space-y-3 border-t border-[#ffffff14] pt-6">
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                verifyResult.verdict === "CORRECT"
                  ? "bg-[#10b981]/15 text-[#10b981]"
                  : "bg-[#f59e0b]/15 text-[#fbbf24]"
              }`}
            >
              {verifyResult.verdict === "CORRECT" ? "Correct" : "Incorrect"}
            </span>
            <p className="text-sm text-[#a1a1aa]">{verifyResult.reasoning}</p>
            {verifyResult.verdict === "INCORRECT" && (
              <p className="text-xs text-[#71717a]">
                {verifyResult.payoutUsdc > 0 ? (
                  <>
                    Insured: {formatSmallUsdc(verifyResult.payoutUsdc)} paid back to your wallet —
                    priced off {verifyResult.site}&apos;s real correctness track record across every
                    SnapBack user. A site that&apos;s almost always right pays more on a rare miss; a
                    site that&apos;s often wrong pays less, since a miss there is unsurprising.
                  </>
                ) : (
                  <>Nothing to insure — this nanopayment&apos;s real charge was $0.00.</>
                )}
              </p>
            )}
          </div>
        )}
        {verifyError && (
          <p className="rounded-lg border border-[#7f1d1d77] bg-[#450a0a66] px-3 py-2 text-sm text-[#f87171]">
            {verifyError}
          </p>
        )}
      </div>
    </div>
  );
}
