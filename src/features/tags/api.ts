import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { NewTag, Tag } from '@/types/db'
import { useActiveBook } from '@/features/books/useActiveBook'

export function useTags() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.tags, activeBookId],
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('name')
      if (error) throw error
      return data as Tag[]
    },
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewTag): Promise<Tag> => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('tags')
        .insert({ ...input, user_id: userId, book_id: activeBookId })
        .select()
        .single()
      if (error) throw error
      return data as Tag
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tags }),
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Tag> }) => {
      const { error } = await supabase.from('tags').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tags }),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    // transaction_tags rows reference tag_id with ON DELETE CASCADE, so deleting
    // a tag also drops it from every transaction it was on.
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tags })
      void qc.invalidateQueries({ queryKey: qk.transactionTags })
    },
  })
}

/** Map of transaction_id → tag ids, covering all of the user's tagged rows. */
export function useTransactionTags() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.transactionTags, activeBookId],
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from('transaction_tags')
        .select('transaction_id, tag_id')
        .eq('book_id', activeBookId!)
      if (error) throw error
      const map: Record<string, string[]> = {}
      for (const row of data as { transaction_id: string; tag_id: string }[]) {
        ;(map[row.transaction_id] ??= []).push(row.tag_id)
      }
      return map
    },
  })
}

/** Add one or more tags to many transactions at once (bulk action; dedupes). */
export function useBulkAddTags() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({ txIds, tagIds }: { txIds: string[]; tagIds: string[] }) => {
      if (txIds.length === 0 || tagIds.length === 0) return
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const rows = txIds.flatMap((transaction_id) =>
        tagIds.map((tag_id) => ({ transaction_id, tag_id, user_id: userId, book_id: activeBookId })),
      )
      const { error } = await supabase
        .from('transaction_tags')
        .upsert(rows, { onConflict: 'transaction_id,tag_id', ignoreDuplicates: true })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.transactionTags }),
  })
}

/** Replace the full set of tags on one transaction (used on create + edit). */
export function useSetTransactionTags() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({ transactionId, tagIds }: { transactionId: string; tagIds: string[] }) => {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not authenticated')
      const { error: delError } = await supabase
        .from('transaction_tags')
        .delete()
        .eq('transaction_id', transactionId)
      if (delError) throw delError
      if (tagIds.length > 0) {
        const { error: insError } = await supabase.from('transaction_tags').insert(
          tagIds.map((tag_id) => ({
            transaction_id: transactionId,
            tag_id,
            user_id: userId,
            book_id: activeBookId,
          })),
        )
        if (insError) throw insError
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.transactionTags }),
  })
}
