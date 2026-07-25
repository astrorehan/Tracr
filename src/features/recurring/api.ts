import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { advanceDue } from './schedule'
import { computeFxSnapshot } from '@/features/fx/snapshot'
import type { NewRecurringTransaction, RecurringTransaction } from '@/types/db'
import { useActiveBook } from '@/features/books/useActiveBook'

import { enqueueOfflineMutation } from '@/lib/offlineQueue'
import { getAuthenticatedUserId } from '@/lib/authHelpers'

export function useRecurring() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.recurring, activeBookId],
    queryFn: async (): Promise<RecurringTransaction[]> => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('next_due')
      if (error) throw error
      return data as RecurringTransaction[]
    },
  })
}

export function useCreateRecurring() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewRecurringTransaction): Promise<RecurringTransaction> => {
      const userId = await getAuthenticatedUserId()
      const payload = { ...input, user_id: userId, book_id: activeBookId }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = `temp-rec-${Date.now()}`
        const dummyRec: RecurringTransaction = {
          id: tempId,
          user_id: userId,
          book_id: activeBookId || '',
          name: payload.name,
          account_id: payload.account_id,
          category_id: payload.category_id ?? null,
          type: payload.type,
          amount: payload.amount,
          currency: payload.currency,
          frequency: payload.frequency,
          interval: payload.interval ?? 1,
          next_due: payload.next_due,
          auto_post: payload.auto_post ?? false,
          is_active: true,
          note: payload.note ?? null,
          last_paid_at: null,
          created_at: new Date().toISOString(),
        }
        enqueueOfflineMutation('CREATE_RECURRING', { ...payload, tempId })
        qc.setQueriesData({ queryKey: [...qk.recurring, activeBookId] }, (old: RecurringTransaction[] | undefined) =>
          old ? [...old, dummyRec] : [dummyRec],
        )
        return dummyRec
      }

      try {
        const { data, error } = await supabase
          .from('recurring_transactions')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as RecurringTransaction
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_RECURRING', payload)
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}

export function useUpdateRecurring() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<RecurringTransaction> }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_RECURRING', { id, ...patch })
        qc.setQueriesData({ queryKey: [...qk.recurring, activeBookId] }, (old: RecurringTransaction[] | undefined) =>
          old ? old.map((r) => (r.id === id ? { ...r, ...patch } : r)) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('recurring_transactions').update(patch).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_RECURRING', { id, ...patch })
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.recurring }),
  })
}

export function useDeleteRecurring() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (id: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('DELETE_RECURRING', { id })
        qc.setQueriesData({ queryKey: [...qk.recurring, activeBookId] }, (old: RecurringTransaction[] | undefined) =>
          old ? old.filter((r) => r.id !== id) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('recurring_transactions').delete().eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('DELETE_RECURRING', { id })
        }
        throw err
      }
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
      const userId = await getAuthenticatedUserId()

      const occurredAt = new Date(`${on ?? rec.next_due}T12:00:00`).toISOString()
      const snap = await computeFxSnapshot(rec.amount, rec.currency)
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        book_id: rec.book_id,
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
