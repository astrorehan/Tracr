import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useActiveBook } from '@/features/books/useActiveBook'
import type { Contact, Debt, NewContact, NewDebt, NewDebtPayment } from '@/types/db'

import { enqueueOfflineMutation } from '@/lib/offlineQueue'
import { getAuthenticatedUserId } from '@/lib/authHelpers'

/** A debt row with its contact joined (null if the contact was deleted). */
export type DebtWithContact = Debt & {
  contact: Pick<Contact, 'id' | 'name' | 'phone' | 'kind'> | null
}

/** People in the current book, A-Z. Archived contacts are hidden by default so
 *  pickers stay short; the contacts page asks for them explicitly. */
export function useContacts(includeArchived = false) {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.contacts, activeBookId, { includeArchived }],
    enabled: Boolean(activeBookId),
    queryFn: async (): Promise<Contact[]> => {
      let query = supabase.from('contacts').select('*').eq('book_id', activeBookId!)
      if (!includeArchived) query = query.eq('is_archived', false)
      const { data, error } = await query.order('name')
      if (error) throw error
      return data as Contact[]
    },
  })
}

/**
 * Add someone to the book. A person typed twice with the same name is the same
 * person, so an existing match (case-insensitive, same book) is reused instead
 * of inserting a duplicate — that is what kept the old inline-only flow messy.
 * A reused contact is un-archived and gains any phone/note the caller supplied.
 */
export function useCreateContact() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewContact): Promise<Contact> => {
      const userId = await getAuthenticatedUserId()
      const name = input.name.trim()

      const { data: existing } = await supabase
        .from('contacts')
        .select('*')
        .eq('book_id', activeBookId!)
        .ilike('name', name)
        .limit(1)
        .maybeSingle()

      if (existing) {
        const prev = existing as Contact
        // Someone recorded as a customer who now supplies us (or vice versa) is
        // both, not a second person.
        const kind: Contact['kind'] =
          input.kind && input.kind !== prev.kind ? 'both' : prev.kind
        const patch = {
          kind,
          phone: prev.phone ?? input.phone ?? null,
          note: prev.note ?? input.note ?? null,
          is_archived: false,
        }
        const { data, error } = await supabase
          .from('contacts')
          .update(patch)
          .eq('id', prev.id)
          .select()
          .single()
        if (error) throw error
        return data as Contact
      }

      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...input, name, user_id: userId, book_id: activeBookId })
        .select()
        .single()
      if (error) throw error
      return data as Contact
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.contacts }),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Contact> }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_CONTACT', { id, ...patch })
        return
      }

      try {
        const { error } = await supabase.from('contacts').update(patch).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_CONTACT', { id, ...patch })
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.contacts })
      void qc.invalidateQueries({ queryKey: qk.debts })
    },
  })
}

/** Hide someone who stopped coming. Their debt records keep the name attached. */
export function useArchiveContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_CONTACT', { id, is_archived: archived })
        return
      }

      try {
        const { error } = await supabase
          .from('contacts')
          .update({ is_archived: archived })
          .eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_CONTACT', { id, is_archived: archived })
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.contacts }),
  })
}

/** Permanent delete. Only offered for a person with no debt records — debts
 *  point at contacts with ON DELETE SET NULL, so deleting someone who has
 *  history would leave those records nameless. */
export function useDeleteContact() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (id: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('DELETE_CONTACT', { id })
        qc.setQueriesData({ queryKey: [...qk.contacts, activeBookId] }, (old: Contact[] | undefined) =>
          old ? old.filter((c) => c.id !== id) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('contacts').delete().eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('DELETE_CONTACT', { id })
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.contacts })
      void qc.invalidateQueries({ queryKey: qk.debts })
    },
  })
}

export { tallyByContact, type ContactTally } from './tally'

export function useDebts() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.debts, activeBookId],
    enabled: Boolean(activeBookId),
    queryFn: async (): Promise<DebtWithContact[]> => {
      const { data, error } = await supabase
        .from('debts')
        .select('*, contact:contacts(id, name, phone, kind)')
        .eq('book_id', activeBookId!)
        .order('status')
        .order('due_date', { nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as DebtWithContact[]
    },
  })
}

export function useCreateDebt() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewDebt): Promise<Debt> => {
      const userId = await getAuthenticatedUserId()
      const payload = { ...input, user_id: userId, book_id: activeBookId }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = `temp-debt-${Date.now()}`
        const dummyDebt: Debt = {
          id: tempId,
          user_id: userId,
          book_id: activeBookId || '',
          contact_id: payload.contact_id ?? null,
          direction: payload.direction,
          amount: payload.amount,
          paid: payload.paid ?? 0,
          currency: payload.currency,
          due_date: payload.due_date ?? null,
          status: 'open',
          note: payload.note ?? null,
          created_at: new Date().toISOString(),
        }
        enqueueOfflineMutation('CREATE_DEBT', { ...payload, tempId })
        qc.setQueriesData({ queryKey: [...qk.debts, activeBookId] }, (old: DebtWithContact[] | undefined) =>
          old ? [dummyDebt as unknown as DebtWithContact, ...old] : [dummyDebt as unknown as DebtWithContact],
        )
        return dummyDebt
      }

      try {
        const { data, error } = await supabase
          .from('debts')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        return data as Debt
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_DEBT', payload)
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.debts }),
  })
}

