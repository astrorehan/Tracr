-- Tags — free-form, many-to-many labels on transactions.
-- A tag belongs to one user; a transaction can carry many tags and vice-versa.
-- Both tables are RLS-scoped per user, consistent with the rest of the schema.

-- ----------------------------------------------------------------------------
-- tags
-- ----------------------------------------------------------------------------
create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);
create index tags_user_idx on tags (user_id);
-- Case-insensitive uniqueness so "Travel" and "travel" can't both exist.
create unique index tags_user_name_idx on tags (user_id, lower(name));

-- ----------------------------------------------------------------------------
-- transaction_tags (join). user_id is denormalized so RLS stays a simple
-- auth.uid() check without sub-selecting the parent transaction.
-- ----------------------------------------------------------------------------
create table transaction_tags (
  transaction_id uuid not null references transactions (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (transaction_id, tag_id)
);
create index transaction_tags_tag_idx on transaction_tags (tag_id);
create index transaction_tags_user_idx on transaction_tags (user_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table tags enable row level security;
alter table transaction_tags enable row level security;

create policy "own tags" on tags for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own transaction_tags" on transaction_tags for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
