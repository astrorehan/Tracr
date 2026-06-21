-- Refund / reimbursement link: tie one transaction to another (e.g. a refund
-- pointing at the original expense it cancels out). Self-referential FK; if the
-- linked transaction is deleted the pointer is cleared rather than cascading,
-- so the refund itself survives.

alter table transactions
  add column linked_transaction_id uuid references transactions (id) on delete set null;

comment on column transactions.linked_transaction_id is
  'Optional link to a related transaction — e.g. a refund/reimbursement pointing at the original expense.';

create index transactions_linked_idx on transactions (linked_transaction_id);
