import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useActiveBook } from '@/features/books/useActiveBook'
import type { NewProduct, Product } from '@/types/db'

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}

/** Active (non-archived) products for the current book, in display order. */
export function useProducts(includeArchived = false) {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.products, activeBookId, { includeArchived }],
    queryFn: async (): Promise<Product[]> => {
      let query = supabase
        .from('products')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('sort_order')
        .order('name')
      if (!includeArchived) query = query.eq('is_archived', false)
      const { data, error } = await query
      if (error) throw error
      return data as Product[]
    },
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewProduct): Promise<Product> => {
      const userId = await currentUserId()
      const { data, error } = await supabase
        .from('products')
        .insert({ ...input, user_id: userId, book_id: activeBookId })
        .select()
        .single()
      if (error) throw error
      return data as Product
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.products }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Product> }) => {
      const { error } = await supabase.from('products').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.products }),
  })
}

/** Soft-hide a product without deleting it — past sales keep their snapshots. */
export function useArchiveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').update({ is_archived: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.products }),
  })
}
