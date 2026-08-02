-- Stable, permanent per-user sequence number for the admin-facing display ID
-- ("1" for the first account ever created, etc.) — backfilled in signup order,
-- then continued by a real sequence for every new user going forward.
alter table public.users add column user_seq bigint;

with ordered as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from public.users
)
update public.users u set user_seq = ordered.rn from ordered where ordered.id = u.id;

alter table public.users alter column user_seq set not null;

create sequence if not exists public.users_user_seq_seq;
select setval('public.users_user_seq_seq', (select max(user_seq) from public.users));
alter table public.users alter column user_seq set default nextval('public.users_user_seq_seq');
alter sequence public.users_user_seq_seq owned by public.users.user_seq;

alter table public.users add constraint users_user_seq_key unique (user_seq);
