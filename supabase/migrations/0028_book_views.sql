-- Make the derived views book-aware so the client can scope them to the active
-- book (otherwise net-worth and payee autocomplete would mix books together).
-- Recreated with a drop because we're inserting a column, not just appending.

drop view if exists account_balances;
create view account_balances with (security_invoker = on) as
with movements as (
  select account_id, user_id,
         case when type = 'income' then amount else -amount end as delta
  from transactions
  where type in ('income', 'expense')
  union all
  select account_id, user_id, -amount as delta
  from transactions
  where type = 'transfer'
  union all
  select counter_account_id as account_id, user_id,
         coalesce(counter_amount, amount) as delta
  from transactions
  where type = 'transfer' and counter_account_id is not null
)
select a.id as account_id,
       a.user_id,
       a.book_id,
       a.opening_balance + coalesce(sum(m.delta), 0) as balance
from accounts a
left join movements m on m.account_id = a.id
group by a.id, a.user_id, a.book_id, a.opening_balance;

drop view if exists payee_stats;
create view payee_stats with (security_invoker = on) as
select user_id,
       book_id,
       payee,
       count(*)            as txn_count,
       max(occurred_at)    as last_used
from transactions
where payee is not null and payee <> ''
group by user_id, book_id, payee;
