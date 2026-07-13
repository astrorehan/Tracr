import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { evaluateRules } from '@/features/rules/engine'
import type { Rule, Transaction } from '@/types/db'
import type { ParsedTxRow } from './transactionsCsv'
import { useActiveBook } from '@/features/books/useActiveBook'

type InsertedRow = Pick<Transaction, 'id' | 'payee' | 'note' | 'amount' | 'currency' | 'type'>
type ExistingRow = Pick<Transaction, 'account_id' | 'occurred_at' | 'amount' | 'type' | 'payee' | 'external_ref'>

const normalise = (value: string | null | undefined) => (value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
const rowFingerprint = (row: Pick<ParsedTxRow, 'account_id' | 'occurred_at' | 'amount' | 'type' | 'payee'>) =>
  [row.account_id, row.occurred_at.slice(0, 10), row.amount, row.type, normalise(row.payee)].join('\u0000')
const referenceKey = (accountId: string, reference: string) => `${accountId}\u0000${normalise(reference)}`

/**
 * Statement scans may include overlapping image tiles or be uploaded twice.
 * A provider reference is the preferred duplicate key; when it is absent we
 * only fall back to an exact account/date/amount/type/payee match already in
 * the ledger. Regular CSV imports retain their existing all-rows behavior.
 */
async function removeScannedDuplicates(rows: ParsedTxRow[], bookId: string): Promise<ParsedTxRow[]> {
  const scanned = rows.filter((row) => row.dedupe)
  if (scanned.length === 0) return rows

  const dates = scanned.map((row) => row.occurred_at.slice(0, 10)).sort()
  const accountIds = [...new Set(scanned.map((row) => row.account_id))]
  const { data, error } = await supabase
    .from('transactions')
    .select('account_id, occurred_at, amount, type, payee, external_ref')
    .eq('book_id', bookId)
    .in('account_id', accountIds)
    .gte('occurred_at', `${dates[0]}T00:00:00.000Z`)
    .lte('occurred_at', `${dates[dates.length - 1]}T23:59:59.999Z`)
  if (error) throw error

  const existing = (data ?? []) as ExistingRow[]
  const existingReferences = new Set(
    existing.flatMap((row) => row.external_ref ? [referenceKey(row.account_id, row.external_ref)] : []),
  )
  const existingFingerprints = new Set(existing.map(rowFingerprint))
  const batchReferences = new Set<string>()

  return rows.filter((row) => {
    if (!row.dedupe) return true
    const ref = row.external_ref?.trim()
    if (ref) {
      const key = referenceKey(row.account_id, ref)
      if (existingReferences.has(key) || batchReferences.has(key)) return false
      batchReferences.add(key)
      return true
    }
    return !existingFingerprints.has(rowFingerprint(row))
  })
}

/**
 * Bulk-insert imported rows, tagging them as source = 'import'. Active rules are
 * applied: an empty category is filled from a matching rule, and rule tags are
 * added (re-evaluated against the inserted rows so it's order-independent).
 * Statement scans are deduplicated before their one user-confirmed bulk insert.
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

      const uniqueRows = await removeScannedDuplicates(rows, activeBookId!)
      if (uniqueRows.length === 0) return 0

      const { data: ruleData, error: ruleErr } = await supabase
        .from('rules')
        .select('*')
        .eq('book_id', activeBookId!)
        .eq('is_active', true)
      if (ruleErr) throw ruleErr
      const rules = (ruleData ?? []) as Rule[]

      const payload = uniqueRows.map((row) => {
        // `dedupe` is a client-only flag; it has no column, so drop it.
        const r = { ...row }
        delete r.dedupe
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