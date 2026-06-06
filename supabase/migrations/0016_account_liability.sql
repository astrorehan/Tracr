-- Mark an account as a liability (money you owe: credit cards, loans). Kept as a
-- separate flag from `type` so any account can be a debt (e.g. an "other" personal
-- loan), and so the Accounts/Dashboard views can split Assets vs Liabilities.
-- Balances stay signed: a liability simply runs negative and subtracts from net worth.
alter table public.accounts
  add column if not exists is_liability boolean not null default false;
