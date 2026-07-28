import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getOfflineQueue,
  getFailedMutations,
  processOfflineQueue,
  remapQueuedTempIds,
  retryFailedMutation,
  removeFailedMutation,
  clearFailedMutations,
  type QueuedMutation,
} from './offlineQueue'
import { qk } from './queryClient'
import { supabase } from './supabase'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [pendingCount, setPendingCount] = useState<number>(() => getOfflineQueue().length)
  const [failedCount, setFailedCount] = useState<number>(() => getFailedMutations().length)
  const [failedItems, setFailedItems] = useState<QueuedMutation[]>(() => getFailedMutations())
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<{ processed: number; failed: number } | null>(
    null,
  )

  const queryClient = useQueryClient()

  const refreshCounts = useCallback(() => {
    setPendingCount(getOfflineQueue().length)
    const failed = getFailedMutations()
    setFailedCount(failed.length)
    setFailedItems(failed)
  }, [])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return
    setIsSyncing(true)

    try {
      const result = await processOfflineQueue(async (mutation: QueuedMutation) => {
        const { type, payload } = mutation

        // --- TRANSACTIONS ---
        if (type === 'CREATE_TRANSACTION') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('transactions').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_TRANSACTION') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('transactions').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_TRANSACTION') {
          const { id } = payload
          const { error } = await supabase.from('transactions').delete().eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'SET_TRANSACTION_TAGS') {
          const { transactionId, tagIds, userId, bookId } = payload
          const { error: delError } = await supabase
            .from('transaction_tags')
            .delete()
            .eq('transaction_id', transactionId)
          if (delError) throw delError
          if (tagIds && tagIds.length > 0) {
            const { error: insError } = await supabase.from('transaction_tags').insert(
              tagIds.map((tag_id: string) => ({
                transaction_id: transactionId,
                tag_id,
                user_id: userId,
                book_id: bookId,
              })),
            )
            if (insError) throw insError
          }
          return true
        }

        if (type === 'SET_TRANSACTION_SPLITS') {
          const { transactionId, splits, userId, bookId } = payload
          const { error: delError } = await supabase
            .from('transaction_splits')
            .delete()
            .eq('transaction_id', transactionId)
          if (delError) throw delError
          if (splits && splits.length > 0) {
            const { error: insError } = await supabase.from('transaction_splits').insert(
              splits.map((s: { category_id: string | null; amount: number; note?: string | null }) => ({
                transaction_id: transactionId,
                user_id: userId,
                book_id: bookId,
                category_id: s.category_id,
                amount: s.amount,
                note: s.note ?? null,
              })),
            )
            if (insError) throw insError
          }
          return true
        }

        // --- ACCOUNTS ---
        if (type === 'CREATE_ACCOUNT') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('accounts').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_ACCOUNT') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('accounts').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_ACCOUNT') {
          const { id } = payload
          const { error } = await supabase.from('accounts').delete().eq('id', id)
          if (error) throw error
          return true
        }

        // --- CATEGORIES ---
        if (type === 'CREATE_CATEGORY') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('categories').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_CATEGORY') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('categories').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_CATEGORY') {
          const { id } = payload
          const { error } = await supabase.from('categories').delete().eq('id', id)
          if (error) throw error
          return true
        }

        // --- BUDGETS ---
        if (type === 'CREATE_BUDGET') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('budgets').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_BUDGET') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('budgets').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_BUDGET') {
          const { id } = payload
          const { error } = await supabase.from('budgets').delete().eq('id', id)
          if (error) throw error
          return true
        }

        // --- SAVINGS GOALS ---
        if (type === 'CREATE_GOAL') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('savings_goals').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_GOAL') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('savings_goals').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_GOAL') {
          const { id } = payload
          const { error } = await supabase.from('savings_goals').delete().eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'ADD_GOAL_CONTRIBUTION' || type === 'CREATE_GOAL_CONTRIBUTION') {
          const { error } = await supabase.from('goal_contributions').insert(payload)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_GOAL_CONTRIBUTION') {
          const { id } = payload
          const { error } = await supabase.from('goal_contributions').delete().eq('id', id)
          if (error) throw error
          return true
        }

        // --- DEBTS ---
        if (type === 'CREATE_DEBT') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('debts').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_DEBT') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('debts').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_DEBT') {
          const { id } = payload
          const { error } = await supabase.from('debts').delete().eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'ADD_DEBT_PAYMENT' || type === 'CREATE_DEBT_PAYMENT') {
          const { error } = await supabase.from('debt_payments').insert(payload)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_DEBT_PAYMENT') {
          const { id } = payload
          const { error } = await supabase.from('debt_payments').delete().eq('id', id)
          if (error) throw error
          return true
        }

        // --- RECURRING ---
        if (type === 'CREATE_RECURRING') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('recurring_transactions').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_RECURRING') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('recurring_transactions').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_RECURRING') {
          const { id } = payload
          const { error } = await supabase.from('recurring_transactions').delete().eq('id', id)
          if (error) throw error
          return true
        }

        // --- PRODUCTS ---
        if (type === 'CREATE_PRODUCT') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('products').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_PRODUCT') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('products').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_PRODUCT') {
          const { id } = payload
          const { error } = await supabase.from('products').delete().eq('id', id)
          if (error) throw error
          return true
        }

        // --- RULES ---
        if (type === 'CREATE_RULE') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('rules').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_RULE') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('rules').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_RULE') {
          const { id } = payload
          const { error } = await supabase.from('rules').delete().eq('id', id)
          if (error) throw error
          return true
        }

        // --- INSTALLMENTS ---
        if (type === 'CREATE_INSTALLMENT') {
          const { tempId, ...rest } = payload
          const { data, error } = await supabase.from('installments').insert(rest).select().single()
          if (error) throw error
          if (tempId && data?.id) {
            remapQueuedTempIds(tempId, data.id)
          }
          return true
        }

        if (type === 'UPDATE_INSTALLMENT') {
          const { id, ...patch } = payload
          const { error } = await supabase.from('installments').update(patch).eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'DELETE_INSTALLMENT') {
          const { id } = payload
          const { error } = await supabase.from('installments').delete().eq('id', id)
          if (error) throw error
          return true
        }

        if (type === 'PAY_INSTALLMENT') {
          const { installmentId, txPayload, paymentPayload, nextPaidMonths, nextStatus } = payload
          if (txPayload) {
            const { data: txData, error: txError } = await supabase
              .from('transactions')
              .insert(txPayload)
              .select('id')
              .single()
            if (!txError && txData) {
              paymentPayload.transaction_id = txData.id
            }
          }
          const { error: payErr } = await supabase.from('installment_payments').insert(paymentPayload)
          if (payErr) throw payErr
          const { error: updateErr } = await supabase
            .from('installments')
            .update({ paid_months: nextPaidMonths, status: nextStatus })
            .eq('id', installmentId)
          if (updateErr) throw updateErr
          return true
        }

        if (type === 'EARLY_PAYOFF_INSTALLMENT') {
          const { installmentId, txPayload, paymentPayloads, nextPaidMonths, nextStatus } = payload
          if (txPayload) {
            const { data: txData, error: txError } = await supabase
              .from('transactions')
              .insert(txPayload)
              .select('id')
              .single()
            if (!txError && txData && paymentPayloads?.length) {
              for (const p of paymentPayloads) p.transaction_id = txData.id
            }
          }
          if (paymentPayloads?.length) {
            const { error: payErr } = await supabase
              .from('installment_payments')
              .insert(paymentPayloads)
            if (payErr) throw payErr
          }
          const { error: updateErr } = await supabase
            .from('installments')
            .update({ paid_months: nextPaidMonths, status: nextStatus })
            .eq('id', installmentId)
          if (updateErr) throw updateErr
          return true
        }

        return true
      })

      setLastSyncResult(result)
      refreshCounts()

      if (result.processed > 0) {
        // Invalidate relevant queries so live DB state updates in UI
        queryClient.invalidateQueries({ queryKey: qk.transactions() })
        queryClient.invalidateQueries({ queryKey: qk.balances })
        queryClient.invalidateQueries({ queryKey: qk.accounts })
        queryClient.invalidateQueries({ queryKey: qk.categories })
        queryClient.invalidateQueries({ queryKey: qk.budgets })
        queryClient.invalidateQueries({ queryKey: qk.savingsGoals })
        queryClient.invalidateQueries({ queryKey: qk.goalContributions })
        queryClient.invalidateQueries({ queryKey: qk.debts })
        queryClient.invalidateQueries({ queryKey: qk.debtPayments })
        queryClient.invalidateQueries({ queryKey: qk.recurring })
        queryClient.invalidateQueries({ queryKey: qk.products })
        queryClient.invalidateQueries({ queryKey: qk.rules })
        queryClient.invalidateQueries({ queryKey: qk.installments })
        queryClient.invalidateQueries({ queryKey: qk.installmentPayments })
      }
    } catch {
      // ignore
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, queryClient, refreshCounts])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      syncNow()
    }
    const handleOffline = () => {
      setIsOnline(false)
      refreshCounts()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Interval check for pending items in localStorage / IndexedDB memory cache
    const interval = setInterval(refreshCounts, 2000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [refreshCounts, syncNow])

  const retryItem = useCallback(
    (id: string) => {
      retryFailedMutation(id)
      refreshCounts()
      syncNow()
    },
    [refreshCounts, syncNow],
  )

  const removeItem = useCallback(
    (id: string) => {
      removeFailedMutation(id)
      refreshCounts()
    },
    [refreshCounts],
  )

  const clearAllFailed = useCallback(() => {
    clearFailedMutations()
    refreshCounts()
  }, [refreshCounts])

  const clearLastSyncResult = useCallback(() => {
    setLastSyncResult(null)
  }, [])

  return {
    isOnline,
    pendingCount,
    failedCount,
    failedItems,
    isSyncing,
    lastSyncResult,
    clearLastSyncResult,
    syncNow,
    refreshCounts,
    retryItem,
    removeItem,
    clearAllFailed,
  }
}
