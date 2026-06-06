-- Recurring auto-generator (opt-in). The existing design never auto-posts: the
-- user taps "Mark paid". This layers an OPTIONAL server-side generator on top —
-- a daily pg_cron job pings an Edge Function that posts every due schedule whose
-- owner flipped `auto_post = true`. Schedules stay confirm-each by default.

-- 1. Opt-in flag. Default false → existing bills are untouched.
alter table public.recurring_transactions
  add column if not exists auto_post boolean not null default false;

-- Generator query: active + auto + due. Partial index keeps the daily scan cheap.
create index if not exists recurring_autopost_idx
  on public.recurring_transactions (next_due)
  where is_active and auto_post;

-- 2. Shared secret the cron uses to authenticate to the Edge Function. Stored in
-- a private table (RLS on, no policies) so only the service role / superuser can
-- read it — never anon/authenticated, never committed to git. The value is
-- generated server-side at migration time.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;

insert into public.app_secrets (key, value)
values ('autopost_token', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- 3. Scheduler + async HTTP.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 4. Daily job (00:17 UTC). No-op until at least one schedule has auto_post=true.
--    Named jobs upsert, so re-running this migration just refreshes the schedule.
select cron.schedule(
  'recurring-autopost-daily',
  '17 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://nlwthwufphnchstssnjr.supabase.co/functions/v1/recurring-autopost',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.app_secrets where key = 'autopost_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
