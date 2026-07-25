import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Category, CategoryKind, NewCategory } from '@/types/db'
import { useActiveBook } from '@/features/books/useActiveBook'
import { enqueueOfflineMutation } from '@/lib/offlineQueue'

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
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (kind: CategoryKind): Promise<string> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { data: existing, error: findErr } = await supabase
        .from('categories')
        .select('id')
        .eq('book_id', activeBookId!)
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
          book_id: activeBookId,
          name: ADJUSTMENT_CATEGORY_NAME,
          kind,
          parent_id: null,
          icon: 'scale',
          color: '#71717a',
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
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.categories, activeBookId],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('book_id', activeBookId!)
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
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewCategory): Promise<Category> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const payload = { ...input, user_id: userId, book_id: activeBookId }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = `temp-cat-${Date.now()}`
        const dummyCategory: Category = {
          id: tempId,
          user_id: userId,
          book_id: activeBookId || '',
          name: payload.name,
          kind: payload.kind,
          parent_id: payload.parent_id ?? null,
          icon: payload.icon ?? null,
          color: payload.color ?? null,
          sort_order: 999,
          is_archived: false,
          created_at: new Date().toISOString(),
        }
        enqueueOfflineMutation('CREATE_CATEGORY', { ...payload, tempId })
        qc.setQueriesData({ queryKey: qk.categories }, (old: Category[] | undefined) =>
          old ? [...old, dummyCategory] : [dummyCategory],
        )
        return dummyCategory
      }

      try {
        const { data, error } = await supabase
          .from('categories')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as Category
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_CATEGORY', payload)
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.categories }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Category> }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_CATEGORY', { id, ...patch })
        qc.setQueriesData({ queryKey: qk.categories }, (old: Category[] | undefined) =>
          old ? old.map((c) => (c.id === id ? { ...c, ...patch } : c)) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('categories').update(patch).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_CATEGORY', { id, ...patch })
        }
        throw err
      }
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
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('DELETE_CATEGORY', { id })
        qc.setQueriesData({ queryKey: qk.categories }, (old: Category[] | undefined) =>
          old ? old.filter((c) => c.id !== id) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('categories').delete().eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('DELETE_CATEGORY', { id })
        }
        throw err
      }
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
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_CATEGORY', { id, is_archived: archived })
        qc.setQueriesData({ queryKey: qk.categories }, (old: Category[] | undefined) =>
          old ? old.map((c) => (c.id === id ? { ...c, is_archived: archived } : c)) : [],
        )
        return
      }

      try {
        const { error } = await supabase
          .from('categories')
          .update({ is_archived: archived })
          .eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_CATEGORY', { id, is_archived: archived })
        }
        throw err
      }
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
