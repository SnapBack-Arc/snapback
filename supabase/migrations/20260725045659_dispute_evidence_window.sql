-- SnapBack — evidence/rebuttal submission window before the judge panel runs.
--
-- Previously the judge panel was invoked synchronously in the same call as
-- dispute filing (both validator-service.ts's auto-file and
-- contest.ts's filePostApprovalContest) — zero gap for either party to add
-- context before judges voted. This gives both sides a real window: the
-- dispute now stays 'open' for evidence_window_deadline before anything
-- invokes the panel.
--
-- Dedicated column, not folded into the existing `evidence` jsonb: this one
-- IS load-bearing — lib/disputes/evidence.ts's maybeRunJudgePanelForDispute
-- branches on it (has the window elapsed?) before atomically claiming the
-- dispute and invoking the panel. The actual evidence/rebuttal TEXT parties
-- submit stays in the existing `evidence` jsonb (evidence.rebuttals.{buyer,
-- seller}) — that's pure content the panel reads, not something code
-- branches on, same reasoning as contest_reason already living there.

alter table disputes
  add column if not exists evidence_window_deadline timestamptz;

comment on column disputes.evidence_window_deadline is
  'Deadline after which the judge panel may be invoked for this dispute (see lib/disputes/evidence.ts). Null for any dispute filed before this shipped -- those resolve exactly as before, no window.';
