/**
 * Marker checked against a listing's `sla.agent` field to identify SnapBack's
 * one real integration (lib/agents/research-sourcing.ts) — see README.md
 * "Research & Sourcing — the one real integration".
 *
 * No "server-only" here deliberately: both the client submission flow
 * (badge/description text) and server pages (the deliver button gate) need
 * this same check, and it does nothing but read a plain object field.
 */
export function isResearchSourcingListing(sla: unknown): boolean {
  return (sla as { agent?: string } | null | undefined)?.agent === "research-sourcing";
}
