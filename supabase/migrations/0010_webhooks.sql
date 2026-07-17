-- ─────────────────────────────────────────────────────────────
-- SnapBack — event-driven state: Circle Contract Event Monitoring +
-- wallet transaction webhooks (replaces the missing keeper/cron).
--
-- job_events: append-only decoded on-chain event log per SnapBackEscrow/
-- JudgeRegistry jobId, written by the webhook receiver
-- (lib/webhooks/handle-notification.ts) when a Circle `contracts.eventLog`
-- notification fires. This is additive observability + the source the task
-- detail stepper reads to reflect confirmations — it does not replace
-- `payments`/`tasks` as the settlement source of truth, but the webhook
-- handler does update those tables' status columns (already-existing enum
-- values only, e.g. payments.status -> 'released'/'refunded'/'failed') when
-- an event confirms a state transition that nothing previously recorded.
--
-- webhook_notifications_log: dedupe + delivery audit trail, keyed by
-- Circle's own notificationId. Circle's webhooks are at-least-once — the
-- receiver inserts here before processing (unique constraint = the dedupe
-- gate) and records success/error, giving the admin something to inspect
-- when a webhook silently fails instead of it vanishing into a 500 log line.
--
-- RLS: same default-deny, zero-policy posture as 0005/0009 — this app has
-- no auth.uid() (custom Circle-OTP + signed-cookie auth), every real read
-- goes through the service-role client (which bypasses RLS), and the
-- webhook receiver itself also uses the service-role client (Circle calls
-- our API directly over HTTPS with its own signature scheme, not Postgrest).
-- ─────────────────────────────────────────────────────────────

create table if not exists job_events (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid references tasks(id) on delete cascade,
  job_id        text not null,
  contract      text not null,             -- 'SnapBackEscrow' | 'JudgeRegistry'
  event_name    text not null,
  tx_hash       text,
  block_height  bigint,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists job_events_task_idx on job_events(task_id);
create index if not exists job_events_job_idx on job_events(job_id);
create index if not exists job_events_created_idx on job_events(created_at desc);

-- Fast lookup from an on-chain jobId (as decoded off a webhook event) back
-- to the task that created it (tasks.metadata->>'erc8183_job_id').
create index if not exists tasks_job_id_idx on tasks ((metadata ->> 'erc8183_job_id'));

create table if not exists webhook_notifications_log (
  notification_id    uuid primary key,
  notification_type  text not null,
  status              text not null default 'received'
                       check (status in ('received', 'processed', 'error')),
  error               text,
  received_at         timestamptz not null default now(),
  processed_at         timestamptz
);
create index if not exists webhook_notifications_log_type_idx
  on webhook_notifications_log(notification_type);

alter table job_events                enable row level security;
alter table webhook_notifications_log enable row level security;
