import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useActiveBook } from '@/features/books/useActiveBook'
import type {
  Contact,
  Debt,
  DebtDirection,
  NewContact,
  NewDebt,
  NewDebtPayment,
} from '@/types/db'

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

/**
 * The category a repayment lands in when the user didn't pick one: a per-book
 * "Pelunasan Piutang" / "Pelunasan Utang", created the first time it's needed.
 * Returns null if it can't be resolved — a payment is still worth recording
 * without a category.
 */
async function resolveDebtCategoryId(
  direction: DebtDirection,
  bookId: string,
  userId: string,
): Promise<string | null> {
  const kind = direction === 'receivable' ? 'income' : 'expense'
  const categoryName = direction === 'receivable' ? 'Pelunasan Piutang' : 'Pelunasan Utang'
  try {
    const { data: existingCat } = await supabase
      .from('categories')
      .select('id')
      .eq('book_id', bookId)
      .eq('name', categoryName)
      .eq('kind', kind)
      .limit(1)
      .maybeSingle()
    if (existingCat?.id) return existingCat.id as string

    const { data: newCat } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        book_id: bookId,
        name: categoryName,
        kind,
        parent_id: null,
        icon: direction === 'receivable' ? 'hand-coins' : 'receipt',
        color: direction === 'receivable' ? '#10b981' : '#f59e0b',
      })
      .select('id')
      .single()
    return (newCat?.id as string | undefined) ?? null
  } catch (e) {
    console.error('Failed to resolve default debt category:', e)
    return null
  }
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

        const resolvedCategoryId =
          category_id || (await resolveDebtCategoryId(debt.direction, activeBookId!, userId))

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

/**
 * Correct a note that was written down wrong: who it's with, which way it goes,
 * the amount, the due date or the text. Payments already recorded against it are
 * untouched, so the caller passes a `status` recomputed against `paid`.
 */
export function useUpdateDebt() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Debt> }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_DEBT', { id, ...patch })
        qc.setQueriesData({ queryKey: [...qk.debts, activeBookId] }, (old: DebtWithContact[] | undefined) =>
          old ? old.map((d) => (d.id === id ? { ...d, ...patch } : d)) : [],
        )
        return
      }

      try {
        const { error } = await supabase.from('debts').update(patch).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueueOfflineMutation('UPDATE_DEBT', { id, ...patch })
        }
        throw err
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.debts })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}

/**
 * Close out every open note one person has in one go — the common counter case
 * where someone with four separate tabs pays the lot at once.
 *
 * Each note still gets its own `debt_payments` row (the history stays honest),
 * but the money only moves once, so this books a single transaction for the
 * grand total instead of one per note.
 */
export function useSettleAllDebts() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async ({
      debts,
      paid_on,
      note,
      account_id,
      category_id,
    }: {
      debts: DebtWithContact[]
      paid_on?: string
      note?: string | null
      account_id?: string | null
      category_id?: string | null
    }) => {
      const outstanding = debts
        .map((d) => ({ debt: d, remaining: Math.max(0, d.amount - d.paid) }))
        .filter((r) => r.remaining > 0)
      if (outstanding.length === 0) return

      const userId = await getAuthenticatedUserId()
      const date = paid_on ?? new Date().toISOString().slice(0, 10)
      const total = outstanding.reduce((s, r) => s + r.remaining, 0)
      const { direction, currency } = outstanding[0].debt
      const name = outstanding[0].debt.contact?.name ?? ''

      if (account_id) {
        const label = direction === 'receivable' ? 'Pelunasan piutang' : 'Pelunasan utang'
        const defaultNote = `${label}${name ? `: ${name}` : ''} (${outstanding.length} catatan)`
        const resolvedCategoryId =
          category_id || (await resolveDebtCategoryId(direction, activeBookId!, userId))

        const { error: txErr } = await supabase.from('transactions').insert({
          user_id: userId,
          book_id: activeBookId,
          account_id,
          category_id: resolvedCategoryId,
          type: direction === 'receivable' ? 'income' : 'expense',
          amount: total,
          currency,
          occurred_at: new Date(date).toISOString(),
          note: note ? `${defaultNote} - ${note}` : defaultNote,
          source: 'web' as const,
          status: 'pending' as const,
        })
        if (txErr) console.error('Error inserting settlement transaction:', txErr)
      }

      const payments = outstanding.map(({ debt, remaining }) => ({
        ...({
          debt_id: debt.id,
          amount: remaining,
          paid_on: date,
          note: note ?? null,
        } satisfies NewDebtPayment),
        user_id: userId,
        book_id: activeBookId,
      }))

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        for (const [i, payment] of payments.entries()) {
          enqueueOfflineMutation('ADD_DEBT_PAYMENT', payment)
          enqueueOfflineMutation('UPDATE_DEBT', {
            id: outstanding[i].debt.id,
            paid: outstanding[i].debt.amount,
            status: 'paid',
          })
        }
        const settledIds = new Set(outstanding.map((r) => r.debt.id))
        qc.setQueriesData({ queryKey: [...qk.debts, activeBookId] }, (old: DebtWithContact[] | undefined) =>
          old
            ? old.map((d) =>
                settledIds.has(d.id) ? { ...d, paid: d.amount, status: 'paid' as const } : d,
              )
            : [],
        )
        return
      }

      const { error: payErr } = await supabase.from('debt_payments').insert(payments)
      if (payErr) throw payErr

      // `paid` differs per row, so this can't collapse into one .in() update.
      for (const { debt } of outstanding) {
        const { error: updErr } = await supabase
          .from('debts')
          .update({ paid: debt.amount, status: 'paid' })
          .eq('id', debt.id)
        if (updErr) throw updErr
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
