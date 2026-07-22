-- POS-lite for business books — item-based sales + a product catalog.
-- A sale is recorded as one income transaction (see 0037-era transactions) plus
-- N transaction_items line rows. Each line SNAPSHOTS the sale price and the cost
-- (harga modal) at the moment of sale, so later edits to a product's price never
-- rewrite past profit — the Laba-Rugi report reads unit_price / unit_cost off
-- transaction_items, never live products. Both tables are book-scoped and
-- single-user, so RLS is the same auth.uid() = user_id pattern used across the
-- app — book ownership is guaranteed transitively. Money is integer minor units
-- (bigint), matching transactions.amount. These tables are only surfaced in the
-- UI for books with type = 'business' (see 0036), but the schema is type-agnostic.

-- Product / service catalog for a business book.
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  name text not null,
  price bigint not null default 0 check (price >= 0),   -- harga jual (minor units)
  cost  bigint not null default 0 check (cost  >= 0),   -- harga modal (minor units)
  unit text,                                            -- e.g. 'porsi', 'pcs' (optional)
  is_archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Line items on an income transaction (a sale). Snapshots price/cost at sale time.
create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references books (id) on delete cascade,
  transaction_id uuid not null references transactions (id) on delete cascade,
  product_id uuid references products (id) on delete set null,  -- keep history if product deleted
  name text not null,          -- snapshot of product name at sale time
  qty numeric(12,3) not null check (qty > 0),
  unit_price bigint not null check (unit_price >= 0),  -- snapshot harga jual
  unit_cost  bigint not null check (unit_cost  >= 0),  -- snapshot harga modal (for COGS)
  created_at timestamptz not null default now()
);

create index products_user_book_idx on products (user_id, book_id);
create index transaction_items_txn_idx on transaction_items (transaction_id);
create index transaction_items_user_book_idx on transaction_items (user_id, book_id);

alter table products enable row level security;
alter table transaction_items enable row level security;

create policy "own products" on products for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transaction_items" on transaction_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
