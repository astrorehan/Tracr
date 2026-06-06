-- Optional credit limit (max you can borrow) for liability accounts. Drives the
-- utilization bar (owed / limit) and "available" figure on credit cards. Stored
-- in minor units of the account currency. NULL = no limit set.
alter table public.accounts
  add column if not exists credit_limit bigint
  check (credit_limit is null or credit_limit >= 0);
