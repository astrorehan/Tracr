import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Account, AccountBalance, NewAccount } from '@/types/db'

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: [...qk.accounts, { includeArchived }],
    queryFn: async (): Promise<Account[]> => {
      let query = supabase.from('accounts').select('*').order('created_at')
      if (!includeArchived) query = query.eq('is_archived', false)
      const { data, error } = await query
      if (error) throw error
      return data as Account[]
    },
  })
}

export function useBalances() {
  return useQuery({
    queryKey: qk.balances,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from('account_balances').select('*')
      if (error) throw error
      const map: Record<string, number> = {}
      for (const row of data as AccountBalance[]) map[row.account_id] = row.balance
      return map
    },
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewAccount): Promise<Account> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('accounts')
        .insert({ ...input, user_id: userId })
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
