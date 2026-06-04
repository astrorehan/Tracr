-- Savings goals ("piggy banks") + a contribution ledger.
-- A goal has a target; contributions (signed minor units: + deposit, - withdraw)
-- track progress toward it. Contributions are a standalone ledger — they do NOT
-- move real account balances (the linked account is informational). RLS per user.

create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_amount bigint not null check (target_amount >= 0),
  currency text not null,
  target_date date,
  -- Optional informational link to an account; doesn't move funds.
  account_id uuid references accounts (id) on delete set null,
  color text,
  icon text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index savings_goals_user_idx on savings_goals (user_id);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references savings_goals (id) on delete cascade,
  -- Signed: positive = money added, negative = withdrawn.
  amount bigint not null,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index goal_contributions_goal_idx on goal_contributions (goal_id);
create index goal_contributions_user_idx on goal_contributions (user_id);

alter table savings_goals enable row level security;
alter table goal_contributions enable row level security;

create policy "own savings_goals" on savings_goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own goal_contributions" on goal_contributions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
