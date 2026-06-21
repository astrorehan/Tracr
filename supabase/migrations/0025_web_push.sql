-- Web push notifications. Layers on top of the in-app notification center:
-- a daily pg_cron job pings the `send-push` Edge Function, which re-runs the
-- same bill/budget builders server-side and delivers a Web Push to every
-- registered device. Mirrors the recurring-autopost cron→function→secret design
-- (migration 0013).
--
-- VAPID keys are NOT stored here (a committed migration would leak the private
-- key). They live in public.app_secrets, inserted out-of-band by the operator:
--   vapid_public / vapid_private  (web-push base64url keypair)
--   vapid_subject                 (mailto: contact for the push service)

-- ----------------------------------------------------------------------------
-- push_subscriptions — one row per browser/device PushManager subscription.
-- ----------------------------------------------------------------------------
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The push service endpoint is globally unique; upsert on it to re-register.
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
create policy "own push_subscriptions" on push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- push_sent — de-dupe ledger keyed by the notification's stable id, so a given
-- alert (e.g. "rent due 2026-07-01") is pushed once, not every daily run.
-- Written only by the service role inside the Edge Function.
-- ----------------------------------------------------------------------------
create table push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_id text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

alter table push_sent enable row level security;
create policy "own push_sent" on push_sent for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Shared secret the cron uses to authenticate to the Edge Function (mirrors
-- autopost_token). VAPID keys are added separately, out of git.
-- ----------------------------------------------------------------------------
insert into public.app_secrets (key, value)
values ('push_token', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Daily job (00:23 UTC, a few minutes after autopost). No-op until at least one
-- device is subscribed. Named jobs upsert, so re-running just refreshes it.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-push-daily',
  '23 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://nlwthwufphnchstssnjr.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.app_secrets where key = 'push_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);
