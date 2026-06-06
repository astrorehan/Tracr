import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { NewRule, Rule, Transaction } from '@/types/db'
import { evaluateRules } from './engine'

export function useRules() {
  return useQuery({
    queryKey: qk.rules,
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase
        .from('rules')
        .select('*')
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data as Rule[]
    },
  })
}

export function useCreateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewRule): Promise<Rule> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('rules')
        .insert({ ...input, user_id: userId })
        .select()
        .single()
      if (error) throw error
      return data as Rule
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.rules }),
  })
}

export function useUpdateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Rule> }) => {
      const { error } = await supabase.from('rules').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.rules }),
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rules').delete().eq('id', id)
      if (error) throw error
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
  return useMutation({
    mutationFn: async (rules: Rule[]): Promise<ApplyResult> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .is('category_id', null)
        .in('type', ['income', 'expense'])
        .limit(2000)
      if (error) throw error
      const txns = (data ?? []) as Transaction[]

      let categorized = 0
      let tagged = 0
      const tagRows: { transaction_id: string; tag_id: string; user_id: string }[] = []

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
            tagRows.push({ transaction_id: tx.id, tag_id, user_id: userId })
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
