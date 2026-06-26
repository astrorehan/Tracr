-- Multiple books / profiles. One user can own several independent ledgers
-- (Personal, Business, Family, …) under a single login. A `book_id` partitions
-- every user-owned table *within* a user; reads filter by the active book and
-- inserts stamp it. This is NOT multi-user sharing — every book is still owned
-- by the one logged-in user, so RLS stays `auth.uid() = user_id` on the scoped
-- tables (book ownership is guaranteed transitively through the user).
--
-- fx_rates, push_subscriptions and profiles stay user-global on purpose:
-- currency rates are universal, and the active book lives on the profile.

-- ----------------------------------------------------------------------------
-- books — one row per ledger. owner_id is the single logged-in user.
-- ----------------------------------------------------------------------------
create table books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text,
  icon text,
  is_archived boolean not null default false,
  last_opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index books_owner_idx on books (owner_id);

alter table books enable row level security;
create policy "own books" on books for all
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Active book persists across devices on the profile; the client also mirrors
-- it to localStorage for an instant boot. on delete set null so deleting the
-- active book doesn't orphan the FK.
alter table profiles
  add column active_book_id uuid references books (id) on delete set null;

-- ----------------------------------------------------------------------------
-- book_id on every book-scoped table (13). Nullable first so existing rows
-- survive; backfilled below, then flipped to NOT NULL. on delete cascade so a
-- permanent book delete removes all of its data.
-- ----------------------------------------------------------------------------
alter table accounts                 add column book_id uuid references books (id) on delete cascade;
alter table categories               add column book_id uuid references books (id) on delete cascade;
alter table tags                     add column book_id uuid references books (id) on delete cascade;
alter table rules                    add column book_id uuid references books (id) on delete cascade;
alter table savings_goals            add column book_id uuid references books (id) on delete cascade;
alter table budgets                  add column book_id uuid references books (id) on delete cascade;
alter table recurring_transactions   add column book_id uuid references books (id) on delete cascade;
alter table transaction_templates    add column book_id uuid references books (id) on delete cascade;
alter table transactions             add column book_id uuid references books (id) on delete cascade;
alter table transaction_tags         add column book_id uuid references books (id) on delete cascade;
alter table transaction_splits       add column book_id uuid references books (id) on delete cascade;
alter table goal_contributions       add column book_id uuid references books (id) on delete cascade;
alter table attachments              add column book_id uuid references books (id) on delete cascade;

-- ----------------------------------------------------------------------------
-- Backfill: give every existing user a 'Personal' book, make it their active
-- book, then stamp all their existing rows with it.
-- ----------------------------------------------------------------------------
insert into books (owner_id, name)
select id, 'Personal' from profiles
where not exists (select 1 from books b where b.owner_id = profiles.id);

update profiles p
set active_book_id = b.id
from books b
where b.owner_id = p.id and p.active_book_id is null;

update accounts                t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update categories              t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update tags                    t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update rules                   t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update savings_goals           t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update budgets                 t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update recurring_transactions  t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update transaction_templates   t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update transactions            t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update transaction_tags        t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update transaction_splits      t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update goal_contributions      t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;
update attachments             t set book_id = p.active_book_id from profiles p where p.id = t.user_id and t.book_id is null;

-- ----------------------------------------------------------------------------
-- Now that every row is stamped, make book_id mandatory and add (user_id,
-- book_id) indexes for the active-book filter on reads.
-- ----------------------------------------------------------------------------
alter table accounts                alter column book_id set not null;
alter table categories              alter column book_id set not null;
alter table tags                    alter column book_id set not null;
alter table rules                   alter column book_id set not null;
alter table savings_goals           alter column book_id set not null;
alter table budgets                 alter column book_id set not null;
alter table recurring_transactions  alter column book_id set not null;
alter table transaction_templates   alter column book_id set not null;
alter table transactions            alter column book_id set not null;
alter table transaction_tags        alter column book_id set not null;
alter table transaction_splits      alter column book_id set not null;
alter table goal_contributions      alter column book_id set not null;
alter table attachments             alter column book_id set not null;

create index accounts_user_book_idx                on accounts (user_id, book_id);
create index categories_user_book_idx              on categories (user_id, book_id);
create index tags_user_book_idx                    on tags (user_id, book_id);
create index rules_user_book_idx                   on rules (user_id, book_id);
create index savings_goals_user_book_idx           on savings_goals (user_id, book_id);
create index budgets_user_book_idx                 on budgets (user_id, book_id);
create index recurring_transactions_user_book_idx  on recurring_transactions (user_id, book_id);
create index transaction_templates_user_book_idx   on transaction_templates (user_id, book_id);
create index transactions_user_book_idx            on transactions (user_id, book_id);
create index transaction_tags_user_book_idx        on transaction_tags (user_id, book_id);
create index transaction_splits_user_book_idx      on transaction_splits (user_id, book_id);
create index goal_contributions_user_book_idx      on goal_contributions (user_id, book_id);
create index attachments_user_book_idx             on attachments (user_id, book_id);
