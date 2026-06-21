-- Quick templates / favorites: one-tap repeat of common entries. A template is
-- a saved transaction shape (type, account, category, amount, payee, note) that
-- pre-fills the add form. References to accounts/categories null out if those
-- are deleted, so a template never blocks cleanup. RLS-scoped per user.

create table transaction_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type transaction_type not null default 'expense',
  account_id uuid references accounts (id) on delete set null,
  category_id uuid references categories (id) on delete set null,
  -- Default amount in minor units (0 = leave the amount blank when applied).
  amount bigint not null default 0 check (amount >= 0),
  payee text,
  note text,
  created_at timestamptz not null default now()
);
create index transaction_templates_user_idx on transaction_templates (user_id);

alter table transaction_templates enable row level security;

create policy "own transaction_templates" on transaction_templates for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
