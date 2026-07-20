-- AI credits system, replacing the flat monthly ai_usage cap (migration 0030).
--
-- Two independently-tracked pools per user:
--   * credits_subscription — this plan's monthly allotment. Bucketed by `ym`
--     exactly like ai_usage, created lazily on first use of a new month.
--     Never carries a balance forward — that IS the "expire at month end"
--     rule; an old ym's leftover is simply never read into the new one.
--   * credits_topup        — Midtrans-purchased packs (future migration wires
--     up the purchase flow). A single running balance per user; never
--     expires, never resets.
-- credit_ledger is the append-only transparency log: every grant,
-- consumption, purchase, and expiry is one row, individually visible.
--
-- billing_plans / credit_packs are config tables so "10", "150", and pack
-- pricing live in exactly one place, editable via SQL — never hardcoded.
--
-- payment_orders / subscriptions are the Midtrans-facing tables, created now
-- so the self-heal check below can reference `subscriptions` immediately.
-- They stay empty until a follow-up migration adds the Midtrans-webhook-
-- facing write RPCs (credit_topup_grant, subscription_start, etc.) — this
-- migration only ever reads them.

alter table profiles
  add column plan text not null default 'free' check (plan in ('free', 'pro'));

-- ----------------------------------------------------------------------------
-- billing_plans — the ONLY place "10" and "150" are defined.
-- ----------------------------------------------------------------------------
create table billing_plans (
  plan text primary key check (plan in ('free', 'pro')),
  monthly_credits int not null check (monthly_credits > 0),
  price_monthly_idr bigint,                      -- null for free
  price_yearly_idr bigint,                        -- null for free
  -- Pro-only launch gate: Midtrans recurring billing needs account-level
  -- approval before real subscriptions can be sold. Seeded false; flip true
  -- once the sandbox verification checklist passes. Checked by the future
  -- checkout function AND the frontend.
  is_purchasable boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into billing_plans (plan, monthly_credits, price_monthly_idr, price_yearly_idr, is_purchasable) values
  ('free', 10, null, null, true),
  ('pro', 150, 49000, 470000, false);  -- PLACEHOLDER PRICES — edit before launch

alter table billing_plans enable row level security;
create policy "billing_plans (select)" on billing_plans for select using (auth.role() = 'authenticated');
-- No write policy: the operator edits these two rows directly via SQL.

-- ----------------------------------------------------------------------------
-- credit_packs — top-up pack definitions, placeholder pricing.
-- ----------------------------------------------------------------------------
create table credit_packs (
  id text primary key,                            -- stable slug, e.g. 'pack_20'
  credits int not null check (credits > 0),
  price_idr bigint not null check (price_idr > 0),
  sort_order int not null default 0,
  is_active boolean not null default true,         -- retire without deleting purchase history
  created_at timestamptz not null default now()
);

insert into credit_packs (id, credits, price_idr, sort_order) values
  ('pack_20',  20,  15000, 1),   -- PLACEHOLDER PRICING — edit before launch
  ('pack_60',  60,  40000, 2),
  ('pack_150', 150, 90000, 3);

alter table credit_packs enable row level security;
create policy "credit_packs (select)" on credit_packs for select using (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- credits_subscription — this month's plan-granted pool, lazily created.
-- ----------------------------------------------------------------------------
create table credits_subscription (
  user_id uuid not null references auth.users (id) on delete cascade,
  ym text not null,
  granted int not null,
  used int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, ym)
);

alter table credits_subscription enable row level security;
create policy "own credits_subscription (select)" on credits_subscription
  for select using (auth.uid() = user_id);
-- No write policy: only SECURITY DEFINER functions write this.

-- ----------------------------------------------------------------------------
-- credits_topup — never-expiring purchased balance, one row per user.
-- ----------------------------------------------------------------------------
create table credits_topup (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table credits_topup enable row level security;
create policy "own credits_topup (select)" on credits_topup for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- credit_ledger — append-only transparency log. Never updated or deleted.
-- ----------------------------------------------------------------------------
create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pool text not null check (pool in ('subscription', 'topup')),
  delta int not null check (delta <> 0),
  reason text not null check (reason in (
    'monthly_grant', 'consume', 'topup_purchase', 'expire', 'admin_adjustment'
  )),
  balance_after int not null check (balance_after >= 0),
  ref text,                                         -- ym bucket, order_id, or null
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on credit_ledger (user_id, created_at desc);

alter table credit_ledger enable row level security;
create policy "own credit_ledger (select)" on credit_ledger for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- subscriptions — Pro billing lifecycle. Multiple historical rows allowed
-- (cancel, resubscribe); partial unique index keeps at most one active row.
-- Empty until the Midtrans checkout/webhook migration writes to it.
-- ----------------------------------------------------------------------------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  midtrans_subscription_id text unique,             -- null until Midtrans confirms
  plan text not null default 'pro' check (plan = 'pro'),
  billing_period text not null check (billing_period in ('monthly', 'yearly')),
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on subscriptions (user_id, created_at desc);
create unique index subscriptions_one_active_per_user
  on subscriptions (user_id) where status in ('active', 'past_due');

alter table subscriptions enable row level security;
create policy "own subscriptions (select)" on subscriptions for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- payment_orders — every Midtrans order, keyed by OUR order_id (the future
-- webhook's idempotency key). Doubles as payment history. Empty until the
-- Midtrans checkout/webhook migration writes to it.
-- ----------------------------------------------------------------------------
create table payment_orders (
  order_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('topup', 'subscription_initial', 'subscription_renewal')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  credit_pack_id text references credit_packs (id),
  billing_plan text references billing_plans (plan),
  billing_period text check (billing_period in ('monthly', 'yearly')),
  gross_amount_idr bigint not null check (gross_amount_idr > 0),
  midtrans_transaction_id text,
  raw_notification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_orders_kind_fields check (
    (kind = 'topup' and credit_pack_id is not null and billing_plan is null)
    or (kind in ('subscription_initial', 'subscription_renewal')
        and billing_plan is not null and billing_period is not null and credit_pack_id is null)
  )
);
create index payment_orders_user_idx on payment_orders (user_id, created_at desc);

alter table payment_orders enable row level security;
create policy "own payment_orders (select)" on payment_orders for select using (auth.uid() = user_id);
create policy "own payment_orders (insert)" on payment_orders for insert with check (auth.uid() = user_id);
-- No update/delete policy for users — status transitions are SECURITY
-- DEFINER-only, reached only via the (future) service-role webhook.

-- ----------------------------------------------------------------------------
-- Cutover backfill: seed this month's pool from the outgoing ai_usage counter
-- so nobody gets a mid-month reset bonus. Every existing user is on 'free'
-- (column default), so this seeds granted=10 even though their historical
-- cap was 50 — that reduction is the confirmed new behavior; `used` may
-- legitimately exceed 10. ai_usage itself is left in place, unused — safe to
-- drop in a later cleanup migration once this system is confirmed stable.
-- ----------------------------------------------------------------------------
insert into credits_subscription (user_id, ym, granted, used)
select user_id, ym, 10, calls from ai_usage
where ym = to_char(now(), 'YYYY-MM')
on conflict (user_id, ym) do nothing;

-- ----------------------------------------------------------------------------
-- Replace ai_try_consume / ai_try_consume_for outright. Both call sites are
-- updated in the same deploy (ai-analysis/index.ts, _shared/bot-core.ts).
-- ----------------------------------------------------------------------------
drop function if exists public.ai_try_consume(int);
drop function if exists public.ai_try_consume_for(uuid, int);

-- _credits_ensure_month: ensures the user's current-ym subscription row
-- exists and is capped at least at p_monthly_credits. Logs `monthly_grant`
-- exactly when the cap rises (first row of the month, or a mid-month
-- upgrade); logs the previous month's leftover as `expire` the first time a
-- new month opens. Internal only (see grants below).
create or replace function public._credits_ensure_month(p_user uuid, p_monthly_credits int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cur text := to_char(now(), 'YYYY-MM');
  prev_ym text := to_char(now() - interval '1 month', 'YYYY-MM');
  v_prev_granted int;
  v_used int;
  v_leftover int;
begin
  select granted, used into v_prev_granted, v_used
    from credits_subscription where user_id = p_user and ym = cur for update;

  if v_prev_granted is null then
    insert into credits_subscription (user_id, ym, granted, used)
      values (p_user, cur, p_monthly_credits, 0);
    insert into credit_ledger (user_id, pool, delta, reason, balance_after, ref)
      values (p_user, 'subscription', p_monthly_credits, 'monthly_grant', p_monthly_credits, cur);

    select granted - used into v_leftover from credits_subscription
      where user_id = p_user and ym = prev_ym;
    if v_leftover is not null and v_leftover > 0 then
      insert into credit_ledger (user_id, pool, delta, reason, balance_after, ref)
        values (p_user, 'subscription', -v_leftover, 'expire', 0, prev_ym);
    end if;
  elsif v_prev_granted < p_monthly_credits then
    update credits_subscription set granted = p_monthly_credits, updated_at = now()
      where user_id = p_user and ym = cur;
    insert into credit_ledger (user_id, pool, delta, reason, balance_after, ref)
      values (p_user, 'subscription', p_monthly_credits - v_prev_granted, 'monthly_grant',
              p_monthly_credits - v_used, cur);
  end if;
end;
$$;

revoke all on function public._credits_ensure_month(uuid, int) from public;
revoke execute on function public._credits_ensure_month(uuid, int) from anon;
revoke execute on function public._credits_ensure_month(uuid, int) from authenticated;

-- _ai_credits_consume_core: shared logic behind both public wrappers below.
-- Self-heals a lapsed Pro subscription, ensures this month's pool exists,
-- then spends one credit — subscription pool first, top-up pool second.
create or replace function public._ai_credits_consume_core(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cur text := to_char(now(), 'YYYY-MM');
  v_plan text;
  v_monthly_credits int;
  v_granted int;
  v_used int;
  v_sub_remaining int;
  v_topup_balance int;
begin
  if p_user is null then
    return jsonb_build_object('allowed', false, 'source', null, 'subscription_remaining', 0, 'topup_remaining', 0);
  end if;

  select plan into v_plan from profiles where id = p_user for update;
  v_plan := coalesce(v_plan, 'free');

  -- Self-heal: a Pro user whose subscription lapsed with no renewal recorded
  -- is effectively back on Free. Catches a missed/failed webhook lazily, no
  -- cron needed.
  if v_plan = 'pro' and not exists (
    select 1 from subscriptions
    where user_id = p_user and status in ('active', 'past_due') and current_period_end >= now()
  ) then
    update profiles set plan = 'free' where id = p_user;
    v_plan := 'free';
  end if;

  select monthly_credits into v_monthly_credits from billing_plans where plan = v_plan;
  v_monthly_credits := coalesce(v_monthly_credits, 10);

  perform public._credits_ensure_month(p_user, v_monthly_credits);

  select granted, used into v_granted, v_used
    from credits_subscription where user_id = p_user and ym = cur;
  v_sub_remaining := greatest(v_granted - v_used, 0);

  if v_sub_remaining > 0 then
    update credits_subscription set used = used + 1, updated_at = now()
      where user_id = p_user and ym = cur
      returning granted - used into v_sub_remaining;
    insert into credit_ledger (user_id, pool, delta, reason, balance_after, ref)
      values (p_user, 'subscription', -1, 'consume', v_sub_remaining, cur);

    select balance into v_topup_balance from credits_topup where user_id = p_user;
    return jsonb_build_object('allowed', true, 'source', 'subscription',
      'subscription_remaining', v_sub_remaining, 'topup_remaining', coalesce(v_topup_balance, 0));
  end if;

  update credits_topup set balance = balance - 1, updated_at = now()
    where user_id = p_user and balance > 0
    returning balance into v_topup_balance;

  if v_topup_balance is not null then
    insert into credit_ledger (user_id, pool, delta, reason, balance_after, ref)
      values (p_user, 'topup', -1, 'consume', v_topup_balance, cur);
    return jsonb_build_object('allowed', true, 'source', 'topup',
      'subscription_remaining', 0, 'topup_remaining', v_topup_balance);
  end if;

  select balance into v_topup_balance from credits_topup where user_id = p_user;
  return jsonb_build_object('allowed', false, 'source', null,
    'subscription_remaining', 0, 'topup_remaining', coalesce(v_topup_balance, 0));
end;
$$;

revoke all on function public._ai_credits_consume_core(uuid) from public;
revoke execute on function public._ai_credits_consume_core(uuid) from anon;
revoke execute on function public._ai_credits_consume_core(uuid) from authenticated;

-- ai_credits_consume: authenticated entry point (web). Same grant split as
-- the old ai_try_consume.
create or replace function public.ai_credits_consume()
returns jsonb
language plpgsql security definer set search_path = public
as $$ begin return public._ai_credits_consume_core(auth.uid()); end; $$;

revoke all on function public.ai_credits_consume() from public;
revoke execute on function public.ai_credits_consume() from anon;
grant execute on function public.ai_credits_consume() to authenticated;

-- ai_credits_consume_for: service-role entry point (WhatsApp/Telegram bots,
-- called from _shared/bot-core.ts).
create or replace function public.ai_credits_consume_for(p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$ begin return public._ai_credits_consume_core(p_user); end; $$;

revoke all on function public.ai_credits_consume_for(uuid) from public;
revoke execute on function public.ai_credits_consume_for(uuid) from anon;
revoke execute on function public.ai_credits_consume_for(uuid) from authenticated;
grant execute on function public.ai_credits_consume_for(uuid) to service_role;

-- credits_balance: read-only, for the frontend chip + Billing page. Falls
-- back to billing_plans.monthly_credits when this month's row doesn't exist
-- yet, so the chip shows the real allotment instead of "0" before any spend.
create or replace function public.credits_balance()
returns jsonb
language sql stable security invoker set search_path = public
as $$
  select jsonb_build_object(
    'plan', p.plan,
    'ym', to_char(now(), 'YYYY-MM'),
    'subscription_granted', coalesce(cs.granted, bp.monthly_credits, 0),
    'subscription_used', coalesce(cs.used, 0),
    'subscription_remaining', greatest(coalesce(cs.granted, bp.monthly_credits, 0) - coalesce(cs.used, 0), 0),
    'topup_balance', coalesce(ct.balance, 0)
  )
  from profiles p
  left join billing_plans bp on bp.plan = p.plan
  left join credits_subscription cs on cs.user_id = p.id and cs.ym = to_char(now(), 'YYYY-MM')
  left join credits_topup ct on ct.user_id = p.id
  where p.id = auth.uid()
$$;

revoke all on function public.credits_balance() from public;
revoke execute on function public.credits_balance() from anon;
grant execute on function public.credits_balance() to authenticated;
