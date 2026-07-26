-- Installments & Amortization Schedule schema
-- Tracks recurring monthly installments (0% gadgets, KPR, loans, etc.)
-- Amounts are stored as integer minor units (bigint) matching transactions.amount.

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  account_id uuid references public.accounts (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  total_amount bigint not null check (total_amount > 0),
  tenor_months integer not null check (tenor_months > 0),
  monthly_amount bigint not null check (monthly_amount > 0),
  start_date date not null,
  due_day integer not null check (due_day between 1 and 31),
  paid_months integer not null default 0 check (paid_months >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.installment_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  installment_id uuid not null references public.installments (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  payment_number integer not null check (payment_number > 0),
  amount bigint not null check (amount > 0),
  paid_at date not null default current_date,
  created_at timestamptz not null default now()
);

-- Indexes for fast query lookups
create index installments_user_book_idx on public.installments (user_id, book_id);
create index installment_payments_installment_idx on public.installment_payments (installment_id);
create index installment_payments_user_book_idx on public.installment_payments (user_id, book_id);

-- Enable Row Level Security (RLS)
alter table public.installments enable row level security;
alter table public.installment_payments enable row level security;

-- Policies for installments and installment_payments
create policy "own installments" on public.installments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own installment_payments" on public.installment_payments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Automatic updated_at trigger for installments
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_installments_updated_at
  before update on public.installments
  for each row execute function public.handle_updated_at();
