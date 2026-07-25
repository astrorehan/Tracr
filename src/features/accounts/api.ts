import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Account, AccountBalance, NewAccount } from '@/types/db'
import { useActiveBook } from '@/features/books/useActiveBook'
import { enqueueOfflineMutation } from '@/lib/offlineQueue'

export function useAccounts(includeArchived = false) {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.accounts, activeBookId, { includeArchived }],
    queryFn: async (): Promise<Account[]> => {
      let query = supabase
        .from('accounts')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('sort_order')
        .order('created_at')
      if (!includeArchived) query = query.eq('is_archived', false)
      const { data, error } = await query
      if (error) throw error
      return data as Account[]
    },
  })
}

export function useBalances() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.balances, activeBookId],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('account_balances')
        .select('*')
        .eq('book_id', activeBookId!)
      if (error) throw error
      const map: Record<string, number> = {}
      for (const row of data as AccountBalance[]) map[row.account_id] = row.balance
      return map
    },
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewAccount): Promise<Account> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const payload = { ...input, user_id: userId, book_id: activeBookId }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = `temp-acc-${Date.now()}`
        const dummyAccount: Account = {
          id: tempId,
          user_id: userId,
          book_id: activeBookId || '',
          name: payload.name,
          type: payload.type,
          currency: payload.currency,
          opening_balance: payload.opening_balance ?? 0,
          is_archived: false,
          is_liability: payload.is_liability ?? false,
          credit_limit: payload.credit_limit ?? null,
          exclude_from_stats: payload.exclude_from_stats ?? false,
          sort_order: 999,
          icon: payload.icon ?? null,
          color: payload.color ?? null,
          created_at: new Date().toISOString(),
        }
        enqueueOfflineMutation('CREATE_ACCOUNT', { ...payload, tempId })
        qc.setQueriesData({ queryKey: qk.accounts }, (old: Account[] | undefined) =>
          old ? [...old, dummyAccount] : [dummyAccount],
        )
        return dummyAccount
      }

      try {
        const { data, error } = await supabase
          .from('accounts')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as Account
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_ACCOUNT', payload)
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Account> }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_ACCOUNT', { id, ...patch })
        qc.setQueriesData({ queryKey: qk.accounts }, (old: Account[] | undefined) =>
          old ? old.map((a) => (a.id === id ? { ...a, ...patch } : a)) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('accounts').update(patch).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_ACCOUNT', { id, ...patch })
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}

/** Persist a new ordering: write sort_order = index for each id in turn. */
export function useReorderAccounts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        orderedIds.forEach((id, i) => {
          enqueueOfflineMutation('UPDATE_ACCOUNT', { id, sort_order: i })
        })
        return
      }

      await Promise.all(
        orderedIds.map((id, i) =>
          supabase
            .from('accounts')
            .update({ sort_order: i })
            .eq('id', id)
            .then(({ error }) => {
              if (error) throw error
            }),
        ),
      )
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.accounts }),
  })
}

export function useArchiveAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_ACCOUNT', { id, is_archived: true })
        qc.setQueriesData({ queryKey: qk.accounts }, (old: Account[] | undefined) =>
          old ? old.map((a) => (a.id === id ? { ...a, is_archived: true } : a)) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('accounts').update({ is_archived: true }).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_ACCOUNT', { id, is_archived: true })
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}
