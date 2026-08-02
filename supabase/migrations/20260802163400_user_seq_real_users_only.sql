-- user_seq should read as a clean 1, 2, 3... for real, login-capable
-- accounts. The initial backfill (20260802140000_user_seq.sql) numbered
-- every row in signup order, including the @snapback.internal seed bots
-- (demo-seller/demo-judge-*/judge-*/marketplace-seller) left over from the
-- old task-marketplace/dispute system — those never log in and are never
-- displayed anywhere, but they were eating slots (1, 8, 18 instead of
-- 1, 2, 3). Renumber real accounts only; internal accounts get NULL, since
-- their id is never read anywhere in the app.
alter table public.users alter column user_seq drop not null;

update public.users set user_seq = null where email like '%@snapback.internal';

with real_ordered as (
  select id, row_number() over (order by created_at asc, id asc) as rn
  from public.users
  where email not like '%@snapback.internal'
)
update public.users u set user_seq = real_ordered.rn from real_ordered where real_ordered.id = u.id;

select setval('public.users_user_seq_seq', (select count(*) from public.users where email not like '%@snapback.internal'));
