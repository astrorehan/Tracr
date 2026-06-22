import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { NewTransactionTemplate, TransactionTemplate } from '@/types/db'
import { useActiveBook } from '@/features/books/useActiveBook'

/** Saved transaction shapes for one-tap repeat entries (newest first). */
export function useTransactionTemplates() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.transactionTemplates, activeBookId],
    queryFn: async (): Promise<TransactionTemplate[]> => {
      const { data, error } = await supabase
        .from('transaction_templates')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TransactionTemplate[]
    },
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewTransactionTemplate): Promise<TransactionTemplate> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('transaction_templates')
        .insert({ ...input, user_id: userId, book_id: activeBookId })
        .select()
        .single()
      if (error) throw error
      return data as TransactionTemplate
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.transactionTemplates }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transaction_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.transactionTemplates }),
  })
}
