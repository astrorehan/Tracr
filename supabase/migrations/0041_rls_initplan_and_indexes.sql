-- 0041: RLS performance + missing indexes on hot paths.
--
-- Part 1 — auth.uid()/auth.role() are re-evaluated once per candidate row when
-- called bare inside a policy. Wrapping them in a scalar subquery lets Postgres
-- hoist the call into an InitPlan so it runs once per statement instead. Same
-- semantics, same rows returned; only the plan changes. This is the
-- `auth_rls_initplan` database-linter warning (37 policies).
--
-- ALTER POLICY is used rather than DROP + CREATE so there is never a moment
-- where a table sits behind RLS with no policy.

-- Owner-scoped ALL policies on `user_id`.
alter policy "own accounts" on public.accounts
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own attachments" on public.attachments
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own budgets" on public.budgets
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own categories" on public.categories
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own contacts" on public.contacts
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own debt_payments" on public.debt_payments
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own debts" on public.debts
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own fx_rates" on public.fx_rates
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own goal_contributions" on public.goal_contributions
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own installment_payments" on public.installment_payments
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own installments" on public.installments
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own products" on public.products
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own push_sent" on public.push_sent
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own push_subscriptions" on public.push_subscriptions
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own recurring_transactions" on public.recurring_transactions
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own rules" on public.rules
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own savings_goals" on public.savings_goals
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own tags" on public.tags
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own transaction_items" on public.transaction_items
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own transaction_splits" on public.transaction_splits
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own transaction_tags" on public.transaction_tags
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own transaction_templates" on public.transaction_templates
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own transactions" on public.transactions
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "own bot link" on public.bot_links
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Books are keyed on owner_id, not user_id.
alter policy "own books" on public.books
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Read-only ledgers.
alter policy "own ai usage (select)" on public.ai_usage
  using ((select auth.uid()) = user_id);
alter policy "own credit_ledger (select)" on public.credit_ledger
  using ((select auth.uid()) = user_id);
alter policy "own credits_subscription (select)" on public.credits_subscription
  using ((select auth.uid()) = user_id);
alter policy "own credits_topup (select)" on public.credits_topup
  using ((select auth.uid()) = user_id);
alter policy "own subscriptions (select)" on public.subscriptions
  using ((select auth.uid()) = user_id);
alter policy "own payment_orders (select)" on public.payment_orders
  using ((select auth.uid()) = user_id);
alter policy "own payment_orders (insert)" on public.payment_orders
  with check ((select auth.uid()) = user_id);

-- Profiles key on `id`. The UPDATE policy has no WITH CHECK, so leave it that
-- way: Postgres reuses USING for the new row.
alter policy "own profile (select)" on public.profiles
  using ((select auth.uid()) = id);
alter policy "own profile (update)" on public.profiles
  using ((select auth.uid()) = id);
alter policy "own profile (insert)" on public.profiles
  with check ((select auth.uid()) = id);

-- Public catalogs, gated on role rather than ownership.
alter policy "billing_plans (select)" on public.billing_plans
  using ((select auth.role()) = 'authenticated'::text);
alter policy "credit_packs (select)" on public.credit_packs
  using ((select auth.role()) = 'authenticated'::text);

-- Part 2 — the app's hottest read is
--   select * from transactions where book_id = $1 order by occurred_at desc limit 200
-- under an RLS predicate on user_id, plus date-range variants in reports and
-- CSV export. Neither existing index covers filter *and* sort: (user_id,
-- book_id) forces a sort, (user_id, occurred_at desc) forces a book_id filter
-- over every row. This one serves both, so the limit becomes an ordered index
-- scan. It has (user_id, book_id) as a prefix, which makes the old index
-- redundant.
create index if not exists transactions_user_book_time_idx
  on public.transactions (user_id, book_id, occurred_at desc);
drop index if exists public.transactions_user_book_idx;

-- Part 3 — covering indexes for foreign keys on the large child tables. Without
-- these, deleting a category / account / product / transaction has to
-- sequentially scan the child table to enforce the constraint.
create index if not exists transactions_category_idx
  on public.transactions (category_id);
create index if not exists transaction_splits_category_idx
  on public.transaction_splits (category_id);
create index if not exists transaction_items_product_idx
  on public.transaction_items (product_id);
create index if not exists installment_payments_transaction_idx
  on public.installment_payments (transaction_id);
create index if not exists installments_account_idx
  on public.installments (account_id);
create index if not exists installments_category_idx
  on public.installments (category_id);
create index if not exists budgets_category_idx
  on public.budgets (category_id);
create index if not exists recurring_transactions_account_idx
  on public.recurring_transactions (account_id);
create index if not exists recurring_transactions_category_idx
  on public.recurring_transactions (category_id);
create index if not exists savings_goals_account_idx
  on public.savings_goals (account_id);
create index if not exists transaction_templates_account_idx
  on public.transaction_templates (account_id);
create index if not exists transaction_templates_category_idx
  on public.transaction_templates (category_id);
create index if not exists categories_parent_idx
  on public.categories (parent_id);
create index if not exists profiles_active_book_idx
  on public.profiles (active_book_id);

-- debt_payments had no user-scoped index at all, so every RLS-filtered read
-- scanned the table.
create index if not exists debt_payments_user_book_idx
  on public.debt_payments (user_id, book_id);
