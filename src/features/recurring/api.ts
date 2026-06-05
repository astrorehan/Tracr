import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { advanceDue } from './schedule'
import { computeFxSnapshot } from '@/features/fx/snapshot'
import type { NewRecurringTransaction, RecurringTransaction } from '@/types/db'

export function useRecurring() {
  return useQuery({
    queryKey: qk.recurring,
    queryFn: async (): Promise<RecurringTransaction[]> => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .order('next_due')
      if (error) throw error
      return data as RecurringTransaction[]
    },
  })
}

export function useCreateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewRecurringTransaction): Promise<RecurringTransaction> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('recurring_transactions')
        .insert({ ...input, user_id: userId })
        .select()
        .single()
      if (error) throw error
      return data as RecurringTransaction
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}

export function useUpdateRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RecurringTransaction> }) => {
      const { error } = await supabase.from('recurring_transactions').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}

export function useDeleteRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}

/**
 * Mark a bill paid: create the real transaction (on its due date by default) and
 * advance the schedule's next_due by one period.
 */
export function useMarkRecurringPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rec, on }: { rec: RecurringTransaction; on?: string }) => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const occurredAt = new Date(`${on ?? rec.next_due}T12:00:00`).toISOString()
      const snap = await computeFxSnapshot(rec.amount, rec.currency)
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        account_id: rec.account_id,
        category_id: rec.category_id,
        counter_account_id: null,
        type: rec.type,
        amount: rec.amount,
        currency: rec.currency,
        occurred_at: occurredAt,
        note: rec.note?.trim() || rec.name,
        ...snap,
      })
      if (txError) throw txError

      const { error: recError } = await supabase
        .from('recurring_transactions')
        .update({
          next_due: advanceDue(rec.next_due, rec.frequency, rec.interval),
          last_paid_at: new Date().toISOString(),
        })
        .eq('id', rec.id)
      if (recError) throw recError
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recurring })
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}

/** Skip this occurrence without creating a transaction (just advance next_due). */
export function useSkipRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rec: RecurringTransaction) => {
      const { error } = await supabase
        .from('recurring_transactions')
        .update({ next_due: advanceDue(rec.next_due, rec.frequency, rec.interval) })
        .eq('id', rec.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}
