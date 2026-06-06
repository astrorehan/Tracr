-- Rules engine (Firefly-style): "if payee contains GoFood -> category Food,
-- tag delivery". Rules run in sort_order on transaction create, CSV import, and
-- on-demand against existing rows. Conditions/actions are JSONB so the shape can
-- grow without migrations. RLS-scoped per user, consistent with the schema.

create table rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  -- 'all' = every condition must match; 'any' = at least one.
  match_type text not null default 'all' check (match_type in ('all', 'any')),
  -- [{ "field": "payee|note|amount|type", "op": "contains|equals|starts_with|gt|lt", "value": "..." }]
  conditions jsonb not null default '[]'::jsonb,
  -- { "category_id": uuid|null, "tag_ids": [uuid, ...] }
  actions jsonb not null default '{}'::jsonb,
  -- Stop evaluating later rules once this one matches.
  stop_after boolean not null default false,
  created_at timestamptz not null default now()
);
create index rules_user_idx on rules (user_id, is_active, sort_order);

alter table rules enable row level security;
create policy "own rules" on rules for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
