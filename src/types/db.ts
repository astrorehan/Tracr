/** Hand-written types mirroring the Postgres schema in supabase/migrations. */

export type AccountType =
  | 'cash'
  | 'bank_card'
  | 'credit_card'
  | 'e_wallet'
  | 'crypto'
  | 'stocks'
  | 'loan'
  | 'receivable'
  | 'other'
export type TransactionType = 'income' | 'expense' | 'transfer'
export type CategoryKind = 'income' | 'expense'
export type TransactionSource = 'web' | 'whatsapp' | 'import' | 'telegram'
/** Reconciliation state: just recorded, seen on the statement, or matched & locked. */
export type TransactionStatus = 'pending' | 'cleared' | 'reconciled'

export type BillingPlanId = 'free' | 'pro'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  base_currency: string
  locale: string | null
  /** The book the user currently has open; mirrored to localStorage for instant boot. */
  active_book_id: string | null
  /** Denormalized cache of the active plan; self-heals if a Pro subscription lapses. */
  plan: BillingPlanId
  created_at: string
}

/** A ledger. One user owns several independent books (Personal, Business, …). */
export interface Book {
  id: string
  owner_id: string
  name: string
  color: string | null
  icon: string | null
  is_archived: boolean
  last_opened_at: string | null
  created_at: string
}

export type NewBook = Pick<Book, 'name'> & Partial<Pick<Book, 'color' | 'icon'>>

export interface Account {
  id: string
  user_id: string
  book_id: string
  name: string
  type: AccountType
  currency: string
  opening_balance: number
  icon: string | null
  color: string | null
  is_archived: boolean
  /** True for debts (credit cards, loans): the balance runs negative and is shown as owed. */
  is_liability: boolean
  /** Credit limit in minor units (liabilities only); null = no limit. Drives utilization. */
  credit_limit: number | null
  /** When true, the account is left out of net worth / assets / debts / allocation. */
  exclude_from_stats: boolean
  /** Manual ordering within the user's accounts list; lower = first. */
  sort_order: number
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  book_id: string
  name: string
  kind: CategoryKind
  parent_id: string | null
  icon: string | null
  color: string | null
  is_archived: boolean
  /** Manual ordering within a (kind, parent) sibling group; lower = first. */
  sort_order: number
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  book_id: string
  account_id: string
  category_id: string | null
  counter_account_id: string | null
  type: TransactionType
  amount: number
  currency: string
  /** Frozen value in the user's base currency (minor units) at create time; null = rate unknown. */
  base_amount: number | null
  /** Native -> base rate captured at create time. */
  fx_rate: number | null
  /** Transfers: amount credited to the counter account in its currency; null = same-currency (use amount). */
  counter_amount: number | null
  counter_fx_rate: number | null
  occurred_at: string
  note: string | null
  /** Merchant / payee (free text); null = not recorded. */
  payee: string | null
  source: TransactionSource
  /** Reconciliation state; defaults to 'pending' on insert. */
  status: TransactionStatus
  /** Links a refund/reimbursement to the original transaction it offsets; null = standalone. */
  linked_transaction_id: string | null
  external_ref: string | null
  created_at: string
}

export interface Tag {
  id: string
  user_id: string
  book_id: string
  name: string
  color: string | null
  created_at: string
}

export interface TransactionTag {
  transaction_id: string
  tag_id: string
  user_id: string
  book_id: string
  created_at: string
}

export interface TransactionSplit {
  id: string
  transaction_id: string
  user_id: string
  book_id: string
  category_id: string | null
  amount: number
  note: string | null
  created_at: string
}

export interface SavingsGoal {
  id: string
  user_id: string
  book_id: string
  name: string
  target_amount: number
  currency: string
  target_date: string | null
  account_id: string | null
  color: string | null
  icon: string | null
  is_archived: boolean
  created_at: string
}

export interface GoalContribution {
  id: string
  user_id: string
  book_id: string
  goal_id: string
  /** Signed minor units: positive = added, negative = withdrawn. */
  amount: number
  note: string | null
  occurred_at: string
  created_at: string
}

