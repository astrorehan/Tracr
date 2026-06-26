import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Account, AccountBalance, NewAccount } from '@/types/db'
import { useActiveBook } from '@/features/books/useActiveBook'

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
      const { data, error } = await supabase
        .from('accounts')
        .insert({ ...input, user_id: userId, book_id: activeBookId })
        .select()
        .single()
      if (error) throw error
      return data as Account
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
      const { error } = await supabase.from('accounts').update(patch).eq('id', id)
      if (error) throw error
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
      const { error } = await supabase.from('accounts').update({ is_archived: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}
