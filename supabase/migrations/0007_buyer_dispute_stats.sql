-- ─────────────────────────────────────────────────────────────
-- SnapBack — buyer dispute-abuse tracking.
--
-- Judges are bonded (JudgeRegistry) and sellers are reputation-tracked
-- (ERC-8004, via JudgeRegistry._recordReputation) — buyers had no equivalent
-- accountability. This adds a per-buyer-wallet dispute win/loss record, an
-- escalating filing fee keyed off the buyer's recent loss rate, and a
-- scrutiny flag the validator checks once a harder abuse threshold is
-- crossed.
-- ─────────────────────────────────────────────────────────────

create table if not exists buyer_dispute_stats (
  wallet_id           uuid primary key references wallets(id) on delete cascade,
  disputes_filed      integer not null default 0,
  disputes_won        integer not null default 0,   -- outcome = favor_payer
  disputes_lost       integer not null default 0,   -- outcome = favor_payee
  -- Drives the escalating-multiplier framing in code (reset on a win).
  consecutive_losses  integer not null default 0,
  -- Set once loss rate over the last N resolved disputes crosses the harder
  -- abuse threshold. The validator checks this for tighter scrutiny on
  -- future tasks from this buyer.
  scrutiny_flagged    boolean not null default false,
  updated_at          timestamptz not null default now()
);
create trigger buyer_dispute_stats_updated_at before update on buyer_dispute_stats
  for each row execute function set_updated_at();

-- Filing fee bookkeeping, per dispute. Forfeited (kept as a released payment)
-- on a loss, refunded on a win — settled once the dispute resolves.
alter table disputes
  add column if not exists filing_fee_usdc numeric(20, 6),
  add column if not exists filing_fee_payment_id uuid references payments(id) on delete set null;
