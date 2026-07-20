import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/** Centralized query keys so cache invalidation stays consistent. */
export const qk = {
  profile: ['profile'] as const,
  books: ['books'] as const,
  accounts: ['accounts'] as const,
  balances: ['balances'] as const,
  categories: ['categories'] as const,
  budgets: ['budgets'] as const,
  recurring: ['recurring'] as const,
  savingsGoals: ['savings_goals'] as const,
  goalContributions: ['goal_contributions'] as const,
  tags: ['tags'] as const,
  transactionTags: ['transaction_tags'] as const,
  transactionSplits: ['transaction_splits'] as const,
  attachments: ['attachments'] as const,
  fxRates: ['fx_rates'] as const,
  payees: ['payees'] as const,
  transactionTemplates: ['transaction_templates'] as const,
  rules: ['rules'] as const,
  botLinks: ['bot_links'] as const,
  creditsBalance: ['credits_balance'] as const,
  creditLedger: ['credit_ledger'] as const,
  billingPlans: ['billing_plans'] as const,
  creditPacks: ['credit_packs'] as const,
  subscription: ['subscription'] as const,
  paymentOrders: ['payment_orders'] as const,
  transactions: (filters?: Record<string, unknown>) =>
    filters ? (['transactions', filters] as const) : (['transactions'] as const),
}
