import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { NewRule, Rule, Transaction } from '@/types/db'
import { evaluateRules } from './engine'
import { useActiveBook } from '@/features/books/useActiveBook'

import { enqueueOfflineMutation } from '@/lib/offlineQueue'

async function getUserId(): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user?.id) return sessionData.session.user.id
    const { data: userData } = await supabase.auth.getUser()
    return userData.user?.id ?? null
  } catch {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData.session?.user?.id ?? null
  }
}

export function useRules() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.rules, activeBookId],
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase
        .from('rules')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data as Rule[]
    },
  })
}

export function useCreateRule() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewRule): Promise<Rule> => {
      const userId = await getUserId()
      if (!userId) throw new Error('Not authenticated')
      const payload = { ...input, user_id: userId, book_id: activeBookId }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = `temp-rule-${Date.now()}`
        const dummyRule: Rule = {
          id: tempId,
          user_id: userId,
          book_id: activeBookId || '',
          name: payload.name,
          is_active: payload.is_active ?? true,
          match_type: payload.match_type ?? 'all',
          conditions: payload.conditions ?? [],
          actions: payload.actions ?? {},
          stop_after: payload.stop_after ?? true,
          sort_order: 999,
          created_at: new Date().toISOString(),
        }
        enqueueOfflineMutation('CREATE_RULE', { ...payload, tempId })
        qc.setQueriesData({ queryKey: [...qk.rules, activeBookId] }, (old: Rule[] | undefined) =>
          old ? [...old, dummyRule] : [dummyRule],
        )
        return dummyRule
      }

      try {
        const { data, error } = await supabase
          .from('rules')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as Rule
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_RULE', payload)
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.rules }),
  })
}

export function useUpdateRule() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Rule> }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_RULE', { id, ...patch })
        qc.setQueriesData({ queryKey: [...qk.rules, activeBookId] }, (old: Rule[] | undefined) =>
          old ? old.map((r) => (r.id === id ? { ...r, ...patch } : r)) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('rules').update(patch).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_RULE', { id, ...patch })
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.rules }),
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (id: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('DELETE_RULE', { id })
        qc.setQueriesData({ queryKey: [...qk.rules, activeBookId] }, (old: Rule[] | undefined) =>
          old ? old.filter((r) => r.id !== id) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('rules').delete().eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('DELETE_RULE', { id })
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.rules }),
  })
}

/** Persist a new ordering: write sort_order = index for each id. */
export function useReorderRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase
            .from('rules')
            .update({ sort_order: i })
            .eq('id', id)
            .then(({ error }) => {
              if (error) throw error
            }),
        ),
      )
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.rules }),
  })
}

export interface ApplyResult {
  scanned: number
  categorized: number
  tagged: number
}

/**
 * Run all active rules against existing uncategorized income/expense rows and
 * apply category + tags. Only fills an empty category (never overwrites), and
 * adds tags idempotently. Returns how much changed.
 */
export function useApplyRulesToUncategorized() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (rules: Rule[]): Promise<ApplyResult> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('book_id', activeBookId!)
        .is('category_id', null)
        .in('type', ['income', 'expense'])
        .limit(2000)
      if (error) throw error
      const txns = (data ?? []) as Transaction[]

      let categorized = 0
      let tagged = 0
      const tagRows: { transaction_id: string; tag_id: string; user_id: string; book_id: string }[] =
        []

      for (const tx of txns) {
        const out = evaluateRules(rules, {
          payee: tx.payee,
          note: tx.note,
          amount: tx.amount,
          currency: tx.currency,
          type: tx.type,
        })
        if (out.categoryId) {
          const { error: upErr } = await supabase
            .from('transactions')
            .update({ category_id: out.categoryId })
            .eq('id', tx.id)
          if (upErr) throw upErr
          categorized++
        }
        if (out.tagIds.length) {
          tagged++
          for (const tag_id of out.tagIds)
            tagRows.push({ transaction_id: tx.id, tag_id, user_id: userId, book_id: activeBookId! })
        }
      }

      if (tagRows.length) {
        const { error: tagErr } = await supabase
          .from('transaction_tags')
          .upsert(tagRows, { onConflict: 'transaction_id,tag_id', ignoreDuplicates: true })
        if (tagErr) throw tagErr
      }

      return { scanned: txns.length, categorized, tagged }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: qk.transactionTags })
    },
  })
}
