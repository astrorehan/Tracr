import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useActiveBook } from '@/features/books/useActiveBook'
import type { NewProduct, Product } from '@/types/db'

import { enqueueOfflineMutation } from '@/lib/offlineQueue'
import { getAuthenticatedUserId } from '@/lib/authHelpers'

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
      const userId = await getAuthenticatedUserId()
      const payload = { ...input, user_id: userId, book_id: activeBookId }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = `temp-prod-${Date.now()}`
        const dummyProduct: Product = {
          id: tempId,
          user_id: userId,
          book_id: activeBookId || '',
          name: payload.name,
          price: payload.price,
          cost: payload.cost,
          unit: payload.unit ?? null,
          is_archived: false,
          sort_order: 999,
          created_at: new Date().toISOString(),
        }
        enqueueOfflineMutation('CREATE_PRODUCT', { ...payload, tempId })
        qc.setQueriesData({ queryKey: [...qk.products, activeBookId, { includeArchived: false }] }, (old: Product[] | undefined) =>
          old ? [...old, dummyProduct] : [dummyProduct],
        )
        return dummyProduct
      }

      try {
        const { data, error } = await supabase
          .from('products')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as Product
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_PRODUCT', payload)
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.products }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Product> }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_PRODUCT', { id, ...patch })
        return
      }

      try {
        const { error } = await supabase.from('products').update(patch).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_PRODUCT', { id, ...patch })
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.products }),
  })
}

/** Soft-hide a product without deleting it — past sales keep their snapshots. */
export function useArchiveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_PRODUCT', { id, is_archived: true })
        return
      }

      try {
        const { error } = await supabase.from('products').update({ is_archived: true }).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_PRODUCT', { id, is_archived: true })
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.products }),
  })
}
