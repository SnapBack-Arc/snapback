-- ─────────────────────────────────────────────────────────────
-- nanopayment_validations gets a generic metadata column, same pattern
-- payments already has — used to log the real per-call LLM cost
-- (estimateCallCostUsd, lib/llm-cost.ts) of the Verify judge call on each
-- row, so real cost/cycle numbers are queryable without a separate table.
-- ─────────────────────────────────────────────────────────────

alter table nanopayment_validations
  add column if not exists metadata jsonb not null default '{}'::jsonb;
