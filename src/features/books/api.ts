import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Book, NewBook } from '@/types/db'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}

export function useCreateBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewBook): Promise<Book> => {
      const ownerId = await currentUserId()
      const { data, error } = await supabase
        .from('books')
        .insert({ ...input, owner_id: ownerId })
        .select()
        .single()
      if (error) throw error
      return data as Book
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.books }),
  })
}

export function useUpdateBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Book> }) => {
      const { error } = await supabase.from('books').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.books }),
  })
}

/** Permanent delete — FK cascade removes every row scoped to this book. */
export function useDeleteBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('books').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries(),
  })
}

/**
 * Duplicate a book's *structure* into a fresh book: accounts, categories, tags,
 * rules, budgets, savings goals, recurring transactions and templates — but no
 * transactions or balances. Foreign keys between copied rows (category parents,
 * budget categories, goal/recurring accounts, rule actions) are remapped to the
 * new ids so the copy is self-consistent.
 */
export function useDuplicateBookStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sourceId, name }: { sourceId: string; name: string }): Promise<Book> => {
      const ownerId = await currentUserId()

      const { data: book, error: bookErr } = await supabase
        .from('books')
        .insert({ owner_id: ownerId, name })
        .select()
        .single()
      if (bookErr) throw bookErr
      const newBookId = (book as Book).id

      // Maps old row id -> new row id, so dependent rows can be re-pointed.
      const accountMap = new Map<string, string>()
      const categoryMap = new Map<string, string>()
      const tagMap = new Map<string, string>()

      const strip = <T extends { id: string; created_at?: string }>(row: T) => {
        const { id: _id, created_at: _c, ...rest } = row as Record<string, unknown> & { id: string }
        void _id
        void _c
        return rest
      }

      // ── Accounts ──
      const { data: accounts } = await supabase.from('accounts').select('*').eq('book_id', sourceId)
      for (const a of accounts ?? []) {
        const { data: ins, error } = await supabase
          .from('accounts')
          .insert({ ...strip(a), book_id: newBookId })
          .select('id')
          .single()
        if (error) throw error
        accountMap.set(a.id, ins!.id)
      }

      // ── Categories (two passes so parent_id can be remapped) ──
      const { data: categories } = await supabase
        .from('categories')
        .select('*')
        .eq('book_id', sourceId)
      for (const c of categories ?? []) {
        const { data: ins, error } = await supabase
          .from('categories')
          .insert({ ...strip(c), parent_id: null, book_id: newBookId })
          .select('id')
          .single()
        if (error) throw error
        categoryMap.set(c.id, ins!.id)
      }
      for (const c of categories ?? []) {
        if (!c.parent_id) continue
        await supabase
          .from('categories')
          .update({ parent_id: categoryMap.get(c.parent_id) ?? null })
          .eq('id', categoryMap.get(c.id)!)
      }

      // ── Tags ──
      const { data: tags } = await supabase.from('tags').select('*').eq('book_id', sourceId)
      for (const t of tags ?? []) {
        const { data: ins, error } = await supabase
          .from('tags')
          .insert({ ...strip(t), book_id: newBookId })
          .select('id')
          .single()
        if (error) throw error
        tagMap.set(t.id, ins!.id)
      }

      // ── Budgets (remap category_id) ──
      const { data: budgets } = await supabase.from('budgets').select('*').eq('book_id', sourceId)
      for (const b of budgets ?? []) {
        await supabase.from('budgets').insert({
          ...strip(b),
          book_id: newBookId,
          category_id: b.category_id ? (categoryMap.get(b.category_id) ?? null) : null,
        })
      }

      // ── Savings goals (remap account_id) ──
      const { data: goals } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('book_id', sourceId)
      for (const g of goals ?? []) {
        await supabase.from('savings_goals').insert({
          ...strip(g),
          book_id: newBookId,
          account_id: g.account_id ? (accountMap.get(g.account_id) ?? null) : null,
        })
      }

      // ── Recurring transactions (remap account_id + category_id) ──
      const { data: recurring } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('book_id', sourceId)
      for (const r of recurring ?? []) {
        await supabase.from('recurring_transactions').insert({
          ...strip(r),
          book_id: newBookId,
          account_id: r.account_id ? (accountMap.get(r.account_id) ?? r.account_id) : r.account_id,
          category_id: r.category_id ? (categoryMap.get(r.category_id) ?? null) : null,
        })
      }

      // ── Transaction templates (remap account_id + category_id) ──
      const { data: templates } = await supabase
        .from('transaction_templates')
        .select('*')
        .eq('book_id', sourceId)
      for (const t of templates ?? []) {
        await supabase.from('transaction_templates').insert({
          ...strip(t),
          book_id: newBookId,
          account_id: t.account_id ? (accountMap.get(t.account_id) ?? null) : null,
          category_id: t.category_id ? (categoryMap.get(t.category_id) ?? null) : null,
        })
      }

      // ── Rules (remap category_id + tag_ids inside the JSON actions) ──
      const { data: rules } = await supabase.from('rules').select('*').eq('book_id', sourceId)
      for (const r of rules ?? []) {
        const actions = { ...(r.actions ?? {}) }
        if (actions.category_id) actions.category_id = categoryMap.get(actions.category_id) ?? null
        if (Array.isArray(actions.tag_ids)) {
          actions.tag_ids = actions.tag_ids
            .map((id: string) => tagMap.get(id))
            .filter((id: string | undefined): id is string => !!id)
        }
        await supabase.from('rules').insert({ ...strip(r), book_id: newBookId, actions })
      }

      return book as Book
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.books }),
  })
}
