# Tracr — Project Map

A fast index of *where things live and why*. Pair with [FEATURES.md](FEATURES.md) (the feature backlog/roadmap) and [UI_UX_THEME.md](../UI_UX_THEME.md) (visual language).

> **Tracr** is a free-tier, PWA-first, non-AI personal finance tracker (multi-account, multi-currency) built to be sold. Stack: **React + TypeScript + Vite**, **Tailwind v4**, **TanStack Query**, **React Router**, **Recharts**, **Supabase** (Postgres + Auth + Storage, RLS per user).

---

## 1. Top-level layout

```
src/
  app/            # Route-level pages (one file per screen)
  components/     # Shared UI — AppLayout, SetupNotice, ui/* primitives
  features/       # Domain modules (api hooks + forms + pure logic), grouped by concern
  lib/            # Framework-agnostic helpers (money, calc, supabase client, query keys…)
  types/db.ts     # Hand-written types mirroring the Postgres schema
  App.tsx         # Router + route definitions (lazy-loaded pages)
  main.tsx        # App bootstrap (providers)
supabase/migrations/  # Numbered SQL migrations (also applied live via Supabase MCP)
docs/             # FEATURES.md (roadmap), PROJECT_MAP.md (this file)
```

---

## 2. Routes → pages

Defined in [src/App.tsx](../src/App.tsx) (all lazy-loaded; wrapped in `RequireAuth` + `AppLayout`).

| Path | Page | Notes |
|---|---|---|
| `/login` | `LoginPage` | Google OAuth |
| `/` | `DashboardPage` | Net worth, cashflow, spending chart, accounts deck |
| `/accounts` | `AccountsPage` | Cards link → detail |
| `/accounts/:id` | `AccountDetailPage` | Balance-over-time chart, ledger, **reconcile** |
| `/transactions` | `TransactionsPage` | "Activity" — filters, saved views, **bulk actions**, attachments |
| `/reports` | `ReportsPage` | Date-range analytics (category donut, income/expense, biggest, CSV) |
| `/budgets` | `BudgetsPage` | Per-category/overall budgets + progress |
| `/bills` | `BillsPage` | Bills & subscriptions (recurring; mark-paid → posts a txn) |
| `/goals` | `GoalsPage` | Savings goals + contribution ledger |
| `/categories` | `CategoriesPage` | Reached from Settings |
| `/tags` | `TagsPage` | Reached from Settings |
| `/settings` | `SettingsPage` | Profile, theme, text size, Data card, links to manage pages |

Nav lives in [src/components/AppLayout.tsx](../src/components/AppLayout.tsx) (`NAV` array + `SECTION_TITLES`). ⚠️ The sidebar rail is currently **8 items** — flagged for consolidation.

---

## 3. Feature modules (`src/features/*`)

Each module typically holds: `api.ts` (TanStack Query hooks), one or more form/UI components, and `*.ts` pure logic (testable, no React).

| Module | Key files | Responsibility |
|---|---|---|
| `auth` | `AuthProvider.tsx`, `useAuth.ts`, `context.ts` | Session + profile; `useAuth()` exposes `profile.base_currency` |
| `accounts` | `api.ts`, `AccountForm.tsx`, `meta.ts` | Accounts CRUD, `useBalances()` (from `account_balances` view), type icons + `ACCOUNT_COLORS` |
| `categories` | `api.ts`, `CategoryForm.tsx`, `CategoryIcon.tsx`, `icons.ts`, `tree.ts` | Categories CRUD; `tree.ts` = `groupByParent`/`flattenWithDepth` (1-level nesting); `icons.ts` = lucide registry |
| `tags` | `api.ts`, `TagForm.tsx`, `TagChip.tsx`, `TagPicker.tsx` | Tags + `transaction_tags`; `useBulkAddTags` |
| `transactions` | `api.ts`, `TransactionForm.tsx`, `TransactionRow.tsx`, `FilterPanel.tsx`, `filters.ts`, `savedViews.ts`, `splits.ts`, `BulkBar.tsx` | The heart. See §5 |
| `budgets` | `api.ts`, `progress.ts`, `BudgetForm.tsx` | `progress.ts` = period bounds, spend, status (ok/near/over), rollover |
| `recurring` | `api.ts`, `schedule.ts`, `RecurringForm.tsx` | Bills/subscriptions; `useMarkRecurringPaid` posts a txn + advances `next_due`; `schedule.ts` = due math |
| `goals` | `api.ts`, `progress.ts`, `GoalForm.tsx`, `ContributeForm.tsx` | Savings goals; signed contribution ledger; `progress.ts` = %/ETA/saved-this-month |
| `attachments` | `api.ts`, `AttachmentsModal.tsx` | Receipts in private Storage bucket; signed URLs; upload/delete |
| `reports` | `reports.ts` | Pure aggregation: `periodTotals`, `bucketByTime`, `categoryBreakdown`, `pickGranularity` |
| `data` | `api.ts`, `transactionsCsv.ts`, `backup.ts`, `DataCard.tsx` | CSV import/export + full **JSON backup/restore** (all 11 tables) |
| `settings` | `theme.tsx`, `text-size.tsx` (+ contexts) | Theme + text-size providers |

---

## 4. Data model & migrations

Tables (all **RLS per user**, `user_id` references `auth.users`). Money is **integer minor units** (`bigint`).

