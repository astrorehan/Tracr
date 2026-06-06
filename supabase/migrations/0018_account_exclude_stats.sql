-- Let an account be excluded from net worth & aggregate stats without archiving it
-- (e.g. a tracking-only or shared account). It still appears in lists and keeps its
-- own ledger; it just doesn't count toward net worth / assets / debts / allocation.
alter table public.accounts
  add column if not exists exclude_from_stats boolean not null default false;
