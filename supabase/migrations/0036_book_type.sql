-- Book type discriminator. Every book is either a 'personal' ledger (the
-- original behaviour: income, spending, budgets, goals) or a 'business' ledger
-- which unlocks UMKM features on top of the same partitioned model — debts /
-- receivables (kasbon), capital vs profit, and profit-loss reporting.
--
-- Additive and safe: the column defaults to 'personal', so every existing book
-- keeps behaving exactly as before. Business-only tables (contacts, debts, …)
-- land in later migrations and are gated in the UI on books.type = 'business'.
alter table books
  add column type text not null default 'personal'
  check (type in ('personal', 'business'));
