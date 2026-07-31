import type { PaymentRow } from "@/lib/supabase/types";
import { shortAddress, statusClasses } from "@/lib/format";
import { paymentKindLabel } from "@/lib/admin-history-format";
import { explorerTxUrl } from "@/lib/arc";

function formatDollars(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "$—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "$—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Shared Kind/Status/Amount/Tx table — used by the Wallet page's 5-row
 *  preview and the full /wallet/history page, so the two never drift. */
export default function PaymentHistoryTable({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) {
    return <p className="px-6 py-6 text-sm text-[#71717a]">No transactions yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-[#71717a]">
            <th className="px-6 py-3 font-medium">Kind</th>
            <th className="px-6 py-3 font-medium">Status</th>
            <th className="px-6 py-3 font-medium">Amount</th>
            <th className="px-6 py-3 font-medium">Tx</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t border-[#ffffff0a]">
              <td className="px-6 py-3 text-[#fafafa]">{paymentKindLabel(p.kind)}</td>
              <td className="px-6 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusClasses(p.status)}`}>{p.status}</span>
              </td>
              <td className="px-6 py-3 font-mono text-[#fafafa]">{formatDollars(p.amount_usdc)}</td>
              <td className="px-6 py-3 font-mono text-xs">
                {p.tx_hash ? (
                  <a
                    href={explorerTxUrl(p.tx_hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    {shortAddress(p.tx_hash)}
                  </a>
                ) : (
                  <span className="text-[#52525b]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
