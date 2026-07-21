-- ─────────────────────────────────────────────────────────────
-- SnapBack — real AI judge panel.
--
-- Replaces admin force-resolve as the default dispute-resolution path.
-- Reuses the existing `judge_votes`/`disputes`/`wallets` schema (already
-- built for this — see demo/seed.ts's synthetic judge panels and
-- tasks/[id]/page.tsx's escalation display) rather than a new table.
--
-- Judges are LLM calls, not economic actors — they never hold funds or sign
-- anything (only the `arbiter` app_wallet does, via the existing
-- resolveJobDispute()). judge_votes.judge_wallet_id is NOT NULL, so each
-- judge still needs a `wallets` row to reference; these are permanent,
-- fixed system identities (fake circle_wallet_id, same pattern as
-- demo/seed.ts's synthetic judges) seeded once here, not drawn per-dispute.
--
-- 8 total identities, not 5: both an escalated dispute's 3 tier-1 votes AND
-- its 5 tier-2 votes are persisted as real judge_votes rows on the SAME
-- dispute, and judge_votes has `unique(dispute_id, judge_wallet_id)` — so
-- tier-1's identities and tier-2's identities must be entirely disjoint
-- (2 opus + 1 sonnet for tier-1, a fresh 3 opus + 2 sonnet for tier-2).
--   tier-1 (unanimous-only, first attempt on every dispute):
--     judge-opus-1, judge-opus-2 @ effort high; judge-sonnet-1 @ effort high
--   tier-2 (majority, escalation only):
--     judge-opus-3 @ medium, judge-opus-4 @ high, judge-opus-5 @ xhigh;
--     judge-sonnet-2, judge-sonnet-3 @ effort high
-- ─────────────────────────────────────────────────────────────

alter table judge_votes
  add column if not exists model  text,
  add column if not exists effort text,
  add column if not exists tier   smallint;

comment on column judge_votes.model is 'Claude model id that cast this vote, e.g. claude-opus-4-8.';
comment on column judge_votes.effort is 'output_config.effort used for this judge''s call, e.g. high.';
comment on column judge_votes.tier is 'Panel tier this vote belongs to: 3 (first attempt) or 5 (escalation).';

do $$
declare
  j record;
  uid uuid;
begin
  for j in
    select * from (values
      ('judge-opus-1',   'judge-opus-1@snapback.internal',   'judge-opus-1-wallet',   1),
      ('judge-opus-2',   'judge-opus-2@snapback.internal',   'judge-opus-2-wallet',   2),
      ('judge-opus-3',   'judge-opus-3@snapback.internal',   'judge-opus-3-wallet',   3),
      ('judge-opus-4',   'judge-opus-4@snapback.internal',   'judge-opus-4-wallet',   4),
      ('judge-opus-5',   'judge-opus-5@snapback.internal',   'judge-opus-5-wallet',   5),
      ('judge-sonnet-1', 'judge-sonnet-1@snapback.internal', 'judge-sonnet-1-wallet', 6),
      ('judge-sonnet-2', 'judge-sonnet-2@snapback.internal', 'judge-sonnet-2-wallet', 7),
      ('judge-sonnet-3', 'judge-sonnet-3@snapback.internal', 'judge-sonnet-3-wallet', 8)
    ) as t(label, email, circle_wallet_id, n)
  loop
    insert into users (email, display_name)
    values (j.email, j.label)
    on conflict (email) do nothing
    returning id into uid;

    if uid is null then
      select id into uid from users where email = j.email;
    end if;

    insert into wallets (user_id, circle_wallet_id, address, blockchain, account_type, control, label)
    values (
      uid,
      j.circle_wallet_id,
      '0x' || repeat('9', 39) || j.n::text,
      'ARC-TESTNET',
      'SCA',
      'developer',
      j.label
    )
    on conflict (circle_wallet_id) do nothing;
  end loop;
end $$;
