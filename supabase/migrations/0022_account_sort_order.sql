-- Manual ordering for the accounts list (drag-to-reorder), mirroring
-- categories.sort_order. Lower sorts first. Adding a column with a constant
-- default is metadata-only, so this is fast.

alter table accounts
  add column sort_order integer not null default 0;

comment on column accounts.sort_order is
  'Manual ordering within a user''s accounts list (lower = first); seeded from created_at.';

-- Seed sort_order from the current created_at order, per user, so existing
-- accounts keep their familiar order until the user drags them.
with ranked as (
  select id, row_number() over (partition by user_id order by created_at) as rn
  from accounts
)
update accounts a
set sort_order = r.rn
from ranked r
where r.id = a.id;

create index accounts_sort_idx on accounts (user_id, sort_order);
