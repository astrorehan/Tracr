-- AI assistant: tags + report support.
--
-- 1. Tag names become unique PER BOOK instead of per user. The 0003 index
--    predates books (0026): with it, a user who names a tag "travel" in one
--    book can never create "travel" in another. Every other named thing
--    (accounts, categories) is book-scoped, so tags follow.
-- 2. ai_tag_summary: spending/income grouped by tag for a date range — the
--    tag flavour of ai_spending_summary. A transaction can carry several tags,
--    so one transaction may count toward several rows (that is the point of
--    tags; the model is told they overlap).

-- ----------------------------------------------------------------------------
-- Re-scope tag-name uniqueness to the book.
-- ----------------------------------------------------------------------------
drop index if exists tags_user_name_idx;
create unique index tags_book_name_idx on tags (book_id, lower(name));

-- ----------------------------------------------------------------------------
-- ai_tag_summary — totals per tag. SECURITY INVOKER like the other ai_* RPCs:
-- under a user JWT, RLS on transactions/transaction_tags/tags applies; under
-- the service role (bot webhooks) the p_book_id filter is the scope, and the
-- caller must only ever pass a book id resolved from bot_links.
-- ----------------------------------------------------------------------------
create or replace function public.ai_tag_summary(
  p_book_id uuid,
  p_start date,
  p_end date,
  p_type transaction_type default 'expense'
)
returns table (
  bucket text,
  currency text,
  total_minor bigint,
  txn_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    tg.name as bucket,
    t.currency,
    sum(t.amount)::bigint as total_minor,
    count(*)::bigint as txn_count
  from transactions t
  join transaction_tags tt on tt.transaction_id = t.id
  join tags tg on tg.id = tt.tag_id
  where t.book_id = p_book_id
    and t.type = p_type
    and t.occurred_at >= p_start::timestamptz
    and t.occurred_at < (p_end + 1)::timestamptz
  group by tg.name, t.currency
  order by total_minor desc
$$;

grant execute on function public.ai_tag_summary(uuid, date, date, transaction_type) to authenticated;
