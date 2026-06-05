/** Hand-written types mirroring the Postgres schema in supabase/migrations. */

export type AccountType = 'cash' | 'bank_card' | 'e_wallet' | 'crypto' | 'stocks' | 'other'
export type TransactionType = 'income' | 'expense' | 'transfer'
export type CategoryKind = 'income' | 'expense'
export type TransactionSource = 'web' | 'whatsapp' | 'import'

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
  'id' | 'user_id' | 'created_at' | 'last_paid_at' | 'is_active'
> &
  Partial<Pick<RecurringTransaction, 'is_active'>>

export type NewTag = Omit<Tag, 'id' | 'user_id' | 'created_at'>

export type NewCategory = Omit<Category, 'id' | 'user_id' | 'created_at'>

export type NewAccount = Omit<Account, 'id' | 'user_id' | 'created_at' | 'is_archived'> &
  Partial<Pick<Account, 'is_archived'>>

export type NewTransaction = Omit<
  Transaction,
  | 'id'
  | 'user_id'
  | 'created_at'
  | 'source'
  | 'payee'
  | 'external_ref'
  | 'base_amount'
  | 'fx_rate'
  | 'counter_amount'
  | 'counter_fx_rate'
> &
  Partial<
    Pick<
      Transaction,
      'source' | 'payee' | 'base_amount' | 'fx_rate' | 'counter_amount' | 'counter_fx_rate'
    >
  >

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