export type RecurrenceFreq = 'weekly' | 'monthly' | 'yearly'

export interface RecurringTransaction {
  id: string
  user_id: string
  book_id: string
  name: string
  type: TransactionType
  account_id: string
  category_id: string | null
  amount: number
  currency: string
  frequency: RecurrenceFreq
  interval: number
  /** Next due date, stored as a yyyy-MM-dd date. */
  next_due: string
  is_active: boolean
  /** Opt-in: a daily server job auto-posts this when due (default false = confirm-each). */
  auto_post: boolean
  note: string | null
  last_paid_at: string | null
  created_at: string
}

export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly'

export interface Budget {
  id: string
  user_id: string
  book_id: string
  /** null = an overall ("all spending") budget for the period. */
  category_id: string | null
  period: BudgetPeriod
  amount: number
  currency: string
  rollover: boolean
  created_at: string
}

export interface Attachment {
  id: string
  user_id: string
  book_id: string
  transaction_id: string
  path: string
  name: string
  mime: string | null
  size: number | null
  created_at: string
}

/** Row from the account_balances view (computed server-side). */
export interface AccountBalance {
  account_id: string
  user_id: string
  book_id: string
  balance: number
}

export type NewBudget = Omit<Budget, 'id' | 'user_id' | 'book_id' | 'created_at'>

export type NewSavingsGoal = Omit<
  SavingsGoal,
  'id' | 'user_id' | 'book_id' | 'created_at' | 'is_archived'
> &
  Partial<Pick<SavingsGoal, 'is_archived'>>

export type NewGoalContribution = Omit<
  GoalContribution,
  'id' | 'user_id' | 'book_id' | 'created_at'
>

export type NewRecurringTransaction = Omit<
  RecurringTransaction,
  'id' | 'user_id' | 'book_id' | 'created_at' | 'last_paid_at' | 'is_active' | 'auto_post'
> &
  Partial<Pick<RecurringTransaction, 'is_active' | 'auto_post'>>

export interface TransactionTemplate {
  id: string
  user_id: string
  book_id: string
  name: string
  type: TransactionType
  account_id: string | null
  category_id: string | null
  /** Default amount in minor units; 0 = leave blank when applied. */
  amount: number
  payee: string | null
  note: string | null
  created_at: string
}

export type NewTransactionTemplate = Omit<
  TransactionTemplate,
  'id' | 'user_id' | 'book_id' | 'created_at'
>

export type NewTag = Omit<Tag, 'id' | 'user_id' | 'book_id' | 'created_at'>

export type NewCategory = Omit<
  Category,
  'id' | 'user_id' | 'book_id' | 'created_at' | 'is_archived' | 'sort_order'
> &
  Partial<Pick<Category, 'is_archived' | 'sort_order'>>

export type NewAccount = Omit<
  Account,
  | 'id'
  | 'user_id'
  | 'book_id'
  | 'created_at'
  | 'is_archived'
  | 'is_liability'
  | 'credit_limit'
  | 'exclude_from_stats'
  | 'sort_order'
> &
  Partial<
    Pick<
      Account,
      'is_archived' | 'is_liability' | 'credit_limit' | 'exclude_from_stats' | 'sort_order'
    >
  >

export type NewTransaction = Omit<
  Transaction,
  | 'id'
  | 'user_id'
  | 'book_id'
  | 'created_at'
  | 'source'
  | 'payee'
  | 'status'
  | 'linked_transaction_id'
  | 'external_ref'
  | 'base_amount'
  | 'fx_rate'
  | 'counter_amount'
  | 'counter_fx_rate'
> &
  Partial<
    Pick<
      Transaction,
      | 'source'
      | 'payee'
      | 'status'
      | 'linked_transaction_id'
      | 'base_amount'
      | 'fx_rate'
      | 'counter_amount'
      | 'counter_fx_rate'
    >
  >

export type RuleField = 'payee' | 'note' | 'amount' | 'type'
export type RuleOp = 'contains' | 'equals' | 'starts_with' | 'gt' | 'lt'
export type RuleMatch = 'all' | 'any'

