import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { BillingPlan, CreditLedgerEntry, CreditPack, Subscription } from '@/types/db'

/** credits_balance() RPC result — a single jsonb object, not a row set. */
export interface CreditsBalance {
  plan: 'free' | 'pro'
  ym: string
  subscription_granted: number
  subscription_used: number
  subscription_remaining: number
  topup_balance: number
}

/** The two pools combined — what the small inline UI surfaces (chat bubble,
 *  insight card, chip) show as a single number. */
export function totalRemaining(b: CreditsBalance | undefined): number {
  return b ? b.subscription_remaining + b.topup_balance : 0
}

export function useCreditBalance() {
  return useQuery({
    queryKey: qk.creditsBalance,
    queryFn: async (): Promise<CreditsBalance> => {
      const { data, error } = await supabase.rpc('credits_balance')
      if (error) throw error
      return data as CreditsBalance
    },
  })
}

export function useCreditLedger(limit = 50) {
  return useQuery({
    queryKey: [...qk.creditLedger, limit] as const,
    queryFn: async (): Promise<CreditLedgerEntry[]> => {
      const { data, error } = await supabase
        .from('credit_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as CreditLedgerEntry[]
    },
  })
}

export function useBillingPlans() {
  return useQuery({
    queryKey: qk.billingPlans,
    queryFn: async (): Promise<BillingPlan[]> => {
      const { data, error } = await supabase.from('billing_plans').select('*')
      if (error) throw error
      return data as BillingPlan[]
    },
  })
}

export function useCreditPacks() {
  return useQuery({
    queryKey: qk.creditPacks,
    queryFn: async (): Promise<CreditPack[]> => {
      const { data, error } = await supabase
        .from('credit_packs')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as CreditPack[]
    },
  })
}

export interface TopupCheckout {
  token?: string
  redirect_url?: string
  order_id?: string
  error?: string
}

/** Kicks off a Midtrans Snap top-up: creates the pending order server-side
 *  and returns a Snap token to hand to snapPay(). Does NOT grant credits —
 *  the webhook does that once Midtrans confirms payment. */
export function useStartTopup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (packId: string): Promise<TopupCheckout> => {
      const { data, error } = await supabase.functions.invoke<TopupCheckout>('billing-checkout', {
        body: { action: 'topup', pack_id: packId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data ?? {}
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.paymentOrders }),
  })
}

/** The caller's most recent subscription row (any status), or null if they've
 *  never subscribed. */
export function useSubscription() {
  return useQuery({
    queryKey: qk.subscription,
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Subscription | null
    },
  })
}
