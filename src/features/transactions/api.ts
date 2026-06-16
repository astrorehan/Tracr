import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { NewTransaction, Transaction, TransactionStatus } from '@/types/db'
import { computeFxSnapshot } from '@/features/fx/snapshot'

/**
 * Freeze a base-currency snapshot on the transaction at create time so reports
 * stay accurate even after rates move. Native amount/currency are untouched.
 * Leaves base_amount null when no rate is available (filled later if needed).
 */
async function withFxSnapshot(input: NewTransaction): Promise<NewTransaction> {
  if (input.base_amount != null) return input // caller already valued it
  const snap = await computeFxSnapshot(input.amount, input.currency)
  return { ...input, ...snap }
}

export interface TransactionFilters {
  accountId?: string
  categoryId?: string
  type?: Transaction['type']
  from?: string
  to?: string
  search?: string
  limit?: number
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: qk.transactions(filters as Record<string, unknown>),
    queryFn: async (): Promise<Transaction[]> => {
      let query = supabase
        .from('transactions')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(filters.limit ?? 200)

      if (filters.accountId)
        query = query.or(
          `account_id.eq.${filters.accountId},counter_account_id.eq.${filters.accountId}`,
        )
      if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
      if (filters.type) query = query.eq('type', filters.type)
      if (filters.from) query = query.gte('occurred_at', filters.from)
      if (filters.to) query = query.lte('occurred_at', filters.to)
      if (filters.search) query = query.ilike('note', `%${filters.search}%`)

      const { data, error } = await query
      if (error) throw error
      return data as Transaction[]
    },
  })
}

/** Distinct payees from history, most-used first — for add-form / filter autocomplete. */
export function usePayees() {
  return useQuery({
    queryKey: qk.payees,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('payee_stats')
        .select('payee')
        .order('txn_count', { ascending: false })
        .order('last_used', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []).map((r) => (r as { payee: string }).payee)
    },
    staleTime: 60_000,
  })
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['transactions'] })
  void qc.invalidateQueries({ queryKey: qk.balances })
  void qc.invalidateQueries({ queryKey: qk.transactionTags })
  void qc.invalidateQueries({ queryKey: qk.transactionSplits })
  void qc.invalidateQueries({ queryKey: qk.payees })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTransaction): Promise<Transaction> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const valued = await withFxSnapshot(input)
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...valued, user_id: userId })
        .select()
        .single()
      if (error) throw error
      return data as Transaction
    },
    onSuccess: () => invalidateAll(qc),
  })
}

/**
 * Clone a transaction as a fresh entry dated now, carrying over its tags and
 * splits. The FX snapshot is recomputed (it's a new transaction today), and
 * source is 'web' so the copy reads as a manual entry.
 */
export function useDuplicateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      tx,
      tagIds = [],
      splits = [],
    }: {
      tx: Transaction
      tagIds?: string[]
      splits?: { category_id: string | null; amount: number; note?: string | null }[]
    }): Promise<Transaction> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const snap = await computeFxSnapshot(tx.amount, tx.currency)
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          account_id: tx.account_id,
          counter_account_id: tx.counter_account_id,
          category_id: tx.category_id,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          counter_amount: tx.counter_amount,
          counter_fx_rate: tx.counter_fx_rate,
          occurred_at: new Date().toISOString(),
          payee: tx.payee,
          note: tx.note,
          source: 'web' as const,
          ...snap,
        })
        .select()
        .single()
      if (error) throw error
      const copy = data as Transaction

      if (splits.length > 0) {
        const { error: splitErr } = await supabase.from('transaction_splits').insert(
          splits.map((s) => ({
            transaction_id: copy.id,
            user_id: userId,
            category_id: s.category_id,
            amount: s.amount,
            note: s.note ?? null,
          })),
        )
        if (splitErr) throw splitErr
      }
      if (tagIds.length > 0) {
        const { error: tagErr } = await supabase
          .from('transaction_tags')
          .insert(tagIds.map((tag_id) => ({ transaction_id: copy.id, tag_id, user_id: userId })))
        if (tagErr) throw tagErr
      }
      return copy
    },
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Transaction> }) => {
      const { error } = await supabase.from('transactions').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
  })
}

/** Delete many transactions at once (bulk action). */
export function useBulkDeleteTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return
      const { error } = await supabase.from('transactions').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
  })
}

/** Set the category on many transactions at once (bulk recategorize). */
export function useBulkSetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, categoryId }: { ids: string[]; categoryId: string | null }) => {
      if (ids.length === 0) return
      const { error } = await supabase
        .from('transactions')
        .update({ category_id: categoryId })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
  })
}

/** Set the reconciliation status on many transactions at once. */
export function useBulkSetStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: TransactionStatus }) => {
      if (ids.length === 0) return
      const { error } = await supabase.from('transactions').update({ status }).in('id', ids)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
  })
}
