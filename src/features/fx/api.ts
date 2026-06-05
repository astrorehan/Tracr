import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { FxRate, NewFxRate } from '@/types/db'

export function useFxRates() {
  return useQuery({
    queryKey: qk.fxRates,
    queryFn: async (): Promise<FxRate[]> => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('*')
        .order('as_of', { ascending: false })
      if (error) throw error
      return data as FxRate[]
    },
  })
}

/** Insert or replace a manual rate for a (base, quote, as_of) on the given day. */
export function useUpsertFxRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewFxRate): Promise<FxRate> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('fx_rates')
        .upsert(
          { source: 'manual', ...input, user_id: userId },
          { onConflict: 'user_id,base,quote,as_of' },
        )
        .select()
        .single()
      if (error) throw error
      return data as FxRate
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.fxRates }),
  })
}

export function useDeleteFxRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fx_rates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.fxRates }),
  })
}
