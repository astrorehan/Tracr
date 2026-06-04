-- Attachments / receipts — files attached to a transaction.
-- Files live in a private Storage bucket under a per-user folder; this table is
-- the metadata index. Object path convention: <user_id>/<transaction_id>/<uuid-name>.

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Storage RLS: a user may only touch objects under their own top-level folder.
create policy "attachments read own" on storage.objects for select
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments insert own" on storage.objects for insert
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments update own" on storage.objects for update
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments delete own" on storage.objects for delete
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null references transactions (id) on delete cascade,
  path text not null,
  name text not null,
  mime text,
  size bigint,
  created_at timestamptz not null default now()
);
create index attachments_tx_idx on attachments (transaction_id);
create index attachments_user_idx on attachments (user_id);

alter table attachments enable row level security;

create policy "own attachments" on attachments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
