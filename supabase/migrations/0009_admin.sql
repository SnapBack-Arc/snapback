-- ─────────────────────────────────────────────────────────────
-- SnapBack — admin dashboard: audit log, user flags, insurance-pool
-- ledger, and closing an RLS gap.
--
-- Every admin action that moves money or changes user state writes an
-- admin_audit_log row. wallet_flags/insurance_pool_adjustments are small,
-- append-friendly tables rather than new columns on `wallets`/`payments` —
-- keeps the admin surface additive instead of touching heavily-used,
-- already-tested tables.
--
-- RLS: buyer_dispute_stats (added in 0007, after 0005 enabled RLS on
-- everything that existed at the time) was missed — closing that gap here,
-- plus enabling RLS on the three new tables below. Same default-deny,
-- zero-policy posture as 0005: this app's auth is custom (no auth.uid()),
-- and nothing ever issues a direct browser-to-Postgrest query — all access
-- goes through the service-role client, which bypasses RLS. Real per-row
-- ownership policies for anon/authenticated would be dead code here.
-- ─────────────────────────────────────────────────────────────

do $$ begin
  create type admin_action as enum (
    'flag_user',
    'unflag_user',
    'manual_sweep_session',
    'sweep_all_abandoned',
    'revalidate_task',
    'force_resolve_dispute',
    'trigger_auto_release',
    'insurance_pool_top_up',
    'insurance_pool_withdraw'
  );
exception when duplicate_object then null; end $$;

create table if not exists admin_audit_log (
  id                uuid primary key default gen_random_uuid(),
  admin_wallet_id   uuid not null references wallets(id) on delete restrict,
  action            admin_action not null,
  -- target_type/target_id are free text (not a FK) since a single audit log
  -- spans several unrelated target tables (wallets, estimator_sessions,
  -- tasks, disputes) plus non-row targets (on-chain jobId, "all abandoned").
  target_type       text,
  target_id         text,
  amount_usdc       numeric(20, 6),
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists admin_audit_log_admin_idx on admin_audit_log(admin_wallet_id);
create index if not exists admin_audit_log_action_idx on admin_audit_log(action);
create index if not exists admin_audit_log_target_idx on admin_audit_log(target_type, target_id);

create table if not exists wallet_flags (
  wallet_id             uuid primary key references wallets(id) on delete cascade,
  flagged               boolean not null default true,
  reason                text,
  flagged_by_wallet_id  uuid references wallets(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger wallet_flags_updated_at before update on wallet_flags
  for each row execute function set_updated_at();
comment on table wallet_flags is
  'Admin pause/flag. A flagged=true row blocks new quote requests, task funding, and dispute/contest filing for that wallet — checked at each of those entry points, not enforced by a DB constraint.';

do $$ begin
  create type insurance_pool_direction as enum ('top_up', 'withdraw');
exception when duplicate_object then null; end $$;

-- The dispute-insurance pool is a LOGICAL sub-balance of the Treasury wallet,
-- not a separate on-chain wallet — post_approval_contest payouts already
-- settle from Treasury (payments.kind = 'insurance_payout', see
-- lib/disputes/service.ts:settleContestWin). This table only tracks admin
-- top-up/withdraw adjustments; the displayed balance is computed as
-- SUM(top_up) - SUM(withdraw) - SUM(insurance_payout payments), see
-- lib/admin-data.ts.
create table if not exists insurance_pool_adjustments (
  id              uuid primary key default gen_random_uuid(),
  direction       insurance_pool_direction not null,
  amount_usdc     numeric(20, 6) not null check (amount_usdc > 0),
  reason          text,
  admin_wallet_id uuid not null references wallets(id) on delete restrict,
  created_at      timestamptz not null default now()
);
create index if not exists insurance_pool_adjustments_created_idx
  on insurance_pool_adjustments(created_at desc);

alter table admin_audit_log            enable row level security;
alter table wallet_flags               enable row level security;
alter table insurance_pool_adjustments enable row level security;
alter table buyer_dispute_stats        enable row level security;