export interface RuleCondition {
  field: RuleField
  op: RuleOp
  value: string
}

export interface RuleActions {
  /** Category to assign (null/absent = don't touch category). */
  category_id?: string | null
  /** Tags to add (union with whatever's already there). */
  tag_ids?: string[]
}

export interface Rule {
  id: string
  user_id: string
  book_id: string
  name: string
  is_active: boolean
  sort_order: number
  match_type: RuleMatch
  conditions: RuleCondition[]
  actions: RuleActions
  /** Stop evaluating later rules once this one matches. */
  stop_after: boolean
  created_at: string
}

export type NewRule = Omit<Rule, 'id' | 'user_id' | 'book_id' | 'created_at' | 'sort_order'> &
  Partial<Pick<Rule, 'sort_order'>>

export interface FxRate {
  id: string
  user_id: string
  /** 1 unit of `base` = `rate` units of `quote`. */
  base: string
  quote: string
  rate: number
  /** yyyy-MM-dd */
  as_of: string
  source: string
  created_at: string
}

export type NewFxRate = Omit<FxRate, 'id' | 'user_id' | 'created_at' | 'source'> &
  Partial<Pick<FxRate, 'source'>>

/** A browser/device Web Push subscription (one per PushManager endpoint). */
export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
  last_seen_at: string
}

// ── AI credits & billing (migration 0034) ──────────────────────────────────

/** Config row: what a plan grants and costs. The only place "10"/"150" live. */
export interface BillingPlan {
  plan: BillingPlanId
  monthly_credits: number
  price_monthly_idr: number | null
  price_yearly_idr: number | null
  /** Pro-only launch gate — false until Midtrans recurring billing is approved. */
  is_purchasable: boolean
  updated_at: string
}

/** Config row: a purchasable top-up pack. */
export interface CreditPack {
  id: string
  credits: number
  price_idr: number
  sort_order: number
  is_active: boolean
  created_at: string
}

/** This month's subscription-pool allotment. Lazily created; unused credits
 *  never carry into the next `ym` row — that is the monthly expiry. */
export interface CreditsSubscription {
  user_id: string
  /** 'YYYY-MM' bucket. */
  ym: string
  granted: number
  used: number
  updated_at: string
}

/** Never-expiring purchased balance. One row per user. */
export interface CreditsTopup {
  user_id: string
  balance: number
  updated_at: string
}

export type CreditPool = 'subscription' | 'topup'
export type CreditLedgerReason = 'monthly_grant' | 'consume' | 'topup_purchase' | 'expire' | 'admin_adjustment'

/** One row per balance-affecting event, append-only — the transparency log. */
export interface CreditLedgerEntry {
  id: string
  user_id: string
  pool: CreditPool
  /** Positive = credit, negative = debit. */
  delta: number
  reason: CreditLedgerReason
  /** That pool's balance right after this event. */
  balance_after: number
  /** ym bucket, order_id, or null depending on `reason`. */
  ref: string | null
  created_at: string
}

export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired'
export type BillingPeriod = 'monthly' | 'yearly'

/** Pro billing lifecycle. Multiple historical rows allowed per user (cancel,
 *  resubscribe); at most one `active`/`past_due` row at a time. */
export interface Subscription {
  id: string
  user_id: string
  midtrans_subscription_id: string | null
  plan: 'pro'
  billing_period: BillingPeriod
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

export type PaymentOrderKind = 'topup' | 'subscription_initial' | 'subscription_renewal'
export type PaymentOrderStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled'

/** Every Midtrans order, keyed by our own order_id (the webhook's idempotency
 *  key). Doubles as payment history. */
export interface PaymentOrder {
  order_id: string
  user_id: string
  kind: PaymentOrderKind
  status: PaymentOrderStatus
  credit_pack_id: string | null
  billing_plan: BillingPlanId | null
  billing_period: BillingPeriod | null
  gross_amount_idr: number
  midtrans_transaction_id: string | null
  raw_notification: unknown
  created_at: string
  updated_at: string
}
