-- Transaction splits — divide one transaction across several categories.
-- A split transaction keeps its total in transactions.amount (so balances and
-- totals are unaffected) and sets category_id = null; the per-category breakdown
-- lives here. Amounts are integer minor units in the transaction's currency.
-- RLS-scoped per user (user_id denormalized), consistent with transaction_tags.

create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  amount bigint not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);
create index transaction_splits_tx_idx on transaction_splits (transaction_id);
create index transaction_splits_user_idx on transaction_splits (user_id);

alter table transaction_splits enable row level security;

create policy "own transaction_splits" on transaction_splits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
