# Tracr — Feature Backlog & Roadmap (non-AI, "give users every standard tool")

Goal: a comprehensive, conventional personal-finance tracker that feels *complete* — no AI, no fancy integrations required. Benchmarked against Firefly III, Wallet by BudgetBakers, Spendee, YNAB, Toshl, and Money Manager.

Status legend: ✅ have · 🟡 partial · ⬜ new · 🔧 schema change needed

---

## 0. Where we are today
- ✅ Multi-account (cash, bank/card, e-wallet, crypto, stocks, other), multi-currency, opening balance, archive
- ✅ Transactions: income / expense / transfer, account, category, amount, date, note, source tag
- ✅ Categories CRUD (income/expense, color) — **note: schema already has `parent_id` + `icon` (unused in UI)**
- ✅ Dashboard: net worth, per-account balances, recent activity, monthly chart
- ✅ Activity feed with account/type filters, grouped by day
- ✅ CSV import (validated preview) + export, template
- ✅ Google login, RLS per-user, dark mode, base currency, installable PWA

---

## 1. Transactions — depth (Tier 1 unless noted)
| Feature | What it does | Status | Notes |
|---|---|---|---|
| **Tags (many-to-many)** | Free-form labels on a transaction; filter/report by tag | ✅ | `tags` + `transaction_tags` tables (migration `0003_tags`); chips in the add form, chips on rows, tag filter on Activity, Manage tags page |
| **Split transactions** | One expense split across multiple categories/amounts (e.g. a receipt = food + household) — this is your "multiple categories per transaction" | ✅ | `transaction_splits` table (migration `0005`). Split toggle in the add form (category+amount rows, auto-summed total); split tx stores `category_id=null` + the total in `amount` (balances/totals unaffected). Reports category breakdown & budget spend expand splits via `categoryContributions`; "Split · N categories" shown on the row |
| **Payee / merchant field** | Who you paid; autocomplete from history; report by payee | ✅ | `transactions.payee text` (migration `0010`) + `payee_stats` view (distinct payees by frequency). Datalist autocomplete in the add form (income→"Payer", expense→"Payee", hidden for transfers); payee leads the row title; payee filter + datalist on Activity (also folded into full-text search); "Top payees/sources" card on Reports (+ CSV section); payee column in CSV import/export |
| **Recurring transactions** | Auto-create on a schedule (salary, rent, subscriptions) | ✅ | Opt-in `auto_post` flag on `recurring_transactions` (migration `0013`). A daily **pg_cron** job (00:17 UTC) pings the `recurring-autopost` **Edge Function**, which posts every due `auto_post` schedule — catching up missed periods, one tx per occurrence, dated to the due date with a frozen FX snapshot — then advances `next_due`. Mirrors `useMarkRecurringPaid` exactly. Cron→function auth via a private shared secret (`public.app_secrets`, RLS-locked). Toggle in the bill form + "Auto" badge on the Bills list. Schedules stay confirm-each by default |
| **Attachments / receipts** | Photo or PDF per transaction | ✅ | Private Storage bucket `attachments` (per-user folder RLS) + `attachments` table (migration `0008`). Attach in the add form; paperclip + count on rows opens a viewer modal (signed-URL thumbnails, add/delete). Storage files orphan on tx delete (cleanup = follow-up) |
| **Quick templates / favorites** | One-tap repeat of common entries | ⬜🔧 | reuse recurring table w/ `auto=false`, or `templates` |
| **Bulk actions** | Multi-select → delete / recategorize / tag | ✅ | Activity "Select" mode → checkboxes + select-all; floating bar: set category (skips transfers), add tags (dedupes), delete. Bulk mutations `useBulkDeleteTransactions`/`useBulkSetCategory`/`useBulkAddTags` |
| **Duplicate / clone** | Copy an existing transaction | ✅ | Copy button on each Activity row → `useDuplicateTransaction` clones core fields + tags + splits as a fresh entry dated now (FX snapshot recomputed, source `web`). No schema change |
| **Refund / reimbursement link** | Tie a refund to its original expense | ⬜🔧 | `linked_transaction_id` |
| **Cleared / reconciled flag** | Mark which entries match the bank | ✅ | `transactions.status` enum `pending`/`cleared`/`reconciled` (migration `0021`, default `pending`). Status badge on the row (Cleared ✓ / Reconciled 🔒); reconciliation-status filter on Activity (dropdown + chip + client filter); **bulk "Status"** action (`useBulkSetStatus`) to mark a multi-selection cleared/reconciled/pending |
| **Calculator in amount field** | `12000+3500` evaluates inline | ✅ | Safe expression evaluator (`lib/calc.ts`); `amountToMinor` used by every amount field (transaction, splits, budget, goal, contribution, bill, account, reconcile); live `= …` preview in the add form |
| **Cross-currency transfers** | Transfer between accounts of different currencies w/ rate | ✅ | `counter_amount`/`counter_fx_rate` on transfers (migration `0009`); when the From/To accounts differ in currency the add form reveals an "Amount received" field (auto-suggested from the latest rate, editable) + shows the implied rate; `account_balances` view & Account-detail ledger credit the counter account by `counter_amount` |

