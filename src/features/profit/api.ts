import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useActiveBook } from '@/features/books/useActiveBook'
import type { ProfitExpense, ProfitLine } from './compute'

interface ItemRow {
  product_id: string | null
  name: string
  qty: number | string
  unit_price: number
  unit_cost: number
}

interface ExpenseRow {
  amount: number
  base_amount: number | null
}

/**
 * Fetch the raw inputs for the Laba-Rugi report over [from, to): the sale line
 * items (for Penjualan + COGS) and the operating-expense transactions (for
 * Biaya). Line items are period-filtered through their parent transaction's
 * `occurred_at` via an inner join. Kept separate from {@link computeProfit} so
 * the math stays pure and unit-tested.
 */
export function useProfitData(from: string, to: string) {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.transactionItems, 'profit', activeBookId, from, to],
    queryFn: async (): Promise<{ lines: ProfitLine[]; expenses: ProfitExpense[] }> => {
      const [itemsRes, expRes] = await Promise.all([
        supabase
          .from('transaction_items')
          .select('product_id, name, qty, unit_price, unit_cost, transactions!inner(occurred_at)')
          .eq('book_id', activeBookId!)
          .gte('transactions.occurred_at', from)
          .lt('transactions.occurred_at', to),
        supabase
          .from('transactions')
          .select('amount, base_amount')
          .eq('book_id', activeBookId!)
          .eq('type', 'expense')
          .gte('occurred_at', from)
          .lt('occurred_at', to),
      ])
      if (itemsRes.error) throw itemsRes.error
      if (expRes.error) throw expRes.error

      const lines: ProfitLine[] = ((itemsRes.data ?? []) as unknown as ItemRow[]).map((r) => ({
        product_id: r.product_id,
        name: r.name,
        qty: Number(r.qty),
        unit_price: r.unit_price,
        unit_cost: r.unit_cost,
      }))
      // Value operating costs in base currency so they line up with item prices
      // (which are entered in base currency); fall back to native when unvalued.
      const expenses: ProfitExpense[] = ((expRes.data ?? []) as unknown as ExpenseRow[]).map((r) => ({
        amount: r.base_amount ?? r.amount,
      }))

      return { lines, expenses }
    },
  })
}
