-- 0021_transaction_status — reconciliation state per transaction.
--
-- pending   = just recorded, not checked against the bank
-- cleared   = seen on the bank/statement
-- reconciled = matched and locked during a reconciliation
--
-- Adding a column with a constant default is metadata-only in modern Postgres,
-- so this is a fast change even on a large transactions table.

create type transaction_status as enum ('pending', 'cleared', 'reconciled');

alter table transactions
  add column status transaction_status not null default 'pending';
