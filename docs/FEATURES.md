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
| **Payee / merchant field** | Who you paid; autocomplete from history; report by payee | ⬜🔧 | add `payee text` to transactions |
| **Recurring transactions** | Auto-create on a schedule (salary, rent, subscriptions) | ⬜🔧 | `recurring_transactions` + generator (cron/Edge Fn) |
| **Attachments / receipts** | Photo or PDF per transaction | ✅ | Private Storage bucket `attachments` (per-user folder RLS) + `attachments` table (migration `0008`). Attach in the add form; paperclip + count on rows opens a viewer modal (signed-URL thumbnails, add/delete). Storage files orphan on tx delete (cleanup = follow-up) |
| **Quick templates / favorites** | One-tap repeat of common entries | ⬜🔧 | reuse recurring table w/ `auto=false`, or `templates` |
| **Bulk actions** | Multi-select → delete / recategorize / tag | ✅ | Activity "Select" mode → checkboxes + select-all; floating bar: set category (skips transfers), add tags (dedupes), delete. Bulk mutations `useBulkDeleteTransactions`/`useBulkSetCategory`/`useBulkAddTags` |
| **Duplicate / clone** | Copy an existing transaction | ⬜ | UI only |
| **Refund / reimbursement link** | Tie a refund to its original expense | ⬜🔧 | `linked_transaction_id` |
| **Cleared / reconciled flag** | Mark which entries match the bank | ⬜🔧 | add `status` (`pending`/`cleared`/`reconciled`) |
| **Calculator in amount field** | `12000+3500` evaluates inline | ✅ | Safe expression evaluator (`lib/calc.ts`); `amountToMinor` used by every amount field (transaction, splits, budget, goal, contribution, bill, account, reconcile); live `= …` preview in the add form |
| **Cross-currency transfers** | Transfer between accounts of different currencies w/ rate | 🟡🔧 | add `counter_amount`/`fx_rate` to transfers |

## 2. Categories (Tier 1)
| Feature | Status | Notes |
|---|---|---|
| **Subcategories (nested)** | ✅ | One-level nesting: parent picker in the form, indented under parents on the Categories page + grouped/indented in the transaction picker |
| **Category icons** | ✅ | Curated lucide icon picker in the form; icons shown on the Categories page (color-tinted) |
| **Reorder (drag) & sort** | ⬜🔧 | add `sort_order int` |
| **Merge categories** | ⬜ | move txns from A→B, delete A |
| **Archive category** | ⬜🔧 | add `is_archived` (mirror accounts) |

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
- ✅ Filter by **any combo**: account, category + subcategory, tag(s) (any/all), type, date range, amount range (min/max), note text, source. (payee, currency, cleared status pending their own schema features)
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
- ⬜ Still TODO: net-worth trend & account balance history (need balance snapshots), period-over-period comparison, top payees/merchants (needs payee field), calendar heatmap, PDF export, drill-into-subcategory/tag

## 7. Accounts — depth (Tier 2)
| Feature | Status | Notes |
|---|---|---|
| **Account detail page** | ✅ | `/accounts/:id` — running end-of-day balance area chart + full per-account ledger (incl. transfers both directions); edit/archive; cards on Accounts page link here |
| **Reconciliation** | ✅ | "Reconcile" → enter real balance → creates a signed **Balance adjustment** income/expense so Tracr matches; live diff preview |
| **Liabilities / debts / credit cards** | 🟡🔧 | allow negative; add `is_liability`; pay-down tracking |
| **Include/exclude from net worth & stats** | ⬜🔧 | add `exclude_from_stats bool` |
| **Account groups & ordering** | ⬜🔧 | `account_groups` or `sort_order` |
| **Multi-currency net worth** | 🟡🔧 | FX conversion to base — `fx_rates` table (manual entry for free tier) + snapshot on txn |

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
- ✅ `recurring_transactions` table (migration `0006`; RLS per-user). **No auto-post** — user confirms each (chosen design; an Edge Function/pg_cron auto-generator can layer on later)
- ⬜ Calendar view, web-push reminders (see §12)

## 10. Multi-currency (Tier 2)
- Manual FX rate table (free-tier friendly; live API optional later, still non-AI)
- Convert everything to base currency in net worth & reports
- Store FX snapshot on each transaction for accurate history
- 🔧 `fx_rates` (base, quote, rate, as_of)

## 11. Data, backup & sync (Tier 2)
- CSV import **column-mapping wizard** (upgrade current fixed-format importer) — ⬜
- ✅ Full **JSON backup / restore** (everything, portable) — Settings → Data → "Full backup". Exports all 10 tables in one JSON; restore upserts by id (re-stamps user_id, keeps relationships, idempotent) with a pre-apply count preview. Logic in `features/data/backup.ts`
- Import presets for Money Manager / Wallet exports — ⬜
- Per-account statement import — ⬜

## 12. Notifications & reminders (Tier 3)
- Web push (service worker) — non-AI
- Bill due / overdue alerts, budget threshold alerts, daily/weekly "log your spending" nudge
- In-app notification center

## 13. Power-user & sharing (Tier 3)
- **Rules engine** (Firefly-style): "if payee contains GoFood → category Food, tag delivery" applied on create/import
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
7. ✅ Recurring transactions + bills/subscriptions + due reminders — shipped (bills-only, mark-paid → posts; no auto-insert)
8. ✅ Savings goals — shipped
9. ✅ Account detail page + reconciliation — shipped

**Phase 2B complete.** ✅ Recurring/bills · savings goals · account detail + reconciliation.

**Phase 2C — polish & power:**
10. ✅ JSON backup/restore · ✅ bulk actions · ✅ calculator field · ✅ attachments/receipts — all shipped
11. Multi-currency base conversion (FX table)
12. Rules engine, shared wallets, notifications, app lock

---

## Schema additions implied (one migration can cover a phase)
- `tags`, `transaction_tags`
- `transaction_splits` (or line-items)
- `budgets`
- `recurring_transactions` (covers recurring + bills + templates)
- `savings_goals` (+ `goal_transactions`)
- `fx_rates`
- `attachments` (+ Storage bucket)
- Column adds: `transactions.payee`, `transactions.status`, `transactions.linked_transaction_id`, `categories.sort_order/is_archived`, `accounts.exclude_from_stats/is_liability/sort_order`
- Optional: `saved_views`, `spaces` + membership (sharing)

All additions stay RLS-scoped per user, consistent with the existing schema.
