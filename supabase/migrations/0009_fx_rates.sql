-- Multi-currency: manual FX rate table + per-transaction FX snapshot.
-- Stored native amounts are NEVER mutated; base-currency values are either a
-- frozen snapshot (history) or computed live (now). Rates are integer-free
-- numeric. RLS-scoped per user, consistent with the rest of the schema.

-- ----------------------------------------------------------------------------
-- fx_rates: 1 unit of `base` currency = `rate` units of `quote`, as of a date.
-- `source` lets a future live-API job upsert without any UI change.
-- ----------------------------------------------------------------------------
create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  base text not null,
  quote text not null,
  rate numeric(24, 10) not null check (rate > 0),
  as_of date not null default current_date,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint fx_rates_distinct check (base <> quote)
);
create unique index fx_rates_unique_idx on fx_rates (user_id, base, quote, as_of);
create index fx_rates_lookup_idx on fx_rates (user_id, base, quote, as_of desc);

alter table fx_rates enable row level security;
create policy "own fx_rates" on fx_rates for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Per-transaction FX snapshot (history stays frozen at the rate of the day).
--   base_amount: the transaction valued in the user's base currency (minor units)
--   fx_rate    : native -> base rate captured at create time
-- Cross-currency transfers: the counter account may be a different currency, so
-- it can be credited a different amount than the source is debited.
-- ----------------------------------------------------------------------------
alter table transactions
  add column base_amount bigint,
  add column fx_rate numeric(24, 10),
  add column counter_amount bigint,
  add column counter_fx_rate numeric(24, 10);

comment on column transactions.base_amount is
  'Frozen value of this txn in the user base currency (minor units) at create time. Null = rate unknown.';
comment on column transactions.counter_amount is
  'For transfers: amount credited to the counter account in ITS currency. Null = same-currency (use amount).';

-- Backfill: where the txn currency already equals the user base currency, the
-- snapshot is the native amount at rate 1. Transfers default counter_amount to
-- the source amount (existing transfers were all same-currency).
update transactions t
set base_amount = t.amount, fx_rate = 1
from profiles p
where p.id = t.user_id and t.currency = p.base_currency;

update transactions
set counter_amount = amount
where type = 'transfer' and counter_amount is null;

-- ----------------------------------------------------------------------------
-- account_balances: credit the counter account by counter_amount when present
-- (cross-currency transfers). Output columns unchanged.
-- ----------------------------------------------------------------------------
create or replace view account_balances with (security_invoker = on) as
with movements as (
  select account_id, user_id,
         case when type = 'income' then amount else -amount end as delta
  from transactions
  where type in ('income', 'expense')
  union all
  select account_id, user_id, -amount as delta
  from transactions
  where type = 'transfer'
  union all
  select counter_account_id as account_id, user_id,
         coalesce(counter_amount, amount) as delta
  from transactions
  where type = 'transfer' and counter_account_id is not null
)
select a.id as account_id,
       a.user_id,
       a.opening_balance + coalesce(sum(m.delta), 0) as balance
from accounts a
left join movements m on m.account_id = a.id
group by a.id, a.user_id, a.opening_balance;
