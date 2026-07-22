import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useActiveBook } from '@/features/books/useActiveBook'
import type { Contact, Debt, NewContact, NewDebt, NewDebtPayment } from '@/types/db'

/** A debt row with its contact joined (null if the contact was deleted). */
export type DebtWithContact = Debt & {
  contact: Pick<Contact, 'id' | 'name' | 'phone' | 'kind'> | null
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
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
      const userId = await currentUserId()
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
      const userId = await currentUserId()
      const { data, error } = await supabase
        .from('debts')
        .insert({ ...input, user_id: userId, book_id: activeBookId })
        .select()
        .single()
      if (error) throw error
      return data as Debt
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.debts }),
  })
}

/**
 * Record a payment against a debt: append a debt_payments row, then advance the
 * debt's `paid` running total and flip it to 'paid' once fully settled. The
 * form caps the amount at the remaining balance, so `paid` never exceeds
 * `amount`; the Math.min is a defensive belt-and-braces.
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
      const userId = await currentUserId()
      const payment: NewDebtPayment = {
        debt_id: debt.id,
        amount,
        paid_on: paid_on ?? new Date().toISOString().slice(0, 10),
        note: note ?? null,
      }
      const { error: payErr } = await supabase
        .from('debt_payments')
        .insert({ ...payment, user_id: userId, book_id: activeBookId })
      if (payErr) throw payErr

      const newPaid = Math.min(debt.amount, debt.paid + amount)
      const { error: updErr } = await supabase
        .from('debts')
        .update({ paid: newPaid, status: newPaid >= debt.amount ? 'paid' : 'open' })
        .eq('id', debt.id)
      if (updErr) throw updErr
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
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('debts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.debts }),
  })
}
