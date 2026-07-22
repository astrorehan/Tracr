# Buku Usaha — POS-lite + Laba-Rugi — Implementation Plan

> Handoff brief for the UMKM competition build (Veternity Beraksi 2026, sub-tema
> Micro-Capital & Financial Management). Working note. Prioritizes **#1 POS-lite
> (item-based sales)** and **#4 Laba-Rugi (profit & loss)**. Everything here is
> gated to **business books** (`books.type = 'business'`); personal books are
> untouched.

## Already shipped (do not re-do)

- **Book type** — `books.type` `'personal' | 'business'` (migration `0036`),
  BookForm picker, Store icon + badge. This is the advisor list's item **#6**.
- **Utang-Piutang / kasbon** — `contacts`, `debts`, `debt_payments`
  (migration `0037`), `src/features/debts/*`, `/debts` page, WA reminder. This is
  the advisor list's item **#3**.

So of the 6 suggested UMKM features, **#3 and #6 are done.** This plan covers
**#1 (POS-lite)** and **#4 (Laba-Rugi)**. **#5 (receipts)** and **#2 (inventory)**
are deferred — see the bottom.

## Why #1 first, then #4

#1 is the keystone. Once a sale carries line items with a **cost snapshot**
(harga modal), #4 is nearly free: gross profit falls out of the item data. #1 is
also what makes the app read as a real UMKM tool rather than a personal-finance
app — it directly lifts *Relevansi Tema* (25%) and *Keberhasilan Implementasi*
(25%) in the rubric. **Inventory (#2) is deferred on purpose** — it carries the
highest live-demo bug risk (negative stock, sync) for the least marginal score.

---

## #1 POS-lite

### Concept

Today a business income entry is just a category + amount. POS-lite lets the user
sell **items**: pick "2× Nasi Goreng", the cart auto-totals, and the sale is
recorded as one income transaction plus its line items. Each line item **snapshots
the sale price and the cost** at the moment of sale, so later edits to a product's
price never rewrite past profit. (Strong Q&A point: historical P&L stays correct.)

### Schema — migration `0038_pos` (two tables)

Money is **integer minor units (`bigint`)** everywhere, matching
`transactions.amount`. Both tables are book-scoped, single-user; RLS is the same
`auth.uid() = user_id` pattern used across the app.

```sql
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
```

Apply live via Supabase MCP **and** commit the numbered file (project convention).

Image field (advisor list mentioned `gambar`) is **deferred** — Storage/upload adds
scope. Use an initial/emoji avatar for MVP.

### Types (`src/types/db.ts`)

Add `Product` / `NewProduct` and `TransactionItem` / `NewTransactionItem`
(mirror the existing `Debt` block: `Omit<..., 'id'|'user_id'|'book_id'|'created_at'>`).

### Data layer

- **`src/features/products/api.ts`** — `useProducts`, `useCreateProduct`,
  `useUpdateProduct`, `useArchiveProduct`. Book-scoped, keyed on `activeBookId`.
  Model after `src/features/debts/api.ts` (which itself follows `accounts/api.ts`).
- **`src/features/sales/api.ts`** — `useCreateSale`. This is the only non-trivial
  bit. A sale = one income `transactions` row + N `transaction_items` rows.
  - Compute `amount = Σ(qty × unit_price)` from the cart (never trust a typed total).
  - Insert the income transaction reusing the **existing** create path
    (`useCreateTransaction` in `src/features/transactions/api.ts` runs
    `withFxSnapshot` to fill `base_amount` / `fx_rate` — reuse that, don't
    reimplement). Fields: `type: 'income'`, `account_id` (which kas receives it),
    `category_id` (a "Penjualan" category, auto-created once per book or left null),
    `occurred_at`, `payee` = contact/customer name (optional), `source: 'web'`.
  - Then insert `transaction_items` (with `unit_cost` snapshot from each product).
  - **Atomicity:** Supabase has no client-side transaction. Insert the txn first,
    then the items; if the items insert fails, **delete the just-created txn**
    (compensating rollback) so no orphan income is left. *Stretch:* move this into
    a `create_sale(...)` Postgres RPC (security definer) for true atomicity — a nice
    *Keamanan & Manajemen Data* (25%) talking point — but it must also fill the FX
    snapshot, so the app-side reuse of `withFxSnapshot` is the simpler MVP.
  - `qk`: add `products`, `transactionItems`; invalidate transactions + balances +
    debts on a sale (reuse `invalidateAll`).

### UI

- **`/products` page** (`src/app/ProductsPage.tsx`) — list of products with name,
  harga jual, harga modal, and margin; add/edit via `ProductForm` modal. Match the
  Accounts/Goals/Debts list-page look. Empty state via `StarterGuide`.
- **Sale entry** (`src/features/sales/SaleForm.tsx`) — a cart: tap products to add,
  adjust qty, live running total, pick the receiving account, then **Save**. MVP is
  a **cash sale** (creates the income txn + items). *Fast-follow synergy:* a
  "Ngutang" toggle instead creates a **receivable in the already-built
  utang-piutang** module (link a contact) — reuse `useCreateDebt`.
- **Entry point** — a "Catat Jualan" (Record sale) button on the business
  dashboard / a POS-style screen. For MVP a button that opens `SaleForm` is enough.
- **Nav** — add `/products` (and later `/profit`) to the business-only sidebar block
  in `AppLayout.tsx` (the same `activeBook?.type === 'business'` gate already added
  for `/debts`); add i18n keys `nav.products`, `nav.profit`.

---

## #4 Laba-Rugi (Profit & Loss)

Cheap once items carry a cost snapshot. A period P&L for the active business book:

```
Penjualan (Omzet)   = Σ (qty × unit_price) over transaction_items in period
Modal Terjual (COGS)= Σ (qty × unit_cost)  over transaction_items in period
────────────────────────────────────────────────
Laba Kotor          = Penjualan − Modal Terjual
Biaya Operasional   = Σ expense transactions in period (rent, gaji, listrik, …)
────────────────────────────────────────────────
Laba Bersih         = Laba Kotor − Biaya Operasional
```

- **Do NOT** create a separate expense transaction for COGS — it is derived from
  `transaction_items` only. Operating costs are ordinary expense transactions
  (already supported). This avoids double counting.
- **`src/features/profit/`** — a pure compute fn (period in → the 5 numbers +
  per-product top-sellers) with a unit test, plus `src/app/ProfitPage.tsx`: a clean
  P&L card + a "top produk" breakdown. Period selector (this month default),
  matching the reports look. Plain language: *Penjualan / Modal / Untung Kotor /
  Biaya / Untung Bersih* — no accounting jargon.
- Gated to business books (nav + an in-page guard like `DebtsPage`).

---

## Gotchas

- **Snapshots are load-bearing.** P&L reads `unit_price`/`unit_cost` off
  `transaction_items`, never live `products`. Editing a product price must not
  change past profit.
- **`transaction.amount` must equal `Σ items`.** Compute the total from the cart in
  `useCreateSale`; never persist a mismatch.
- **No double-count of COGS.** COGS is derived from items, not a transaction.
- **Product delete.** Prefer archive. On hard delete, `transaction_items.product_id`
  goes null but `name` snapshot preserves history.
- **Balances.** A sale writes a normal income transaction, so `account_balances`
  (the existing view) picks it up automatically — verify the chosen account's kas
  goes up after a sale.
- **Money.** `bigint` minor units end to end; parse with `amountToMinor`, render
  with `formatMoney`.
- **Demo stability.** Keep the sale flow bullet-proof (compensating delete on
  partial failure) — a fatal bug here costs the 25% live-demo score.

---

## Phases (check in between)

1. **Products** — migration `0038_pos` (both tables), types, `products/api.ts`,
   `ProductForm`, `/products` page + business nav. *(foundation)*
2. **Item-based sale** — `sales/api.ts` `useCreateSale` (+ optional `create_sale`
   RPC), `SaleForm` cart, "Catat Jualan" entry point. *(the POS core — #1)*
3. **Laba-Rugi** — `profit/` compute + test, `ProfitPage`, business nav. *(#4 —
   cheap after phase 2)*
4. **Deferred / optional** — **#5 receipts** (render a sale as an image/PDF, share
   to WhatsApp — meaningful only after items exist), **#2 inventory** (a `stock`
   column + decrement on sale + low-stock alert — highest demo risk, post-competition).

