-- ─────────────────────────────────────────────────────────────
-- SnapBack — category-first task submission.
--
-- Every listing now belongs to exactly one of a fixed set of categories
-- (mirrored in src/lib/categories.ts, which also carries the live/coming-soon
-- status — that's an app-level concept, not persisted here, since it's tied
-- to which categories have a real worker agent behind them, not data).
--
-- estimator_sessions also gets a category: it's chosen once at the start of
-- a submission (before any spec text is even typed) and stays fixed for the
-- life of that session, same as subject/subject_key already do.
-- ─────────────────────────────────────────────────────────────

do $$ begin
  create type listing_category as enum (
    'research_sourcing',
    'copywriting_content',
    'market_research_report',
    'icon_illustration_design',
    'data_engineering_scripts'
  );
exception when duplicate_object then null; end $$;

alter table listings
  add column if not exists category listing_category;

update listings set category = 'copywriting_content'      where title = 'Copywriting & content'       and category is null;
update listings set category = 'market_research_report'   where title = 'Market research report'      and category is null;
update listings set category = 'research_sourcing'        where title = 'Research & Sourcing'          and category is null;
update listings set category = 'icon_illustration_design' where title = 'Icon & illustration design'   and category is null;
update listings set category = 'data_engineering_scripts' where title = 'Data engineering & scripts'   and category is null;

alter table listings
  alter column category set not null;

create index if not exists listings_category_idx on listings(category) where active;

-- No pre-existing active sessions to worry about (testnet, no real value at
-- risk) — backfill whatever's there to the one category that ever mattered
-- and move on, no compat shim.
alter table estimator_sessions
  add column if not exists category listing_category;

update estimator_sessions set category = 'research_sourcing' where category is null;

alter table estimator_sessions
  alter column category set not null;
