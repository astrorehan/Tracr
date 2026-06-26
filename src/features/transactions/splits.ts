import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Transaction, TransactionSplit } from '@/types/db'
import { useActiveBook } from '@/features/books/useActiveBook'

/** A single category's share of a transaction. */
export interface CategoryContribution {
  categoryId: string | null
  amount: number
}

/**
 * How a transaction maps onto categories: its splits when present, otherwise a
 * single contribution for its own category and full amount. Central so reports
 * and budgets agree on how split transactions are counted.
 */
export function categoryContributions(
  tx: Transaction,
  splitsByTx: Record<string, TransactionSplit[]>,
): CategoryContribution[] {
  const splits = splitsByTx[tx.id]
  if (splits && splits.length > 0) {
    return splits.map((s) => ({ categoryId: s.category_id, amount: s.amount }))
  }
  return [{ categoryId: tx.category_id, amount: tx.amount }]
}

/** Map of transaction_id → its splits, covering all of the user's split rows. */
export function useTransactionSplits() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.transactionSplits, activeBookId],
    queryFn: async (): Promise<Record<string, TransactionSplit[]>> => {
      const { data, error } = await supabase
        .from('transaction_splits')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('created_at')
      if (error) throw error
      const map: Record<string, TransactionSplit[]> = {}
      for (const row of data as TransactionSplit[]) {
        ;(map[row.transaction_id] ??= []).push(row)
      }
      return map
    },
  })
}

export interface SplitInput {
  category_id: string | null
  amount: number
  note?: string | null
}

/** Replace the full set of splits on one transaction (used on create + edit). */
export function useSetTransactionSplits() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({
      transactionId,
      splits,
    }: {
      transactionId: string
      splits: SplitInput[]
    }) => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { error: delError } = await supabase
        .from('transaction_splits')
        .delete()
        .eq('transaction_id', transactionId)
      if (delError) throw delError
      if (splits.length > 0) {
        const { error: insError } = await supabase.from('transaction_splits').insert(
          splits.map((s) => ({
            transaction_id: transactionId,
            user_id: userId,
            book_id: activeBookId,
            category_id: s.category_id,
            amount: s.amount,
            note: s.note ?? null,
          })),
        )
        if (insError) throw insError
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.transactionSplits }),
  })
}
