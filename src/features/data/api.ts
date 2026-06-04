import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { ParsedTxRow } from './transactionsCsv'

/** Bulk-insert imported rows, tagging them as source = 'import'. */
export function useImportTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: ParsedTxRow[]): Promise<number> => {
      if (rows.length === 0) return 0
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const payload = rows.map((r) => ({ ...r, user_id: userId, source: 'import' as const }))
      const { error, count } = await supabase
        .from('transactions')
        .insert(payload, { count: 'exact' })
      if (error) throw error
      return count ?? rows.length
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}
