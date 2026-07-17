-- ─────────────────────────────────────────────────────────────
-- SnapBack — buyer-agent validator (Phase 6d).
--
-- The buyer agent's validator is the SOLE checker at this stage (no human).
-- It assembles criteria from three sources and auto-approves only if the
-- delivery satisfies all three; any failure auto-files a dispute.
--
--   1. person's standing policy  → `policies` (set once, applies to all tasks)
--   2. buyer agent's task criteria → `tasks.metadata.criteria`
--   3. seller's published SLA     → `listings.sla` (new)
--
-- Sellers are judged only against their own SLA, not the buyer's wishes — the
-- validator therefore records, per failure, whether it fell inside SLA scope so
-- judges can apply that rule at verdict time.
-- ─────────────────────────────────────────────────────────────

-- Source 1: standing policy gains an explicit accuracy tolerance (0..1).
alter table policies
  add column if not exists accuracy_tolerance numeric(5, 4);

comment on column policies.accuracy_tolerance is
  'Person standing policy: minimum acceptable accuracy, 0..1. Null = unset.';

-- Source 3: seller Marketplace listings carry the published SLA.
create table if not exists listings (
  id                uuid primary key default gen_random_uuid(),
  seller_wallet_id  uuid not null references wallets(id) on delete cascade,
  title             text not null,
  description       text,
  -- The seller's promises. Sellers are judged ONLY against this.
  sla               jsonb not null default '{}'::jsonb,
  price_usdc        numeric(20, 6),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists listings_seller_idx on listings(seller_wallet_id);
create index if not exists listings_active_idx on listings(active) where active;
create trigger listings_updated_at before update on listings
  for each row execute function set_updated_at();

-- Link a task to the listing whose SLA governs it.
alter table tasks
  add column if not exists listing_id uuid references listings(id) on delete set null;

do $$ begin
  create type validation_outcome as enum ('approved', 'disputed');
exception when duplicate_object then null; end $$;

-- Audit of every validator run.
create table if not exists validations (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  erc8183_job_id    text,
  outcome           validation_outcome not null,
  policy_pass       boolean not null,
  task_pass         boolean not null,
  sla_pass          boolean not null,
  -- Per-source failures + whether each fell within the seller's SLA scope.
  failures          jsonb not null default '[]'::jsonb,
  rationale         text,
  deliverable_hash  text,
  created_at        timestamptz not null default now()
);
create index if not exists validations_task_idx on validations(task_id);
