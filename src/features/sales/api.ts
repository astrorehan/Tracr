import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { computeFxSnapshot } from '@/features/fx/snapshot'
import { useActiveBook } from '@/features/books/useActiveBook'
import type { Product, Transaction } from '@/types/db'

/** Category a sale's income transaction is filed under, so it shows cleanly in
 *  reports. Find-or-created once per book. */
export const SALES_CATEGORY_NAME = 'Penjualan'

/** One product picked into the cart, with the quantity being sold. */
export interface SaleLine {
  product: Product
  qty: number
}

export interface CreateSaleInput {
  /** Kas / account that receives the money. */
  accountId: string
  /** Currency the products are priced in (the book's base currency). */
  currency: string
  lines: SaleLine[]
  /** ISO timestamp; defaults to now. */
  occurredAt?: string
  /** Customer name, stored as the transaction payee. */
  customer?: string | null
  note?: string | null
}

/** Total of a cart in minor units — the single source of truth for the sale
 *  amount. Each line is rounded on its own so the sum matches Σ(line subtotals). */
export function saleTotal(lines: SaleLine[]): number {
  return lines.reduce((sum, { product, qty }) => sum + Math.round(qty * product.price), 0)
}

/**
 * Record an item-based sale: one income transaction plus its line items, each
 * snapshotting the product's price and cost at sale time (so re-pricing a
 * product never rewrites past profit — see the Laba-Rugi report).
 *
 * Supabase has no client-side transaction, so this inserts the txn first, then
 * the items; if the items insert fails, the just-created txn is deleted
 * (compensating rollback) so no orphan income is ever left behind.
 */
export function useCreateSale() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({
      accountId,
      currency,
      lines,
      occurredAt,
      customer,
      note,
    }: CreateSaleInput): Promise<Transaction> => {
      if (lines.length === 0) throw new Error('Add at least one item to the sale.')
      const total = saleTotal(lines)
      if (total <= 0) throw new Error('The sale total must be greater than zero.')

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const categoryId = await ensureSalesCategory(userId, activeBookId!)

      // Freeze the base-currency value the same way manual transactions do.
      const snap = await computeFxSnapshot(total, currency)

      const { data: txnData, error: txnErr } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          book_id: activeBookId,
          account_id: accountId,
          category_id: categoryId,
          counter_account_id: null,
          type: 'income' as const,
          amount: total,
          currency,
          occurred_at: occurredAt ?? new Date().toISOString(),
          payee: customer?.trim() || null,
          note: note?.trim() || null,
          source: 'web' as const,
          ...snap,
        })
        .select()
        .single()
      if (txnErr) throw txnErr
      const txn = txnData as Transaction

      const items = lines.map(({ product, qty }) => ({
        user_id: userId,
        book_id: activeBookId,
        transaction_id: txn.id,
        product_id: product.id,
        name: product.name,
        qty,
        unit_price: product.price,
        unit_cost: product.cost,
      }))

      const { error: itemsErr } = await supabase.from('transaction_items').insert(items)
      if (itemsErr) {
        // Compensating rollback: undo the income so no orphan txn survives.
        await supabase.from('transactions').delete().eq('id', txn.id)
        throw itemsErr
      }

      return txn
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: qk.balances })
      void qc.invalidateQueries({ queryKey: qk.transactionItems })
      void qc.invalidateQueries({ queryKey: qk.categories })
      void qc.invalidateQueries({ queryKey: qk.payees })
    },
  })
}

/**
 * Find the book's "Penjualan" income category, creating it on first sale. Mirrors
 * the reconciliation flow's `useEnsureAdjustmentCategory` find-or-create.
 */
async function ensureSalesCategory(userId: string, bookId: string): Promise<string> {
  const { data: existing, error: findErr } = await supabase
    .from('categories')
    .select('id')
    .eq('book_id', bookId)
    .eq('name', SALES_CATEGORY_NAME)
    .eq('kind', 'income')
    .limit(1)
    .maybeSingle()
  if (findErr) throw findErr
  if (existing) return (existing as { id: string }).id

  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: userId,
      book_id: bookId,
      name: SALES_CATEGORY_NAME,
      kind: 'income',
      parent_id: null,
      icon: 'shopping-bag',
      color: '#16a34a',
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}
