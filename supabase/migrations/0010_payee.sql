-- Payee / merchant on transactions: who you paid (or who paid you).
-- Free-text, optional. Powers autocomplete-from-history in the add form, a payee
-- filter on Activity, and a "top payees" report. RLS is inherited from the
-- transactions table (no new policy needed).

alter table transactions
  add column payee text;

comment on column transactions.payee is
  'Merchant / payee for this transaction (free text). Null = not recorded.';

-- Speeds up the suggestion view's group-by and the payee filter.
create index transactions_payee_idx
  on transactions (user_id, payee)
  where payee is not null;

-- ----------------------------------------------------------------------------
-- payee_stats: distinct payees per user with usage frequency + recency, for the
-- autocomplete datalist (ordered most-used first). security_invoker so RLS on
-- the underlying transactions table scopes rows to the current user.
-- ----------------------------------------------------------------------------
create view payee_stats with (security_invoker = on) as
select user_id,
       payee,
       count(*)            as txn_count,
       max(occurred_at)    as last_used
from transactions
where payee is not null and payee <> ''
group by user_id, payee;
