-- Category management: archive (hide without deleting) + manual sort order.
-- Merge is handled client-side (reassign references, then delete) — no schema.

alter table categories
  add column is_archived boolean not null default false,
  add column sort_order integer not null default 0;

comment on column categories.is_archived is
  'Archived categories are hidden from pickers but still resolve names on existing rows.';
comment on column categories.sort_order is
  'Manual ordering within a (kind, parent) sibling group; lower = first.';

-- Seed sort_order from the current alphabetical order within each sibling group
-- (top-level grouped by kind; children grouped under their parent).
with ranked as (
  select id,
         row_number() over (
           partition by user_id, kind,
                        coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
           order by name
         ) as rn
  from categories
)
update categories c
set sort_order = r.rn
from ranked r
where r.id = c.id;

create index categories_sort_idx on categories (user_id, kind, sort_order);
