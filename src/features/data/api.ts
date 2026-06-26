import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { evaluateRules } from '@/features/rules/engine'
import type { Rule, Transaction } from '@/types/db'
import type { ParsedTxRow } from './transactionsCsv'
import { useActiveBook } from '@/features/books/useActiveBook'

type InsertedRow = Pick<Transaction, 'id' | 'payee' | 'note' | 'amount' | 'currency' | 'type'>

/**
 * Bulk-insert imported rows, tagging them as source = 'import'. Active rules are
 * applied: an empty category is filled from a matching rule, and rule tags are
 * added (re-evaluated against the inserted rows so it's order-independent).
 * Transfers never receive a rule category or tags.
 */
export function useImportTransactions() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (rows: ParsedTxRow[]): Promise<number> => {
      if (rows.length === 0) return 0
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { data: ruleData, error: ruleErr } = await supabase
        .from('rules')
        .select('*')
        .eq('book_id', activeBookId!)
        .eq('is_active', true)
      if (ruleErr) throw ruleErr
      const rules = (ruleData ?? []) as Rule[]

      const payload = rows.map((r) => {
        let category_id = r.category_id
        if (r.type !== 'transfer' && !category_id && rules.length) {
          category_id = evaluateRules(rules, {
            payee: r.payee,
            note: r.note,
            amount: r.amount,
            currency: r.currency,
            type: r.type,
          }).categoryId
        }
        return { ...r, category_id, user_id: userId, book_id: activeBookId, source: 'import' as const }
      })

      const { data: inserted, error } = await supabase
        .from('transactions')
        .insert(payload)
        .select('id, payee, note, amount, currency, type')
      if (error) throw error
      const insertedRows = (inserted ?? []) as InsertedRow[]

      if (rules.length) {
        const tagRows = insertedRows.flatMap((tx) => {
          if (tx.type === 'transfer') return []
          return evaluateRules(rules, {
            payee: tx.payee,
            note: tx.note,
            amount: tx.amount,
            currency: tx.currency,
            type: tx.type,
          }).tagIds.map((tag_id) => ({
            transaction_id: tx.id,
            tag_id,
            user_id: userId,
            book_id: activeBookId,
          }))
        })
        if (tagRows.length) {
          const { error: tagErr } = await supabase
            .from('transaction_tags')
            .upsert(tagRows, { onConflict: 'transaction_id,tag_id', ignoreDuplicates: true })
          if (tagErr) throw tagErr
        }
      }

      return insertedRows.length
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: qk.balances })
      void qc.invalidateQueries({ queryKey: qk.payees })
      void qc.invalidateQueries({ queryKey: qk.transactionTags })
    },
  })
}
