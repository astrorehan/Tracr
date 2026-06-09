import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Category, CategoryKind, NewCategory } from '@/types/db'

/**
 * Name of the auto-managed category that holds balance adjustments created by
 * account reconciliation. Kept as a constant so the reconcile flow can find-or-
 * create it (one per kind) and so reports can recognise these corrections.
 */
export const ADJUSTMENT_CATEGORY_NAME = 'Balance Adjustment'

/**
 * Find the "Balance Adjustment" category for a given direction, creating it on
 * first use. Adjustments are income (balance was higher than recorded) or
 * expense (lower), so there is one category per kind. Lets reconciliation file
 * corrections under a clear category instead of leaving them uncategorized.
 */
export function useEnsureAdjustmentCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (kind: CategoryKind): Promise<string> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { data: existing, error: findErr } = await supabase
        .from('categories')
        .select('id')
        .eq('name', ADJUSTMENT_CATEGORY_NAME)
        .eq('kind', kind)
        .limit(1)
        .maybeSingle()
      if (findErr) throw findErr
      if (existing) return (existing as { id: string }).id

      const { data, error } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: ADJUSTMENT_CATEGORY_NAME,
          kind,
          parent_id: null,
          icon: 'scale',
          color: '#8a7c66',
        })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.categories }),
  })
}

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('kind')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data as Category[]
    },
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewCategory): Promise<Category> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('categories')
        .insert({ ...input, user_id: userId })
        .select()
        .single()
      if (error) throw error
      return data as Category
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.categories }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Category> }) => {
      const { error } = await supabase.from('categories').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.categories }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    // Transactions reference category_id with ON DELETE SET NULL, so deleting a
    // category keeps its transactions — they just become uncategorized.
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories })
      void qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

/** Archive / unarchive: hide from pickers without losing history. */
export function useSetCategoryArchived() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('categories')
        .update({ is_archived: archived })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.categories }),
  })
}

/**
 * Merge `source` into `target`: move every reference (transactions, splits,
 * recurring) onto the target, re-parent the source's children, then delete the
 * source. Budgets on the source cascade away (collapsing duplicate categories).
 * Same-kind only — enforced by the caller's target list.
 */
export function useMergeCategories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ source, target }: { source: Category; target: Category }) => {
      if (source.id === target.id) throw new Error('Pick a different target category.')
      // Keep one-level nesting: the source's children join the target's group.
      const childParent = target.parent_id ?? target.id

      for (const table of ['transactions', 'transaction_splits', 'recurring_transactions'] as const) {
        const { error } = await supabase
          .from(table)
          .update({ category_id: target.id })
          .eq('category_id', source.id)
        if (error) throw error
      }

      const { error: childErr } = await supabase
        .from('categories')
        .update({ parent_id: childParent })
        .eq('parent_id', source.id)
      if (childErr) throw childErr

      const { error: delErr } = await supabase.from('categories').delete().eq('id', source.id)
      if (delErr) throw delErr
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories })
      void qc.invalidateQueries({ queryKey: ['transactions'] })
      void qc.invalidateQueries({ queryKey: qk.transactionSplits })
      void qc.invalidateQueries({ queryKey: qk.recurring })
      void qc.invalidateQueries({ queryKey: qk.budgets })
    },
  })
}

/** Persist a new sibling ordering: write sort_order = index for each id in turn. */
export function useReorderCategories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, i) =>
          supabase
            .from('categories')
            .update({ sort_order: i })
            .eq('id', id)
            .then(({ error }) => {
              if (error) throw error
            }),
        ),
      )
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.categories }),
  })
}
