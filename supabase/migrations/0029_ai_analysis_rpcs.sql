-- AI spending insights — read-only aggregate RPCs.
--
-- These are the tools the LLM (Gemini) is allowed to call. The model never sees
-- raw rows or emits SQL: it picks one of these functions and structured args,
-- Postgres does the aggregation, and only small summaries leave the database.
--
-- Every function is SECURITY INVOKER (the default, made explicit) so it runs as
-- the calling user and the existing row-level-security policies on transactions
-- / categories / accounts / budgets stay in force. A user can therefore only
-- ever aggregate their own data — passing someone else's book_id just returns
-- empty, because the RLS predicate (auth.uid() = user_id) filters first.
--
-- Money stays in integer minor units here; the edge function formats it to
-- human strings before handing results to the model.
--
-- v1 approximations (documented on purpose):
--   * category rollup uses transactions.category_id and ignores transaction
--     splits and child→parent nesting.
--   * date filtering compares occurred_at in the server timezone.

-- ---------------------------------------------------------------------------
-- period_totals: income / expense / net for a date range, one row per currency.
-- The model calls this twice (two ranges) to compare periods.
-- ---------------------------------------------------------------------------
create or replace function public.ai_period_totals(
  p_book_id uuid,
  p_start date,
  p_end date
)
returns table (
  currency text,
  income_minor bigint,
  expense_minor bigint,
  net_minor bigint,
  txn_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.currency,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0)::bigint,
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)::bigint,
    (coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
      - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0))::bigint,
    count(*)::bigint
  from transactions t
  where t.book_id = p_book_id
    and t.type in ('income', 'expense')
    and t.occurred_at >= p_start::timestamptz
    and t.occurred_at < (p_end + 1)::timestamptz
  group by t.currency
$$;

-- ---------------------------------------------------------------------------
-- spending_summary: totals grouped by category, month, or account.
-- The workhorse — "where did my money go", "how did each month look".
-- ---------------------------------------------------------------------------
create or replace function public.ai_spending_summary(
  p_book_id uuid,
  p_start date,
  p_end date,
  p_type transaction_type default 'expense',
  p_group_by text default 'category'
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
    case p_group_by
      when 'month' then to_char(t.occurred_at, 'YYYY-MM')
      when 'account' then coalesce(a.name, 'Unknown')
      else coalesce(c.name, 'Uncategorized')
    end as bucket,
    t.currency,
    sum(t.amount)::bigint as total_minor,
    count(*)::bigint as txn_count
  from transactions t
  left join categories c on c.id = t.category_id
  left join accounts a on a.id = t.account_id
  where t.book_id = p_book_id
    and t.type = p_type
    and t.occurred_at >= p_start::timestamptz
    and t.occurred_at < (p_end + 1)::timestamptz
  group by 1, t.currency
  order by total_minor desc
$$;

-- ---------------------------------------------------------------------------
-- top_transactions: the biggest individual entries in a range (capped at 20).
-- ---------------------------------------------------------------------------
create or replace function public.ai_top_transactions(
  p_book_id uuid,
  p_start date,
  p_end date,
  p_type transaction_type default 'expense',
  p_limit int default 10
)
returns table (
  occurred_on date,
  amount_minor bigint,
  currency text,
  category text,
  account text,
  note text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.occurred_at::date,
    t.amount::bigint,
    t.currency,
    coalesce(c.name, 'Uncategorized'),
    coalesce(a.name, 'Unknown'),
    t.note
  from transactions t
  left join categories c on c.id = t.category_id
  left join accounts a on a.id = t.account_id
  where t.book_id = p_book_id
    and t.type = p_type
    and t.occurred_at >= p_start::timestamptz
    and t.occurred_at < (p_end + 1)::timestamptz
  order by t.amount desc
  limit least(greatest(coalesce(p_limit, 10), 1), 20)
$$;

-- ---------------------------------------------------------------------------
-- budget_status: each budget's limit vs spent for its current period.
-- v1: no rollover carry, no child-category matching (matches the budget's own
-- category only, or all expenses when the budget has no category).
-- ---------------------------------------------------------------------------
create or replace function public.ai_budget_status(
  p_book_id uuid,
  p_asof date default current_date
)
returns table (
  category text,
  period text,
  currency text,
  limit_minor bigint,
  spent_minor bigint,
  pct numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(c.name, 'Overall spending') as category,
    b.period::text,
    b.currency,
    b.amount::bigint as limit_minor,
    s.spent::bigint as spent_minor,
    round(100.0 * s.spent / nullif(b.amount, 0), 0) as pct
  from budgets b
  left join categories c on c.id = b.category_id
  left join lateral (
    select coalesce(sum(t.amount), 0) as spent
    from transactions t
    where t.book_id = b.book_id
      and t.type = 'expense'
      and t.currency = b.currency
      and (b.category_id is null or t.category_id = b.category_id)
      and t.occurred_at >= (case b.period
            when 'weekly' then date_trunc('week', p_asof::timestamptz)
            when 'yearly' then date_trunc('year', p_asof::timestamptz)
            else date_trunc('month', p_asof::timestamptz) end)
      and t.occurred_at < (case b.period
            when 'weekly' then date_trunc('week', p_asof::timestamptz) + interval '7 days'
            when 'yearly' then date_trunc('year', p_asof::timestamptz) + interval '1 year'
            else date_trunc('month', p_asof::timestamptz) + interval '1 month' end)
  ) s on true
  where b.book_id = p_book_id
  order by pct desc nulls last
$$;

-- ---------------------------------------------------------------------------
-- Only signed-in users may call these; each is still RLS-scoped to its caller.
-- ---------------------------------------------------------------------------
grant execute on function public.ai_period_totals(uuid, date, date) to authenticated;
grant execute on function public.ai_spending_summary(uuid, date, date, transaction_type, text) to authenticated;
grant execute on function public.ai_top_transactions(uuid, date, date, transaction_type, int) to authenticated;
grant execute on function public.ai_budget_status(uuid, date) to authenticated;
