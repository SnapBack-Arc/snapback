"use client";

import { useEffect, useState } from "react";
import type { RecentTransaction } from "@/lib/dashboard-data";
import type { TransactionDetail } from "@/lib/transaction-detail";
import { formatDate, statusClasses } from "@/lib/format";

function formatDollarsPrecise(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.005) {
    const trimmed = value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `$${trimmed}`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Shared list + click-to-expand detail modal for the dashboard's "Recent
 *  transactions" section — split out from DashboardView (a server
 *  component) because the modal needs client-side state and a fetch. */
export default function RecentTransactionsSection({ transactions }: { transactions: RecentTransaction[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-[#ffffff14] px-6 py-4 text-xs uppercase tracking-wide text-[#71717a]">
        Recent transactions
      </div>
      {transactions.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#a1a1aa]">
          No nanopayments yet — agent-to-agent transactions involved here will show up here.
        </div>
      ) : (
        <div className="divide-y divide-[#ffffff14]">
          {transactions.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenId(t.id)}
              className="flex w-full items-start justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-[#ffffff08]"
            >
              <div>
                <div className="font-semibold text-[#fafafa]">{t.title}</div>
                <div className="mt-1 text-xs text-[#71717a]">
                  {t.agentName} · value {formatDollarsPrecise(t.valueUsdc)}
                </div>
              </div>
              {t.flagged && (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400">
                    Flagged
                  </span>
                  <span className={`text-xs ${t.paidBack ? "text-emerald-400" : "text-amber-400"}`}>
                    {t.paidBack ? "Paid back" : "Not paid back yet"}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {openId && <TransactionDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function TransactionDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/dash/transactions/${id}`);
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) throw new Error(body.error ?? "Failed to load transaction");
        setDetail(body as TransactionDetail);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load transaction");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="glass-card max-h-[85vh] w-full max-w-lg overflow-y-auto bg-[#0c0c0ef2] p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="text-xs uppercase tracking-wide text-[#71717a]">Transaction detail</div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#71717a] hover:text-[#fafafa]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading && <div className="py-8 text-center text-sm text-[#a1a1aa]">Loading…</div>}
        {error && <div className="py-8 text-center text-sm text-red-400">{error}</div>}
        {detail && <TransactionDetailBody detail={detail} />}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 text-xs uppercase tracking-wide text-[#71717a]">{label}</div>
      {children}
    </div>
  );
}

function PaymentLegRow({
  label,
  leg,
}: {
  label: string;
  leg: TransactionDetail["payments"]["nanopayment"];
}) {
  if (!leg) return null;
  return (
    <div className="flex items-center justify-between border-b border-[#ffffff0f] py-2 text-sm last:border-b-0">
      <div>
        <div className="text-[#fafafa]">{label}</div>
        <div className="text-xs text-[#71717a]">{formatDate(leg.createdAt)}</div>
      </div>
      <div className="text-right">
        <div className={`text-xs ${statusClasses(leg.status)} inline-block rounded-full px-2 py-0.5`}>
          {leg.status}
        </div>
        {leg.explorerUrl && leg.txHash ? (
          <a
            href={leg.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block font-mono text-xs text-emerald-400 hover:underline"
          >
            {leg.txHash.slice(0, 8)}…{leg.txHash.slice(-6)}
          </a>
        ) : (
          <div className="mt-1 text-xs text-[#71717a]">no on-chain tx</div>
        )}
      </div>
    </div>
  );
}

function TransactionDetailBody({ detail }: { detail: TransactionDetail }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-[#fafafa]">{detail.instruction}</h2>
      <div className="mt-1 flex items-center gap-2 text-xs text-[#71717a]">
        <span>{detail.site}</span>
        <span>·</span>
        <span>{formatDate(detail.createdAt)}</span>
        <span
          className={`rounded-full px-2 py-0.5 ${
            detail.verdict === "incorrect" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {detail.verdict === "incorrect" ? "Flagged" : "Correct"}
        </span>
      </div>

      <Section label="Judge verdict & reasoning">
        {detail.reasoning ? (
          <p className="text-sm text-[#d4d4d8]">{detail.reasoning}</p>
        ) : (
          <p className="text-sm text-[#71717a]">
            Not recorded for this transaction — reasoning capture started after this one ran.
          </p>
        )}
      </Section>

      <Section label={`Answer from ${detail.site}`}>
        {detail.answer ? (
          <div className="space-y-2">
            <p className="text-sm text-[#d4d4d8]">{detail.answer.overall_summary}</p>
            {detail.answer.findings.length > 0 && (
              <ul className="space-y-1.5">
                {detail.answer.findings.map((f, i) => (
                  <li key={i} className="text-xs text-[#a1a1aa]">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#fafafa] hover:underline"
                    >
                      {f.title}
                    </a>{" "}
                    — {f.summary} <span className="text-[#71717a]">({f.confidence} confidence)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm text-[#71717a]">
            Not recorded for this transaction — answer capture started after this one ran.
          </p>
        )}
      </Section>

      <Section label="Fee breakdown">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-[#a1a1aa]">Nanopayment (paid to {detail.site})</span>
            <span className="font-mono text-[#fafafa]">{formatDollarsPrecise(detail.fees.nanopaymentUsdc)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#a1a1aa]">Verification fee</span>
            <span className="font-mono text-[#fafafa]">{formatDollarsPrecise(detail.fees.validationFeeUsdc)}</span>
          </div>
          {detail.fees.payoutUsdc > 0 && (
            <div className="flex justify-between">
              <span className="text-[#a1a1aa]">Insurance payout</span>
              <span className="font-mono text-emerald-400">{formatDollarsPrecise(detail.fees.payoutUsdc)}</span>
            </div>
          )}
          {detail.fees.judgeLlmCostUsdc !== null && (
            <div className="flex justify-between">
              <span className="text-[#a1a1aa]">Judge&apos;s own LLM call cost</span>
              <span className="font-mono text-[#71717a]">${detail.fees.judgeLlmCostUsdc.toFixed(4)}</span>
            </div>
          )}
        </div>
      </Section>

      <Section label="On-chain activity">
        <PaymentLegRow label="Nanopayment" leg={detail.payments.nanopayment} />
        <PaymentLegRow label="Verification fee" leg={detail.payments.validationFee} />
        <PaymentLegRow label="Insurance payout" leg={detail.payments.payout} />
        {!detail.payments.nanopayment && !detail.payments.validationFee && !detail.payments.payout && (
          <p className="text-sm text-[#71717a]">No on-chain payment legs recorded for this transaction.</p>
        )}
      </Section>
    </div>
  );
}
