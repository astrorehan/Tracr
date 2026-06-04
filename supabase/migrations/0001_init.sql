-- FinancialTracker — initial schema
-- Multi-account, multi-currency personal finance. All money stored as integer
-- minor units. Every table is row-level-security scoped to the owning user.

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type account_type as enum ('cash', 'bank_card', 'e_wallet', 'crypto', 'stocks', 'other');
create type transaction_type as enum ('income', 'expense', 'transfer');
create type category_kind as enum ('income', 'expense');
create type transaction_source as enum ('web', 'whatsapp', 'import');

-- ----------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  base_currency text not null default 'IDR',
  locale text default 'en',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- accounts
-- ----------------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type account_type not null default 'cash',
  currency text not null default 'IDR',
  opening_balance bigint not null default 0,
  icon text,
  color text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index accounts_user_idx on accounts (user_id) where is_archived = false;

-- ----------------------------------------------------------------------------
-- categories
-- ----------------------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind category_kind not null,
  parent_id uuid references categories (id) on delete set null,
  icon text,
  color text,
  created_at timestamptz not null default now()
);
create index categories_user_idx on categories (user_id);

-- ----------------------------------------------------------------------------
-- transactions
-- ----------------------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  category_id uuid references categories (id) on delete set null,
  counter_account_id uuid references accounts (id) on delete cascade,
  type transaction_type not null,
  amount bigint not null check (amount >= 0),
  currency text not null,
  occurred_at timestamptz not null default now(),
  note text,
  source transaction_source not null default 'web',
  external_ref text,
  created_at timestamptz not null default now(),
  -- A transfer must name a counter account; non-transfers must not.
  constraint transfer_has_counter check (
    (type = 'transfer' and counter_account_id is not null)
    or (type <> 'transfer' and counter_account_id is null)
  )
);
create index transactions_user_time_idx on transactions (user_id, occurred_at desc);
create index transactions_account_idx on transactions (account_id);
create index transactions_counter_idx on transactions (counter_account_id);

-- ----------------------------------------------------------------------------
-- account_balances view: opening balance + signed movements.
-- security_invoker keeps underlying-table RLS in force for the caller.
-- ----------------------------------------------------------------------------
create view account_balances with (security_invoker = on) as
with movements as (
  select account_id, user_id,
         case when type = 'income' then amount else -amount end as delta
  from transactions
  where type in ('income', 'expense')
  union all
  -- transfer: source account loses the amount
  select account_id, user_id, -amount as delta
  from transactions
  where type = 'transfer'
  union all
  -- transfer: counter account gains the amount (same-currency transfers)
  select counter_account_id as account_id, user_id, amount as delta
  from transactions
  where type = 'transfer' and counter_account_id is not null
)
select a.id as account_id,
       a.user_id,
       a.opening_balance + coalesce(sum(m.delta), 0) as balance
from accounts a
left join movements m on m.account_id = a.id
group by a.id, a.user_id, a.opening_balance;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;

create policy "own profile (select)" on profiles for select using (auth.uid() = id);
create policy "own profile (update)" on profiles for update using (auth.uid() = id);
create policy "own profile (insert)" on profiles for insert with check (auth.uid() = id);

create policy "own accounts" on accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own categories" on categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own transactions" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- New-user bootstrap: create a profile + seed default categories.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, kind, icon) values
    (new.id, 'Salary', 'income', 'briefcase'),
    (new.id, 'Business', 'income', 'store'),
    (new.id, 'Investment', 'income', 'trending-up'),
    (new.id, 'Other income', 'income', 'plus'),
    (new.id, 'Food & Drink', 'expense', 'utensils'),
    (new.id, 'Groceries', 'expense', 'shopping-cart'),
    (new.id, 'Transport', 'expense', 'car'),
    (new.id, 'Shopping', 'expense', 'shopping-bag'),
    (new.id, 'Bills & Utilities', 'expense', 'receipt'),
    (new.id, 'Entertainment', 'expense', 'clapperboard'),
    (new.id, 'Health', 'expense', 'heart-pulse'),
    (new.id, 'Other expense', 'expense', 'ellipsis');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
