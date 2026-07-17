-- ─────────────────────────────────────────────────────────────
-- SnapBack — initial schema
-- Agentic-economy escrow/payments on Arc Testnet.
--
-- Money model: USDC amounts are stored as NUMERIC (exact decimal), NOT floats.
-- The ERC-20 USDC interface uses 6 decimals; store human-readable USDC values
-- (e.g. 12.500000) and keep on-chain integer conversion in app code.
-- ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Enums ──────────────────────────────────────────────────────
do $$ begin
  create type task_status as enum (
    'draft', 'open', 'quoted', 'assigned', 'in_progress',
    'submitted', 'accepted', 'disputed', 'resolved', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum (
    'pending', 'escrowed', 'released', 'refunded', 'snapped_back', 'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_kind as enum (
    'deposit', 'escrow', 'release', 'refund', 'snapback', 'nanopayment', 'gas'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('open', 'voting', 'resolved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_outcome as enum ('pending', 'favor_payer', 'favor_payee', 'split');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vote_choice as enum ('favor_payer', 'favor_payee', 'abstain');
exception when duplicate_object then null; end $$;

do $$ begin
  create type wallet_control as enum ('developer', 'user');
exception when duplicate_object then null; end $$;

-- ── Trigger fn: keep updated_at fresh ──────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── users ──────────────────────────────────────────────────────
-- One row per authenticated identity (Circle User-Controlled Wallets user).
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  email          text unique not null,
  circle_user_id text unique,                 -- Circle UCW userId
  display_name   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- ── wallets ────────────────────────────────────────────────────
-- Circle wallets bound to a user. SCA on Arc Testnet.
create table if not exists wallets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  circle_wallet_id  text unique not null,      -- Circle walletId
  address           text not null,             -- 0x… on Arc
  blockchain        text not null default 'ARC-TESTNET',
  account_type      text not null default 'SCA',
  control           wallet_control not null default 'developer',
  label             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, address)
);
create index if not exists wallets_user_idx on wallets(user_id);
create index if not exists wallets_address_idx on wallets(lower(address));
create trigger wallets_updated_at before update on wallets
  for each row execute function set_updated_at();

-- ── policies ───────────────────────────────────────────────────
-- Agent spending / snapback policy attached to a wallet.
create table if not exists policies (
  id                    uuid primary key default gen_random_uuid(),
  wallet_id             uuid not null references wallets(id) on delete cascade,
  name                  text not null,
  max_amount_usdc       numeric(20, 6),        -- per-task ceiling
  daily_limit_usdc      numeric(20, 6),        -- rolling 24h ceiling
  auto_release_hours    integer,               -- auto-accept window
  snapback_window_hours integer,               -- window a payer can snap back
  requires_judges       boolean not null default false,
  active                boolean not null default true,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists policies_wallet_idx on policies(wallet_id);
create trigger policies_updated_at before update on policies
  for each row execute function set_updated_at();

-- ── tasks ──────────────────────────────────────────────────────
-- A unit of agent work: payer commissions, payee (agent) delivers.
create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  payer_wallet_id  uuid not null references wallets(id) on delete restrict,
  payee_wallet_id  uuid references wallets(id) on delete set null,
  policy_id        uuid references policies(id) on delete set null,
  title            text not null,
  description      text,
  status           task_status not null default 'draft',
  amount_usdc      numeric(20, 6),             -- agreed price once quoted
  deadline_at      timestamptz,
  accepted_at      timestamptz,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tasks_payer_idx on tasks(payer_wallet_id);
create index if not exists tasks_payee_idx on tasks(payee_wallet_id);
create index if not exists tasks_status_idx on tasks(status);
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

-- ── quotes ─────────────────────────────────────────────────────
-- Bids from agents against a task.
create table if not exists quotes (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  payee_wallet_id   uuid not null references wallets(id) on delete cascade,
  amount_usdc       numeric(20, 6) not null,
  estimated_seconds integer,
  note              text,
  accepted          boolean not null default false,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists quotes_task_idx on quotes(task_id);
create index if not exists quotes_payee_idx on quotes(payee_wallet_id);
create trigger quotes_updated_at before update on quotes
  for each row execute function set_updated_at();

-- ── payments ───────────────────────────────────────────────────
-- On-chain money movements. Each row links to a tx hash on Arcscan.
create table if not exists payments (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid references tasks(id) on delete set null,
  from_wallet_id   uuid references wallets(id) on delete set null,
  to_wallet_id     uuid references wallets(id) on delete set null,
  kind             payment_kind not null,
  status           payment_status not null default 'pending',
  amount_usdc      numeric(20, 6) not null,
  tx_hash          text,                       -- 0x… tx on Arc Testnet
  circle_tx_id     text,                       -- Circle transaction id
  chain_id         integer not null default 5042002,
  error            text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists payments_task_idx on payments(task_id);
create index if not exists payments_from_idx on payments(from_wallet_id);
create index if not exists payments_to_idx on payments(to_wallet_id);
create index if not exists payments_txhash_idx on payments(tx_hash);
create index if not exists payments_status_idx on payments(status);
create trigger payments_updated_at before update on payments
  for each row execute function set_updated_at();

-- ── disputes ───────────────────────────────────────────────────
-- Raised by a payer to claw back / by a payee to contest.
create table if not exists disputes (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  opened_by_wallet  uuid not null references wallets(id) on delete restrict,
  status            dispute_status not null default 'open',
  outcome           dispute_outcome not null default 'pending',
  reason            text,
  evidence          jsonb not null default '{}'::jsonb,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists disputes_task_idx on disputes(task_id);
create index if not exists disputes_status_idx on disputes(status);
create trigger disputes_updated_at before update on disputes
  for each row execute function set_updated_at();

-- ── judge_votes ────────────────────────────────────────────────
-- Votes cast by judges (agents/humans) on a dispute.
create table if not exists judge_votes (
  id                uuid primary key default gen_random_uuid(),
  dispute_id        uuid not null references disputes(id) on delete cascade,
  judge_wallet_id   uuid not null references wallets(id) on delete restrict,
  choice            vote_choice not null,
  rationale         text,
  weight            numeric(10, 4) not null default 1,
  created_at        timestamptz not null default now(),
  unique (dispute_id, judge_wallet_id)
);
create index if not exists judge_votes_dispute_idx on judge_votes(dispute_id);

-- ── reputation ─────────────────────────────────────────────────
-- Rolling reputation per wallet, updated as tasks/disputes resolve.
create table if not exists reputation (
  id                 uuid primary key default gen_random_uuid(),
  wallet_id          uuid not null unique references wallets(id) on delete cascade,
  tasks_completed    integer not null default 0,
  tasks_disputed     integer not null default 0,
  disputes_won       integer not null default 0,
  disputes_lost      integer not null default 0,
  total_earned_usdc  numeric(20, 6) not null default 0,
  total_clawed_usdc  numeric(20, 6) not null default 0,
  score              numeric(10, 4) not null default 0,
  updated_at         timestamptz not null default now()
);
create index if not exists reputation_wallet_idx on reputation(wallet_id);
create trigger reputation_updated_at before update on reputation
  for each row execute function set_updated_at();
