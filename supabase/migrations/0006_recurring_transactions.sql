-- Recurring transactions / bills & subscriptions.
-- A schedule (name, amount, account, category, frequency, next due date). We do
-- NOT auto-post; the UI surfaces a due/overdue list and the user taps "Mark paid"
-- to create the real transaction and advance next_due. RLS-scoped per user.

create type recurrence_freq as enum ('weekly', 'monthly', 'yearly');

create table recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type transaction_type not null default 'expense',
  account_id uuid not null references accounts (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  amount bigint not null check (amount >= 0),
  currency text not null,
  frequency recurrence_freq not null default 'monthly',
  interval int not null default 1 check (interval >= 1),
  next_due date not null,
  is_active boolean not null default true,
  note text,
  last_paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index recurring_user_idx on recurring_transactions (user_id);
create index recurring_due_idx on recurring_transactions (user_id, next_due) where is_active;

alter table recurring_transactions enable row level security;

create policy "own recurring_transactions" on recurring_transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