## 2. Categories (Tier 1)
| Feature | Status | Notes |
|---|---|---|
| **Subcategories (nested)** | ✅ | One-level nesting: parent picker in the form, indented under parents on the Categories page + grouped/indented in the transaction picker |
| **Category icons** | ✅ | Curated lucide icon picker in the form; icons shown on the Categories page (color-tinted) |
| **Reorder (drag) & sort** | ✅ | `categories.sort_order` (migration `0011`); native drag-and-drop on the Categories page reorders within a sibling group (top-level per kind, or a parent's children); `useReorderCategories` persists `sort_order`; `useCategories` orders by kind→sort_order→name |
| **Merge categories** | ✅ | "Merge" on each row → modal picks a same-kind target; `useMergeCategories` moves transactions/splits/recurring A→B, re-parents A's children into B's group, deletes A (its budgets cascade). Excludes self + A's children from targets |
| **Archive category** | ✅ | `categories.is_archived` (migration `0011`); Archive/Restore on rows + an "Archived" section; hidden from every assignment picker (add form, recurring, budgets, bulk, filter, parent picker) but still resolves names on existing rows |

## 3. Tags (Tier 1) — your explicit ask — ✅ DONE
- ✅ Create/edit/delete tags (name + color) — Manage tags page
- ✅ Assign multiple tags per transaction (chips in the add form)
- ✅ Filter by tag on the Activity page (single tag; AND/OR multi-select still TODO)
- ✅ Tag management page (like Categories)
- ✅ `tags`, `transaction_tags` join table (migration `0003_tags`, RLS per-user)

## 4. Budgets (Tier 1) — Phase 2 leftover — ✅ DONE
- ✅ Limit per category **or** overall (all spending); a category budget includes its subcategories
- ✅ Progress bars: spent vs limit, % used, remaining / over-by, linear projected end-of-period spend
- ✅ Period options: weekly / monthly / yearly (custom range deferred)
- ✅ **Rollover** unused budget to next period (toggle; single-previous-period positive carry into the effective limit)
- ✅ Over (≥100%, red) / near (≥80%, amber) visual warnings + "on track to exceed" hint
- ✅ Budgets page (`/budgets`), create/edit/delete via modal; base-currency expenses only
- ✅ `budgets` table (migration `0004_budgets`: category_id nullable, period enum, amount, currency, rollover; RLS per-user; partial unique indexes per category/period and one overall/period)
- (Optional later) YNAB-style "available to assign" envelope model; multi-period rollover chains

## 5. Filtering, search & saved views (Tier 1) — your explicit ask — ✅ DONE
- ✅ Filter by **any combo**: account, category + subcategory, tag(s) (any/all), type, date range, amount range (min/max), note text, payee, source. (currency, cleared status pending their own schema features)
- ✅ Date presets: today, this/last week, this/last month, this/last quarter, YTD, last 12 months, custom range
- ✅ Full-text search across note + category + account + tag names
- ✅ **Saved filters / smart views** — name & store the current filter, one-tap apply, delete; matching view highlighted (localStorage `tracr.savedViews.v1`)
- ✅ Sort: date (new/old), amount (large/small) — amount sort switches to a flat ranked list, date sorts keep day grouping
- ✅ Active-filter chips with individual remove + Clear all
- Stored **client-side** for now (localStorage); `saved_views` table can replace it later with no UI change

## 6. Reports & analytics (Tier 1) — your explicit ask "financial report" — ✅ DONE (MVP)
Dedicated **Reports** page (`/reports`, sidebar + Dashboard link) with a date-range selector driving all charts:
- ✅ Date-range selector reusing the §5 presets (today … last 12 months, custom range)
- ✅ Summary cards: income, expense, net, avg/day spend
- ✅ **Income vs expense** over time (grouped bars, adaptive day/month buckets)
- ✅ **Spending/income by category** (donut + ranked list with %, icons, colors; Spending↔Income toggle)
- ✅ **Biggest transactions** (top 8 in period)
- ✅ Export the category report to **CSV**
- ✅ Base-currency only with a note when other currencies exist (no FX yet)
- Pure client-side aggregation in `features/reports/reports.ts` — no schema change
- ✅ Top payees/merchants (per §1 payee field) — "Top payees/sources" card on Reports + CSV
- ✅ **Net-worth trend** over time (area chart, headline card) — no snapshots needed: valued at latest rates and computed *backwards* from current net worth by removing each transaction's base-valued effect after every bucket boundary (`netWorthSeries`), so the final point equals the Dashboard net worth. Honors exclude_from_stats + archived; liabilities subtract automatically. Shows current net worth + Δ over the period
- ✅ **Period-over-period comparison** — each summary card (income/expense/net/avg-per-day) shows a Δ% vs the previous equal-length period, color-coded by whether the move is good (income↑/expense↓). Compares the same *elapsed* span (clamps a partial current period at "now") so mid-month isn't measured against a full last month. `previousDateRange` (filters) + `totalsInBase`/`pctChange` (reports); hidden for open-ended "All time"
- ✅ **Calendar heatmap** — GitHub-style daily-spend grid (`dailyTotals`): weeks as columns, Mon→Sun rows, each cell shaded by that day's spend vs the period's busiest day; hover for the date + amount. Spending only
- ✅ **Drill into subcategory/tag** — the category breakdown now rolls up to top-level parents (`categoryTree`) and each row expands to reveal its subcategory split + the tags used within it (`tagBreakdownForCategory`). Rows are drillable when they have children or tagged transactions
- ✅ **PDF export** — "Print / PDF" button uses the browser print dialog (Save as PDF); a `@media print` block hides app chrome/controls, keeps chart colors (`print-color-adjust`), and avoids splitting cards across pages. No new dependency
- ⬜ Still TODO: calendar *transactions* view (vs the spend heatmap above), multi-currency report conversion drill

## 7. Accounts — depth (Tier 2)
| Feature | Status | Notes |
|---|---|---|
| **Account detail page** | ✅ | `/accounts/:id` — running end-of-day balance area chart + full per-account ledger (incl. transfers both directions); edit/archive; cards on Accounts page link here |
| **Reconciliation** | ✅ | "Reconcile" → enter real balance → creates a signed **Balance adjustment** income/expense so Tracr matches; live diff preview. The correction is filed under a dedicated **"Balance Adjustment"** category (find-or-create per kind via `useEnsureAdjustmentCategory`, icon `scale`) so it stays out of "Uncategorized" in reports; an optional **reason** field becomes the transaction note |
| **Liabilities / debts / credit cards** | ✅ | `accounts.is_liability` flag + `credit_card`/`loan` account types (migrations `0015`/`0016`). Liabilities carry a **negative balance** (debt subtracts from net worth — the existing `account_balances` view already nets it). Add form has a liability toggle (auto-on for credit-card/loan types) + an "Amount owed" field stored as a negative opening balance. Accounts page **splits Assets vs Liabilities** with a net / assets / debts header; Dashboard hero shows the assets·debts breakdown (allocation bar now divides by assets so debts don't skew it). Debt balances + the detail header render in red with an "owed" tag. **Pay-down** = a normal transfer bank→card (already moves the balance toward 0). The form leads with the account *type* (Credit Card / Loan auto-explain as debt; an explicit "money I owe" toggle only appears for ambiguous types) so users never meet the word "liability". Optional **credit limit** (`credit_limit`, migration `0017`) drives a utilization bar (% used · available, amber ≥70% / red ≥90%) on the card + detail page |
| **Include/exclude from net worth & stats** | ✅ | `accounts.exclude_from_stats` (migration `0018`) + form toggle. Excluded accounts stay in the list (with an "excluded" tag) and keep their own ledger, but drop out of net worth, assets, debts, allocation & the per-currency chips. (Transaction-level reports still include them — a later refinement) |
| **Account groups & ordering** | ⬜🔧 | `account_groups` or `sort_order` |
| **Multi-currency net worth** | ✅ | FX conversion to base shipped (migration `0009`, `features/fx/`): Dashboard + Accounts headline convert all accounts at latest rates; per-txn snapshot for history; "≈ base" estimates on Accounts cards & Account-detail header |

## 8. Savings goals / "piggy banks" (Tier 2) — ✅ DONE
- ✅ Create goal: name, target amount, target date (optional), linked account (optional, informational), color
- ✅ Add/withdraw money toward goal (signed contribution ledger); progress bar + % + remaining
- ✅ ETA: target-date countdown ("Nd left / late") or projected "~MMM yyyy at this pace" from average monthly deposits
- ✅ "Saved this month" summary per goal; "Reached" badge; archive/unarchive; edit/delete
- ✅ Goals page (`/goals`); contributions are a **standalone ledger** — they don't move real account balances (no double-counting)
- ✅ `savings_goals` + `goal_contributions` (migration `0007`; RLS per-user)

## 9. Bills & subscriptions (Tier 2) — ✅ DONE
- ✅ Recurring bills/subscriptions/income with **due dates**; grouped Overdue / Due soon (≤7d) / Upcoming / Paused list (`/bills`)
- ✅ **Mark paid → creates the transaction** (on the due date) and advances `next_due`; **Skip** advances without posting
- ✅ Manager: name, amount, account, category, frequency (weekly/monthly/yearly) + interval ("every N"), next due, note; pause/resume; edit/delete
- ✅ In-app due reminders (relative "Overdue 3d" / "Due today" / "in 5d", color-coded)
- ✅ `recurring_transactions` table (migration `0006`; RLS per-user). Confirm-each by default; **optional auto-post** per schedule (`auto_post`, migration `0013`) via a daily Edge Function + pg_cron generator (see §1 "Recurring transactions")
- ⬜ Calendar view, web-push reminders (see §12)

## 10. Multi-currency (Tier 2) — ✅ DONE (manual rates; live API optional later)
- ✅ Manual FX rate table (free-tier friendly) — `fx_rates` (base, quote, rate, as_of, source) migration `0009`, RLS per user. `source` column lets a live-API job upsert later with no UI change. Managed on a dedicated **Currencies** page (`/currencies`, `app/CurrenciesPage.tsx`, linked from Settings → "Currency & data"): base-currency header + "Refresh now", add/override form ("1 [foreign] = X [base]"), and a Fiat/Crypto rate list with Live/Manual source badges + delete.
- ✅ Convert to base currency in **net worth** (Dashboard hero + allocation now include foreign accounts; "≈ estimated at latest rates" note; "add a rate for X" prompt when a currency has none) and **Reports** (foreign txns now valued in base via snapshot/latest rate; splits scaled proportionally; excluded-currency hint)
- ✅ **FX snapshot on each transaction** (`base_amount` + `fx_rate`, migration `0009`) — frozen at create time so history stays accurate after rates move. Computed in `features/fx/snapshot.ts`, written by `useCreateTransaction` + recurring mark-paid. Backfilled for base-currency txns.
- ✅ Conversion core `features/fx/fx.ts` (`buildRateTable`/`rateBetween`/`convertMinor`) — display-only, triangulates through base, never rewrites native amounts.
- ✅ **Chunk B shipped:** cross-currency transfer UI (Amount-received field, rate suggestion, view + ledger credit by `counter_amount`); "≈ base" estimate on Accounts cards + headline total (all currencies converted) + Account-detail header.
- ✅ **Live rates shipped:** client-side daily sync (`features/fx/liveRates.ts` + `useLiveRatesSync` mounted in `AppLayout`). Two keyless free sources — fiat via exchangerate-api open endpoint (`open.er-api.com`, `source='erapi'`), crypto (BTC/ETH/USDT) via CoinGecko (`source='coingecko'`). Fills any currency missing a rate for today; **never overwrites a manual rate** (manual wins); fiat base only; failures silent (offline-safe). Manual entry in Settings still overrides.

## 11. Data, backup & sync (Tier 2)
- CSV import **column-mapping wizard** (upgrade current fixed-format importer) — ⬜
- ✅ Full **JSON backup / restore** (everything, portable) — Settings → Data → "Full backup". Exports all 10 tables in one JSON; restore upserts by id (re-stamps user_id, keeps relationships, idempotent) with a pre-apply count preview. Logic in `features/data/backup.ts`
- Import presets for Money Manager / Wallet exports — ⬜
- Per-account statement import — ⬜

## 12. Notifications & reminders (Tier 3)
- ✅ **In-app notification center** — a bell in the header (`features/notifications/`) with an unread badge + popover. Notifications are derived **purely client-side** from cached data (no backend): overdue / due-soon (≤7d) **bills** and **near (≥80%) / over (≥100%) budgets**, each linking to its page. Read-state is per-id in localStorage (`tracr.notifications.read.v1`) with **stable ids** so it survives refreshes and only resets when the situation worsens (due date advances, budget rolls into a new period, or crosses a worse threshold). Pure builders (`notifications.ts`) are unit-tested; budget spend reuses `budgets/progress.ts` exactly. "Mark all read" supported.
- ⬜ **Web push** (service worker + VAPID + a cron edge function to send) — the builders are designed to be reused server-side; needs VAPID keys, a `push_subscriptions` table, and a daily send job.
- ⬜ Daily/weekly "log your spending" nudge

## 13. Power-user & sharing (Tier 3)
- ✅ **Rules engine** (Firefly-style): "if payee contains GoFood → category Food, tag delivery". `rules` table (migration `0012`, RLS per user): JSONB conditions (`field` payee/note/amount/type · `op` contains/equals/starts_with/gt/lt) with all/any matching, JSONB actions (set category + add tags), `stop_after`, drag-ordered, active toggle. Pure engine in `features/rules/engine.ts`. Applies in 3 places — **live auto-fill** in the add form (fills category+tags until the user edits them; "Auto-filled by rule" hint), **CSV import** (fills empty category + adds tags, transfers excluded), and **"Run now"** on the Rules page (over uncategorized income/expense). Managed on `/rules` (`app/RulesPage.tsx`, linked from Settings → Organize). Backup/restore includes rules
- **Shared wallets / spaces** (collaborative budgets for couples/families) — multi-user RLS on a `space`
- **Multiple books/profiles** (personal vs business) under one login
- Command palette (jump/search anywhere), keyboard shortcuts
- App lock (PIN/biometric), export-my-data / delete-account (privacy)
- Customizable dashboard widgets; calendar view of transactions

---

## Recommended build order

**Phase 2A — "complete tracker" core (highest value, mostly your asks):**
1. ✅ Tags (tables + UI + filter) — shipped
2. ✅ Subcategories + category icons (schema already supported it) — shipped
3. ✅ Advanced filtering + saved views on the Activity page — shipped
4. ✅ Reports page (category breakdown, income/expense, biggest tx, date presets, CSV) — shipped
5. ✅ Per-category budgets with progress — shipped
6. ✅ Split transactions (multiple categories on one entry) — shipped

**Phase 2A complete.** ✅ All six core "complete tracker" items shipped.

**Phase 2B — recurring & goals:**
7. ✅ Recurring transactions + bills/subscriptions + due reminders — shipped (mark-paid → posts; plus opt-in auto-post via a daily Edge Function + pg_cron generator)
8. ✅ Savings goals — shipped
9. ✅ Account detail page + reconciliation — shipped

**Phase 2B complete.** ✅ Recurring/bills · savings goals · account detail + reconciliation.

**Phase 2C — polish & power:**
10. ✅ JSON backup/restore · ✅ bulk actions · ✅ calculator field · ✅ attachments/receipts — all shipped
11. ✅ Multi-currency base conversion (FX table) — DONE: rates, per-txn snapshot, net worth & reports conversion, Settings rate card, cross-currency transfers, account estimates. (Optional later: live-rate API job.)
12. ✅ Rules engine (auto-categorize/tag on create, import & existing) — shipped. Still open: shared wallets, notifications, app lock

---

## Schema additions implied (one migration can cover a phase)
- `tags`, `transaction_tags`
- `transaction_splits` (or line-items)
- `budgets`
- `recurring_transactions` (covers recurring + bills + templates)
- `savings_goals` (+ `goal_transactions`)
- `fx_rates`
- `attachments` (+ Storage bucket)
- ✅ `transactions.payee` (migration `0010`, + `payee_stats` view)
- ✅ `categories.sort_order/is_archived` (migration `0011`)
- ✅ `rules` (migration `0012`, JSONB conditions/actions)
- ✅ `recurring_transactions.auto_post` + `app_secrets` + pg_cron/pg_net cron→Edge Function (migrations `0013`/`0014`, recurring auto-generator)
- ✅ `accounts.is_liability` + `credit_card`/`loan` account types (migrations `0015`/`0016`)
- ✅ `accounts.credit_limit` (migration `0017`) + `accounts.exclude_from_stats` (migration `0018`)
- ✅ `transactions.status` (migration `0021`, reconciliation flag)
- ✅ `delete_current_user()` RPC for self-service account deletion (migration `0020`)
- Column adds still open: `transactions.linked_transaction_id` (refund link), `accounts.sort_order`
- Optional: `saved_views`, `spaces` + membership (sharing)

All additions stay RLS-scoped per user, consistent with the existing schema.