## Kickoff prompt for a fresh session

> **Feature: Buku Usaha POS-lite + Laba-Rugi (business books only).**
>
> Read `docs/BUKU_USAHA_POS_PLAN.md` and the memory `veternity-comp-buku-usaha`
> first. `books.type` and utang-piutang are already shipped — build on them.
> Follow the project workflow: schema applied **live via Supabase MCP** AND
> committed as numbered migration files (next is `0038_pos`).
>
> **Phase 1 — Products:** `products` + `transaction_items` tables (bigint minor
> units, book-scoped, `auth.uid() = user_id` RLS), types, `products/api.ts`
> (model after `debts/api.ts`), `ProductForm`, `/products` page gated to business
> books via the existing `AppLayout` business-nav block.
>
> **Phase 2 — Sale:** `sales/api.ts` `useCreateSale` = one income transaction
> (reuse `useCreateTransaction`'s FX-snapshot path) + `transaction_items` with
> price/cost snapshots; compute the total from the cart; compensating-delete the
> txn if items fail. `SaleForm` cart UI + a "Catat Jualan" entry point.
>
> **Phase 3 — Laba-Rugi:** a pure compute fn (+ test) for Penjualan / COGS / Laba
> Kotor / Biaya / Laba Bersih over a period, then `ProfitPage`. COGS derives from
> items only — do not double-count.
>
> Gate everything to `activeBook?.type === 'business'`. Check in after each phase.
