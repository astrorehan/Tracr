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

export function useContacts() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.contacts, activeBookId],
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('name')
      if (error) throw error
      return data as Contact[]
    },
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: NewContact): Promise<Contact> => {
      const userId = await getAuthenticatedUserId()
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...input, user_id: userId, book_id: activeBookId })
        .select()
        .single()
      if (error) throw error
      return data as Contact
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.contacts }),
  })
}

export function useDebts() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.debts, activeBookId],
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
    }: {
      debt: Debt
      amount: number
      paid_on?: string
      note?: string | null
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
