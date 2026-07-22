-- Utang-Piutang (debts / receivables) for business books — the "kasbon" ledger.
-- A customer owes the user money (receivable) or the user owes a supplier
-- (payable). Payments chip away at `paid`; once paid >= amount the debt is
-- settled. All three tables are book-scoped and single-user, so RLS is the same
-- auth.uid() = user_id pattern used across the app — book ownership is
-- guaranteed transitively. Amounts are integer minor units (bigint), matching
-- transactions.amount. These tables are only surfaced in the UI for books with
-- type = 'business' (see 0036), but the schema itself is type-agnostic.

create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  name text not null,
  phone text,
  kind text not null default 'customer' check (kind in ('customer', 'supplier')),
  created_at timestamptz not null default now()
);

create table debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  contact_id uuid references contacts (id) on delete set null,
  -- receivable = a customer owes us ; payable = we owe a supplier
  direction text not null check (direction in ('receivable', 'payable')),
  amount bigint not null check (amount > 0),
  paid bigint not null default 0 check (paid >= 0),
  currency text not null default 'IDR',
  due_date date,
  note text,
  status text not null default 'open' check (status in ('open', 'paid')),
  created_at timestamptz not null default now()
);

create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  debt_id uuid not null references debts (id) on delete cascade,
  amount bigint not null check (amount > 0),
  paid_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index contacts_user_book_idx on contacts (user_id, book_id);
create index debts_user_book_idx on debts (user_id, book_id);
create index debts_contact_idx on debts (contact_id);
create index debt_payments_debt_idx on debt_payments (debt_id);

alter table contacts enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;

create policy "own contacts" on contacts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own debts" on debts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own debt_payments" on debt_payments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
