-- SnapBack — real per-call token usage for cost telemetry.
--
-- Every real Claude call this app makes (judge panel votes, the validator,
-- Research & Sourcing's two-step agent) was missing response.usage entirely
-- — no per-task telemetry existed to calibrate estimates like
-- research-sourcing-pricing.ts against, or to answer "what does a dispute
-- actually cost us in judge-panel calls." This adds it.
--
-- jsonb, not a dedicated column: token counts are observability/analytics
-- data nothing in this app branches on (unlike judge_votes.model/effort/tier,
-- which drive tallying, escalation display, and joins — a load-bearing
-- reason those got dedicated columns in 0016_judge_panel.sql). Cost
-- telemetry is purely adjacent, same reasoning already applied to
-- settlement_state (jsonb) vs. filing_fee_usdc (dedicated column).

alter table judge_votes
  add column if not exists usage jsonb;

comment on column judge_votes.usage is
  'response.usage from this judge''s Claude call: { input_tokens, output_tokens }. Null for a failed/abstained call that never got a response.';

alter table validations
  add column if not exists usage jsonb;

comment on column validations.usage is
  'Real Claude token usage for this validation run: { validator: { input_tokens, output_tokens }, research_sourcing: { research: {...}, structure: {...} } | null }. research_sourcing is only present when this delivery came from the Research & Sourcing agent (see lib/agents/research-sourcing.ts) — every other seller has no matching Claude call to log here.';
