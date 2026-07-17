/** Presentation helpers shared by history pages. */

export function shortAddress(addr: string | null | undefined): string {
  if (!addr) return "—";
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatUsdc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)} USDC`;
}

/** Tailwind classes for a status pill by loose category. */
export function statusClasses(status: string): string {
  const s = status.toLowerCase();
  if (["accepted", "resolved", "released", "complete", "completed"].includes(s))
    return "bg-emerald-500/15 text-emerald-400";
  if (["disputed", "failed", "refunded", "snapped_back", "rejected"].includes(s))
    return "bg-red-500/15 text-red-400";
  if (["pending", "open", "quoted", "assigned", "in_progress", "submitted", "escrowed", "voting"].includes(s))
    return "bg-amber-500/15 text-amber-400";
  return "bg-zinc-700/40 text-zinc-300";
}
