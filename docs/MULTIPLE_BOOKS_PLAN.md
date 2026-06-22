# Multiple Books / Profiles — Implementation Plan

> Handoff brief for a fresh session. **Not committed** — working note only.

## Scope

"Multiple books/profiles" = **one user, several independent ledgers** (Personal,
Business, Family) under a single login, with a **Google-Docs-style list** to pick
one. This is **NOT** shared/multi-user wallets (that's the separate 🔴 "shared
spaces" item). Every book here is still owned by the one logged-in user — book_id
just partitions data *within* a user, so there's no new attack surface.

## Core design

A new `books` table, plus a nullable-then-NOT-NULL `book_id` on every user-owned
table. Reads filter by the **active book**; inserts stamp it. RLS still scopes by
`user_id`.

**Book-scoped tables (13)** — add `book_id`:
`accounts, categories, tags, rules, savings_goals, budgets, recurring_transactions,
transaction_templates, transactions, transaction_tags, transaction_splits,
goal_contributions, attachments`

**Stay user-global (do NOT scope):** `fx_rates` (currency rates are universal),
`push_subscriptions`, `profiles`.

**Active book** lives in `profiles.active_book_id` (persists across devices) and is
mirrored to `localStorage` for instant boot.

## Decisions to confirm (recommended defaults)

1. **Join tables** (`transaction_tags`, `transaction_splits`, `goal_contributions`):
   own `book_id` for uniform filtering **vs** inherit via parent row.
   → *Recommend: add `book_id` to all for uniform RLS + simpler queries.*
2. **Switcher placement:** sidebar dropdown **and** a `/books` page.
   → *Recommend: both.*
3. **Deleting a book:** hard-delete (cascade everything) vs archive-only.
   → *Recommend: archive + a separate "delete permanently" with typed confirmation,
   like account deletion.*
4. **Web-push reminders:** span all books vs active book only.
   → *Recommend: all books, label each alert with its book name.*

## Migration plan (next number: `0026_books`)

Single migration, ordered so it's safe on live data:

1. `create table books (id, owner_id → auth.users, name, color, icon, is_archived,
   created_at)`. RLS: `auth.uid() = owner_id`.
2. Add `active_book_id uuid references books(id)` to `profiles`.
3. `alter table … add column book_id uuid references books(id)` on all 13 tables
   (nullable for now).
4. **Backfill:** for each existing user, insert one `'Personal'` book;
   `update <table> set book_id = <that book>` for all their rows; set
   `profiles.active_book_id`.
5. `alter column book_id set not null` on the 13 tables + add `(user_id, book_id)`
   indexes.
6. Update RLS to keep `auth.uid() = user_id` (book ownership guaranteed
   transitively; optionally add an EXISTS check against `books`).

Apply live via Supabase MCP **and** commit the numbered file.

## Data-layer changes (bulk of the work)

- **`useActiveBook()` context** (new) — `activeBookId`, `books`, `setActiveBook()`.
  Wrap in `AuthProvider` after profile loads.
- **`qk` query keys** (`src/lib/queryClient.ts`): thread `bookId` into every key
  (e.g. `accounts: (bookId) => ['accounts', bookId]`) so switching refetches.
- **~16 `api.ts` files** (the ones that stamp `user_id` today): each read gets
  `.eq('book_id', activeBookId)`; each insert adds `book_id: activeBookId`. The
  pattern is mechanical — model after `useCreateAccount` in
  `src/features/accounts/api.ts`.
- **Backup/restore** (`src/features/data/backup.ts`): per active book; re-stamp
  `book_id` on restore into the active book.
- **CSV import** stamps the active book automatically (no UI change).

## UI (the Google-Docs list)

- **`/books` page** — card/row grid of all books: name, color/icon, a tiny stat
  (account count or net worth), "last opened". Click → set active + go to Dashboard.
  Per-card actions: **Open, Rename, Duplicate (structure only / with data), Archive,
  Delete**. A "＋ New book" card. Match the look of Accounts/Goals list pages.
- **Sidebar switcher** — current book name at the top of the rail with a dropdown
  to switch or jump to "All books".
- **First-run** — the backfilled `'Personal'` book means existing users see no
  disruption.

## Gotchas

- **Transfers** only make sense within one book (accounts are book-scoped) — already
  naturally enforced.
- **Reports/Dashboard/Notifications** read through scoped queries, so they work per
  book once api layer is updated — but verify the **client-side notification
  builders** and **FX net-worth** see only the active book's data (no cross-book
  leakage).
- **Query-key churn:** any query missing `bookId` in its key shows the wrong book
  after a switch — grep for direct `supabase.from(...)` calls outside `api.ts`.
- **Web-push Edge Function** runs server-side per user across all books — see
  decision #4.

## Kickoff prompt for the new session

> **Feature: Multiple books/profiles (single-user, multiple independent ledgers —
> NOT shared wallets).**
>
> Implement "books": one user can have several independent ledgers (Personal,
> Business, …) under one login, switchable via a Google-Docs-style list. Each book is
> owned by the one logged-in user; this is not multi-user sharing.
>
> Read `docs/FEATURES.md` §13, `docs/MULTIPLE_BOOKS_PLAN.md`, and the memory
> `phase2a-execution` for conventions first. Follow the established workflow: schema
> changes applied **live via the Supabase MCP** AND committed as a numbered migration
> file (next is `0026_books`).
>
> **Schema:** new `books` table (owner_id → auth.users, name, color, icon,
> is_archived), `profiles.active_book_id`, and a `book_id` on these 13 tables:
> accounts, categories, tags, rules, savings_goals, budgets, recurring_transactions,
> transaction_templates, transactions, transaction_tags, transaction_splits,
> goal_contributions, attachments. Keep fx_rates / push_subscriptions / profiles
> user-global. Backfill a `'Personal'` book per existing user and set all rows'
> book_id before making it NOT NULL. RLS stays `auth.uid() = user_id`.
>
> **Data layer:** add a `useActiveBook()` context (activeBookId + book list + setter,
> persisted to profiles.active_book_id and localStorage); thread `bookId` into every
> `qk` query key; add `.eq('book_id', activeBookId)` to every read and `book_id` to
> every insert across the api.ts files; make backup/restore per-active-book.
>
> **UI:** a `/books` page listing books as cards (open/rename/duplicate/archive/
> delete, ＋new) like Google Docs, plus a book switcher in the sidebar header.
>
> Before coding, confirm with me: (1) book_id on join tables vs inherit-from-parent,
> (2) hard-delete vs archive for books, (3) whether web-push reminders span all books.
> Then plan it in phases (migration → context+query keys → api layer → UI) and check
> in between phases. Build on a new branch `feat/multiple-books` off `main`.
