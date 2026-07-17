-- ─────────────────────────────────────────────────────────────
-- SnapBack — Estimator Agent re-quote gating.
--
-- Tracks a buyer's quote-phase session: the parsed structured spec (subject +
-- difficulty), the free-attempt counter, and any nanopayment fees held in
-- quote-phase escrow. The gate compares each new submission against the parsed
-- spec (not raw text), so typo fixes that normalize to the same spec don't
-- register as a topic change.
-- ─────────────────────────────────────────────────────────────

-- New payment kinds used by the estimator (quote_fee, treasury_sweep) and by
-- the dispute/judge flows (filing_fee, judge_fee).
alter type payment_kind add value if not exists 'quote_fee';
alter type payment_kind add value if not exists 'treasury_sweep';
alter type payment_kind add value if not exists 'filing_fee';
alter type payment_kind add value if not exists 'judge_fee';

do $$ begin
  create type estimator_session_status as enum (
    'active',     -- accepting submissions
    'credited',   -- held escrow credited toward the final task payment
    'swept',      -- escrow swept to Treasury (topic change)
    'abandoned'   -- swept after inactivity timeout
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type estimator_gate_result as enum (
    'original',      -- first submission in a session (free)
    'retry_free',    -- gate passed, within the free allowance
    'retry_charged', -- gate passed, 3rd attempt onward — nanopayment charged
    'topic_change'   -- gate failed — escrow swept, new session started
  );
exception when duplicate_object then null; end $$;

-- ── estimator_sessions ─────────────────────────────────────────
create table if not exists estimator_sessions (
  id                   uuid primary key default gen_random_uuid(),
  payer_wallet_id      uuid not null references wallets(id) on delete cascade,
  task_id              uuid references tasks(id) on delete set null,
  status               estimator_session_status not null default 'active',

  -- Parsed structured spec (the gate compares these, never raw text).
  subject              text not null,
  subject_key          text not null,          -- canonical slug for equality
  difficulty           integer not null,       -- normalized band, 1..5
  scope_quantity       numeric(20, 4),         -- e.g. 5 suppliers → 5 (nullable)
  normalized_spec      jsonb not null default '{}'::jsonb,

  -- Free-attempt accounting. Original + 1st retry free; 3rd attempt onward charged.
  attempt_count        integer not null default 1,
  escrow_held_usdc     numeric(20, 6) not null default 0,
  treasury_swept_usdc  numeric(20, 6) not null default 0,

  last_activity_at     timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists estimator_sessions_payer_idx
  on estimator_sessions(payer_wallet_id);
-- At most one active session per payer wallet.
create unique index if not exists estimator_sessions_one_active_idx
  on estimator_sessions(payer_wallet_id) where status = 'active';
-- Drives the inactivity sweep.
create index if not exists estimator_sessions_activity_idx
  on estimator_sessions(last_activity_at) where status = 'active';
create trigger estimator_sessions_updated_at before update on estimator_sessions
  for each row execute function set_updated_at();

-- ── estimator_attempts ─────────────────────────────────────────
-- One row per submission, for audit and for reconstructing the counter.
create table if not exists estimator_attempts (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references estimator_sessions(id) on delete cascade,
  attempt_no    integer not null,
  raw_text      text not null,
  parsed_spec   jsonb not null default '{}'::jsonb,
  gate_result   estimator_gate_result not null,
  charged_usdc  numeric(20, 6) not null default 0,
  payment_id    uuid references payments(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists estimator_attempts_session_idx
  on estimator_attempts(session_id);