| Migration | Adds |
|---|---|
| `0001_init` | `profiles`, `accounts`, `categories`, `transactions`, `account_balances` **view**, `handle_new_user` trigger (seeds profile + default categories) |
| `0002_harden_handle_new_user` | Security hardening of the signup trigger |
| `0003_tags` | `tags`, `transaction_tags` (join, composite PK) |
| `0004_budgets` | `budgets` (category nullable=overall; period enum; partial unique indexes) |
| `0005_transaction_splits` | `transaction_splits` (split txn keeps total in `transactions.amount`, `category_id=null`) |
| `0006_recurring_transactions` | `recurring_transactions` (`recurrence_freq` enum, `next_due`, `is_active`) |
| `0007_savings_goals` | `savings_goals` + `goal_contributions` (signed: +deposit/−withdraw) |
| `0008_attachments` | private Storage bucket `attachments` + per-user-folder Storage RLS + `attachments` table |

Hand-written TS types for every table live in [src/types/db.ts](../src/types/db.ts).

**Migration workflow:** schema changes are applied **live to the linked Supabase project via the Supabase MCP** (`apply_migration`) **and** committed as a numbered file in `supabase/migrations/`. Keep the two in sync.

---

## 5. The transactions module (most complex)

- **Create**: `TransactionForm.tsx` — income/expense/transfer, **split mode**, **calculator amount** (live `=` preview), tag picker, **receipt attach**. No edit flow (delete + re-add).
- **List**: `TransactionsPage.tsx` — server pushes down account/type/date-range; client applies category(+subcats)/tags/amount/search/source + sort. Day-grouped (date sort) or flat (amount sort).
- **Filtering**: `filters.ts` (`TxFilter`, `resolveDateRange`, presets, active count) + `FilterPanel.tsx`; `savedViews.ts` (localStorage smart views).
- **Splits**: `splits.ts` — `categoryContributions(tx, splitsByTx)` is the **single source of truth** for how a txn maps onto categories; reports + budgets both call it.
- **Bulk**: `BulkBar.tsx` + `useBulkDeleteTransactions`/`useBulkSetCategory`/`useBulkAddTags`.
- **Row**: `TransactionRow.tsx` — shared across Activity/Dashboard/AccountDetail; optional split/attachment/selection props.

---

## 6. Shared libs (`src/lib`)

| File | What |
|---|---|
| `supabase.ts` | Supabase client + `isSupabaseConfigured` |
| `queryClient.ts` | `queryClient` + **`qk`** centralized query keys (invalidate via these) |
| `money.ts` | `toMinorUnits` / `fromMinorUnits` / `formatMoney` / **`amountToMinor`** (calculator-aware) / `signedAmount` |
| `calc.ts` | `evalExpression` (safe `+−×÷`/parens, no `eval()`) + `isExpression` |
| `currencies.ts` | Currency metadata (symbol, decimals, crypto flag) |
| `csv.ts` | RFC-4180 `toCsv`/`parseCsv` + `downloadTextFile` |
| `collections.ts` | `indexById` |
| `utils.ts` | `cn` (= `twMerge(clsx(...))`) |

UI primitives: [src/components/ui/](../src/components/ui/) — `Button`, `Card`, `Input` (+`Select`/`Field`/`Label`), `Modal`, `States` (`CenterSpinner`/`EmptyState`).

---

## 7. Conventions & gotchas

- **Money**: always integer minor units in state/DB; convert at the edges via `lib/money`. Use `amountToMinor` for any user-typed amount (gets the calculator for free).
- **RLS**: every table is `auth.uid() = user_id`; join tables denormalize `user_id` so policies stay simple. Restores/upserts re-stamp `user_id` to the current user.
- **Query keys**: add new ones to `qk` in `queryClient.ts`; mutations invalidate via `qk`.
- **Currency scope**: Reports, net worth, budgets, goals compute in the **base currency only** — no FX conversion yet (documented limitation; `fx_rates` is the future fix).
- **Lint rules that bite**:
  - `react-refresh/only-export-components` — don't export constants/helpers from a file that also exports a component (put them in a `*.ts`).
  - `react-hooks/purity` — no `Date.now()`/`new Date()` impurity in render; compute inside `useMemo` and thread the value through.
- **Code-splitting**: pages are `lazy()`-loaded in `App.tsx`; charts (Recharts) land in a shared async chunk.
- **Tests**: **Vitest** (`npm test` / `npm run test:watch`, config in `vitest.config.ts`). Unit suites are colocated as `*.test.ts` and cover the **money-critical pure logic** — `lib/money`, `lib/calc`, `features/fx/fx`, `transactions/splits`, `budgets/progress`, `recurring/schedule`, `rules/engine` (57 tests). Still uncovered: `reports/reports`, `goals/progress`, `transactions/filters`, and any component/integration tests.
- **Remaining `1.0.0` gaps**: broader test coverage + **legal/billing** (payments, terms/privacy, export-my-data / delete-account). FX base conversion has shipped. See FEATURES.md "Recommended build order".

---

## 8. Where do I add…?

- **A new screen** → `src/app/XPage.tsx` + lazy route in `App.tsx` (+ nav in `AppLayout.tsx` and/or a Settings card).
- **A new table** → migration in `supabase/migrations/000N_*.sql` (apply via MCP too) + type in `types/db.ts` + `qk` key + a `features/<x>/api.ts`.
- **A new amount input** → use `amountToMinor` so the calculator works everywhere.
- **Category-aware aggregation** → go through `categoryContributions` so splits are honored.
