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
export type TransactionSource = 'web' | 'whatsapp' | 'import'
/** Reconciliation state: just recorded, seen on the statement, or matched & locked. */
export type TransactionStatus = 'pending' | 'cleared' | 'reconciled'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  base_currency: string
  locale: string | null
  created_at: string
}

export interface Account {
  id: string
  user_id: string
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
  name: string
  color: string | null
  created_at: string
}

export interface TransactionTag {
  transaction_id: string
  tag_id: string
  user_id: string
  created_at: string
}

export interface TransactionSplit {
  id: string
  transaction_id: string
  user_id: string
  category_id: string | null
  amount: number
  note: string | null
  created_at: string
}

export interface SavingsGoal {
  id: string
  user_id: string
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
  balance: number
}

export type NewBudget = Omit<Budget, 'id' | 'user_id' | 'created_at'>

export type NewSavingsGoal = Omit<SavingsGoal, 'id' | 'user_id' | 'created_at' | 'is_archived'> &
  Partial<Pick<SavingsGoal, 'is_archived'>>

export type NewGoalContribution = Omit<GoalContribution, 'id' | 'user_id' | 'created_at'>

export type NewRecurringTransaction = Omit<
  RecurringTransaction,
  'id' | 'user_id' | 'created_at' | 'last_paid_at' | 'is_active' | 'auto_post'
> &
  Partial<Pick<RecurringTransaction, 'is_active' | 'auto_post'>>

export interface TransactionTemplate {
  id: string
  user_id: string
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
  'id' | 'user_id' | 'created_at'
>

export type NewTag = Omit<Tag, 'id' | 'user_id' | 'created_at'>

export type NewCategory = Omit<
  Category,
  'id' | 'user_id' | 'created_at' | 'is_archived' | 'sort_order'
> &
  Partial<Pick<Category, 'is_archived' | 'sort_order'>>

export type NewAccount = Omit<
  Account,
  | 'id'
  | 'user_id'
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

export type NewRule = Omit<Rule, 'id' | 'user_id' | 'created_at' | 'sort_order'> &
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
