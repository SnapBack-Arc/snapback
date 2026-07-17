/**
 * Marker checked against a listing's `sla.agent` field to identify the one
 * listing in the seed marketplace with a genuine, non-simulated worker
 * behind it (lib/agents/research-sourcing.ts). Every other listing is
 * placeholder inventory with no execution behind it at all — see
 * README.md "Simulated vs. real sellers".
 *
 * No "server-only" here deliberately: both the client submission flow
 * (badge/description text) and server pages (the deliver button gate) need
 * this same check, and it does nothing but read a plain object field.
 */
export function isResearchSourcingListing(sla: unknown): boolean {
  return (sla as { agent?: string } | null | undefined)?.agent === "research-sourcing";
}
