-- Budgets — a spending limit for a category (or overall) over a recurring period.
-- Amounts are integer minor units in the budget's currency (the user's base
-- currency at creation time). RLS-scoped per user, consistent with the schema.

create type budget_period as enum ('weekly', 'monthly', 'yearly');

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- null category = an overall ("all spending") budget for the period.
  category_id uuid references categories (id) on delete cascade,
  period budget_period not null default 'monthly',
  amount bigint not null check (amount >= 0),
  currency text not null,
  -- Carry unused budget into the next period (computed client-side for now).
  rollover boolean not null default false,
  created_at timestamptz not null default now()
);
create index budgets_user_idx on budgets (user_id);

-- One category budget per period, and a single overall budget per period.
create unique index budgets_category_uidx
  on budgets (user_id, period, category_id) where category_id is not null;
create unique index budgets_overall_uidx
  on budgets (user_id, period) where category_id is null;

alter table budgets enable row level security;

create policy "own budgets" on budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