/**
 * Record a payment against a debt: append a debt_payments row, then advance the
 * debt's `paid` running total and flip it to 'paid' once fully settled.
 */
export function useRecordPayment() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({
      debt,
      amount,
      paid_on,
      note,
      account_id,
      category_id,
    }: {
      debt: DebtWithContact | Debt
      amount: number
      paid_on?: string
      note?: string | null
      account_id?: string | null
      category_id?: string | null
    }) => {
      const userId = await getAuthenticatedUserId()
      const payment: NewDebtPayment = {
        debt_id: debt.id,
        amount,
        paid_on: paid_on ?? new Date().toISOString().slice(0, 10),
        note: note ?? null,
      }
      const newPaid = Math.min(debt.amount, debt.paid + amount)
      const newStatus = newPaid >= debt.amount ? 'paid' : 'open'

      if (account_id) {
        const txType = debt.direction === 'receivable' ? 'income' : 'expense'
        const contactName = 'contact' in debt && debt.contact?.name ? debt.contact.name : ''
        const defaultNote = debt.direction === 'receivable'
          ? (contactName ? `Pelunasan piutang: ${contactName}` : 'Pelunasan piutang')
          : (contactName ? `Pelunasan utang: ${contactName}` : 'Pelunasan utang')

        let resolvedCategoryId = category_id || null
        if (!resolvedCategoryId) {
          try {
            const kind = debt.direction === 'receivable' ? 'income' : 'expense'
            const categoryName = debt.direction === 'receivable' ? 'Pelunasan Piutang' : 'Pelunasan Utang'
            const { data: existingCat } = await supabase
              .from('categories')
              .select('id')
              .eq('book_id', activeBookId!)
              .eq('name', categoryName)
              .eq('kind', kind)
              .limit(1)
              .maybeSingle()
            if (existingCat?.id) {
              resolvedCategoryId = existingCat.id
            } else {
              const { data: newCat } = await supabase
                .from('categories')
                .insert({
                  user_id: userId,
                  book_id: activeBookId,
                  name: categoryName,
                  kind,
                  parent_id: null,
                  icon: debt.direction === 'receivable' ? 'hand-coins' : 'receipt',
                  color: debt.direction === 'receivable' ? '#10b981' : '#f59e0b',
                })
                .select('id')
                .single()
              if (newCat?.id) resolvedCategoryId = newCat.id
            }
          } catch (e) {
            console.error('Failed to resolve default debt category:', e)
          }
        }

        const txPayload = {
          user_id: userId,
          book_id: activeBookId,
          account_id,
          category_id: resolvedCategoryId,
          type: txType,
          amount,
          currency: debt.currency,
          occurred_at: (paid_on ? new Date(paid_on) : new Date()).toISOString(),
          note: note ? `${defaultNote} - ${note}` : defaultNote,
          source: 'web' as const,
          status: 'pending' as const,
        }

        const { error: txErr } = await supabase.from('transactions').insert(txPayload)
        if (txErr) console.error('Error inserting payment transaction:', txErr)
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('ADD_DEBT_PAYMENT', { ...payment, user_id: userId, book_id: activeBookId })
        enqueueOfflineMutation('UPDATE_DEBT', { id: debt.id, paid: newPaid, status: newStatus })
        qc.setQueriesData({ queryKey: [...qk.debts, activeBookId] }, (old: DebtWithContact[] | undefined) =>
          old ? old.map((d) => (d.id === debt.id ? { ...d, paid: newPaid, status: newStatus } : d)) : [],
        )
        return
      }

      try {
        const { error: payErr } = await supabase
          .from('debt_payments')
          .insert({ ...payment, user_id: userId, book_id: activeBookId })
        if (payErr) throw payErr

        const { error: updErr } = await supabase
          .from('debts')
          .update({ paid: newPaid, status: newStatus })
          .eq('id', debt.id)
        if (updErr) throw updErr
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('CREATE_DEBT_PAYMENT', { ...payment, user_id: userId, book_id: activeBookId })
          enqueueOfflineMutation('UPDATE_DEBT', { id: debt.id, paid: newPaid, status: newStatus })
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.debts })
      void qc.invalidateQueries({ queryKey: qk.debtPayments })
      void qc.invalidateQueries({ queryKey: qk.balances })
      void qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

/** Permanent delete — FK cascade removes the debt's payment history too. */
export function useDeleteDebt() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (id: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('DELETE_DEBT', { id })
        qc.setQueriesData({ queryKey: [...qk.debts, activeBookId] }, (old: DebtWithContact[] | undefined) =>
          old ? old.filter((d) => d.id !== id) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('debts').delete().eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('DELETE_DEBT', { id })
        }
        throw err
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.debts }),
  })
}
