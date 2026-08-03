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

type LlmCost = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  real_cost_usdc: number | null;
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

/**
 * Dedicated formatter for the real per-call LLM cost line only — real costs
 * here land in the $0.004-$0.03 range, and formatSmallUsdc's 2-decimal
 * rounding (tuned for the nanopayment/payout lines, which are usually
 * exactly $0.01 or $0.00) collapses almost all of them to "$0.01"/"$0.02"
 * and flips inconsistently to 6-decimal display right around its $0.005
 * cutoff. Fixed 4-decimal precision keeps every real value in this range
 * distinguishable without touching formatSmallUsdc's other call sites.
 */
function formatLlmCostUsdc(value: number): string {
  return `$${value.toFixed(4)}`;
}

/** Honest "working" indicator for a real, variable-duration LLM call — a
 * sliding fill, not a fake percentage or countdown. Shared by the "Get
 * Answer" and automatic validation steps, which both wait on a real Claude
 * call. */
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

  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<"answering" | "validating" | null>(null);

  const [answerResult, setAnswerResult] = useState<ResearchDeliverable | null>(null);
  const [answerCost, setAnswerCost] = useState<LlmCost | null>(null);
  const [nanopayment, setNanopayment] = useState<NanopaymentInfo | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const [verifyResult, setVerifyResult] = useState<VerifyVerdict | null>(null);
  const [verifyCost, setVerifyCost] = useState<LlmCost | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function runFlow(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim() || answerResult) return;

    setRunning(true);
    setStage("answering");
    setAnswerError(null);
    setValidationError(null);

    let deliverable: ResearchDeliverable;
    let nanopaymentInfo: NanopaymentInfo;
    try {
      const res = await fetch("/api/demo/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to get an answer");
      deliverable = body.deliverable as ResearchDeliverable;
      nanopaymentInfo = body.nanopayment as NanopaymentInfo;
      setAnswerResult(deliverable);
      setAnswerCost(body.llmCost as LlmCost);
      setNanopayment(nanopaymentInfo);
    } catch (err) {
      setAnswerError(err instanceof Error ? err.message : "Failed to get an answer");
      setRunning(false);
      setStage(null);
      return;
    }

    // The answer is real and already shown above this point even if the
    // automatic check below fails — a validation failure shouldn't hide the
    // real deliverable the user already paid a real nanopayment for.
    setStage("validating");
    try {
      const res = await fetch("/api/demo/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, deliverable, nanopayment: nanopaymentInfo }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Verification failed");
      setVerifyResult({
        verdict: body.verdict,
        reasoning: body.reasoning,
        payoutUsdc: body.payoutUsdc,
        site: body.site,
      });
      setVerifyCost(body.llmCost as LlmCost);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setRunning(false);
      setStage(null);
    }
  }

  function reset() {
    setInstruction("");
    setRunning(false);
    setStage(null);
    setAnswerResult(null);
    setAnswerCost(null);
    setNanopayment(null);
    setAnswerError(null);
    setVerifyResult(null);
    setVerifyCost(null);
    setValidationError(null);
  }

  const answered = !!answerResult;
  const totalRealCost =
    answerCost?.real_cost_usdc != null && verifyCost?.real_cost_usdc != null
      ? answerCost.real_cost_usdc + verifyCost.real_cost_usdc
      : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-6 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#fafafa]">Try SnapBack</h1>
        <p className="text-sm text-[#a1a1aa]">
          A real agent pays another agent to answer this — a real nanopayment, insured. A real
          judge checks it automatically, and a wrong answer gets you paid back.
        </p>
      </div>

      <div className="space-y-6 rounded-2xl border border-[#ffffff1c] bg-[#111113cc] p-8 backdrop-blur-[24px]">
        <form onSubmit={runFlow} className="space-y-6">
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
              disabled={running || answered}
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
                    {nanopayment.amountUsdc === 0 && " (payment failed — no live search data)"}
                  </p>
                )}
              </>
            ) : stage === "answering" ? (
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
              disabled={running || answered || !instruction.trim()}
              className="rounded-xl bg-[#10b981] px-5 py-2.5 font-semibold text-[#052e1f] transition hover:bg-[#34d399] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? "Working…" : "Get Answer"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={running}
              className="rounded-xl border border-[#3f3f46] px-5 py-2.5 font-semibold text-[#a1a1aa] transition hover:bg-[#ffffff0a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>
        </form>

        {stage === "validating" && (
          <div className="border-t border-[#ffffff14] pt-6">
            <ProgressBar label="Working — a real judge is verifying this answer." />
          </div>
        )}

        {verifyResult && (
          <div className="space-y-6 border-t border-[#ffffff14] pt-6">
            {/* Section A — real result of this specific run. */}
            <div className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-widest text-[#71717a]">
                Result of this validation
              </h2>
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
              {totalRealCost != null && answerCost && verifyCost && (
                <p className="text-xs text-[#71717a]">
                  This check cost SnapBack {formatLlmCostUsdc(totalRealCost)} in real Claude API
                  usage — {formatLlmCostUsdc(answerCost.real_cost_usdc!)} to generate the answer,{" "}
                  {formatLlmCostUsdc(verifyCost.real_cost_usdc!)} to validate it.
                </p>
              )}
            </div>

            {/* Section B — general architecture, deliberately not framed as
                what just happened above. */}
            <div className="space-y-2 rounded-xl border border-[#3f3f46] bg-[#18181b]/40 px-4 py-4">
              <h2 className="text-xs font-medium uppercase tracking-widest text-[#71717a]">
                How SnapBack judges disputes
              </h2>
              <p className="text-xs text-[#71717a]">
                Full disputes on real, funded tasks go through SnapBack&apos;s production judge
                panel, not this quick check. A first tier of 2 Opus judges plus 1 Sonnet judge vote
                independently and must be unanimous — any disagreement, including a 2-1 split,
                escalates to a fresh panel of 3 Opus judges plus 2 Sonnet judges who decide by
                majority. This demo&apos;s automatic check above uses a single Sonnet validation
                call instead, to keep things fast — the result above didn&apos;t go through the
                multi-judge panel.
              </p>
            </div>
          </div>
        )}
        {validationError && (
          <p className="rounded-lg border border-[#7f1d1d77] bg-[#450a0a66] px-3 py-2 text-sm text-[#f87171]">
            {validationError}
          </p>
        )}
      </div>
    </div>
  );
}
