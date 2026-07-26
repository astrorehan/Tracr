import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useActiveBook } from '@/features/books/useActiveBook'
import { getAuthenticatedUserId } from '@/lib/authHelpers'
import { enqueueOfflineMutation } from '@/lib/offlineQueue'
import type {
  CreateInstallmentInput,
  Installment,
  InstallmentPayment,
  PayInstallmentInput,
} from './types'

export function useInstallments() {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.installments, activeBookId],
    queryFn: async (): Promise<Installment[]> => {
      const { data, error } = await supabase
        .from('installments')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('status', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Installment[]
    },
    enabled: !!activeBookId,
  })
}

export function useInstallmentPayments(installmentId?: string) {
  const { activeBookId } = useActiveBook()
  return useQuery({
    queryKey: [...qk.installmentPayments, activeBookId, installmentId],
    queryFn: async (): Promise<InstallmentPayment[]> => {
      let query = supabase
        .from('installment_payments')
        .select('*')
        .eq('book_id', activeBookId!)
        .order('payment_number', { ascending: true })

      if (installmentId) {
        query = query.eq('installment_id', installmentId)
      }

      const { data, error } = await query
      if (error) throw error
      return data as InstallmentPayment[]
    },
    enabled: !!activeBookId,
  })
}

export function useCreateInstallment() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()
  return useMutation({
    mutationFn: async (input: CreateInstallmentInput): Promise<Installment> => {
      const userId = await getAuthenticatedUserId()
      if (!activeBookId) throw new Error('No active book selected')

      const tenorMonths = Math.max(1, input.tenor_months)
      const paidMonths = Math.min(tenorMonths, Math.max(0, input.paid_months ?? 0))
      const dueDay = Math.min(31, Math.max(1, input.due_day))
      const interestRate = Math.min(100, Math.max(0, input.interest_rate ?? 0))
      const initialStatus: Installment['status'] = paidMonths >= tenorMonths ? 'completed' : 'active'

      const payload = {
        name: input.name,
        account_id: input.account_id || null,
        category_id: input.category_id || null,
        total_amount: Math.max(1, input.total_amount),
        tenor_months: tenorMonths,
        monthly_amount: Math.max(1, input.monthly_amount),
        interest_rate: interestRate,
        interest_type: input.interest_type ?? 'zero',
        start_date: input.start_date,
        due_day: dueDay,
        paid_months: paidMonths,
        status: initialStatus,
        note: input.note || null,
        user_id: userId,
        book_id: activeBookId,
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = `temp-inst-${Date.now()}`
        const dummy: Installment = {
          id: tempId,
          ...payload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        enqueueOfflineMutation('CREATE_INSTALLMENT', { ...payload, tempId })
        qc.setQueriesData(
          { queryKey: [...qk.installments, activeBookId] },
          (old: Installment[] | undefined) => (old ? [dummy, ...old] : [dummy]),
        )
        return dummy
      }

      const { data, error } = await supabase
        .from('installments')
        .insert(payload)
        .select()
        .single()

      if (error) throw error
      return data as Installment
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.installments })
    },
  })
}

export function useUpdateInstallment() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()

  return useMutation({
    mutationFn: async ({
      id,
      ...changes
    }: Partial<Installment> & { id: string }): Promise<void> => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('UPDATE_INSTALLMENT', { id, ...changes })
        qc.setQueriesData(
          { queryKey: [...qk.installments, activeBookId] },
          (old: Installment[] | undefined) =>
            old ? old.map((inst) => (inst.id === id ? { ...inst, ...changes } : inst)) : [],
        )
        return
      }

      const { error } = await supabase
        .from('installments')
        .update(changes)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.installments })
    },
  })
}

export function usePayInstallment() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()

  return useMutation({
    mutationFn: async ({
      installment,
      paid_at,
      account_id,
      category_id,
      note,
    }: PayInstallmentInput) => {
      const userId = await getAuthenticatedUserId()
      if (!activeBookId) throw new Error('No active book selected')

      const paymentNumber = installment.paid_months + 1
      const payDate = paid_at || new Date().toISOString().slice(0, 10)
      const targetAccount = account_id || installment.account_id
      const targetCategory = category_id || installment.category_id

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const nextPaidMonths = installment.paid_months + 1
        const nextStatus = nextPaidMonths >= installment.tenor_months ? 'completed' : 'active'

        let txPayload: any = null
        if (targetAccount) {
          txPayload = {
            user_id: userId,
            book_id: activeBookId,
            account_id: targetAccount,
            category_id: targetCategory || null,
            type: 'expense' as const,
            amount: installment.monthly_amount,
            currency: 'IDR',
            occurred_at: payDate,
            note: note || `${installment.name} (${paymentNumber}/${installment.tenor_months})`,
            status: 'cleared' as const,
          }
        }
        const paymentPayload = {
          user_id: userId,
          book_id: activeBookId,
          installment_id: installment.id,
          transaction_id: null,
          payment_number: paymentNumber,
          amount: installment.monthly_amount,
          paid_at: payDate,
        }
        enqueueOfflineMutation('PAY_INSTALLMENT', {
          installmentId: installment.id,
          txPayload,
          paymentPayload,
          nextPaidMonths,
          nextStatus,
        })
        qc.setQueriesData(
          { queryKey: [...qk.installments, activeBookId] },
          (old: Installment[] | undefined) =>
            old
              ? old.map((inst) =>
                  inst.id === installment.id
                    ? { ...inst, paid_months: nextPaidMonths, status: nextStatus }
                    : inst,
                )
              : [],
        )
        return
      }

      let transactionId: string | null = null

      // 1. Create expense transaction if an account is selected
      if (targetAccount) {
        let accountCurrency = 'IDR'
        const { data: accData } = await supabase
          .from('accounts')
          .select('currency')
          .eq('id', targetAccount)
          .single()

        if (accData?.currency) {
          accountCurrency = accData.currency
        }

        const txPayload = {
          user_id: userId,
          book_id: activeBookId,
          account_id: targetAccount,
          category_id: targetCategory || null,
          type: 'expense' as const,
          amount: installment.monthly_amount,
          currency: accountCurrency,
          occurred_at: payDate,
          note: note || `${installment.name} (${paymentNumber}/${installment.tenor_months})`,
          status: 'cleared' as const,
        }

        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .insert(txPayload)
          .select('id')
          .single()

        if (!txError && txData) {
          transactionId = txData.id
        }
      }

      // 2. Record installment payment
      const paymentPayload = {
        user_id: userId,
        book_id: activeBookId,
        installment_id: installment.id,
        transaction_id: transactionId,
        payment_number: paymentNumber,
        amount: installment.monthly_amount,
        paid_at: payDate,
      }

      const { error: payError } = await supabase
        .from('installment_payments')
        .insert(paymentPayload)

      if (payError) throw payError

      // 3. Update installment progress & status
      const nextPaidMonths = installment.paid_months + 1
      const nextStatus = nextPaidMonths >= installment.tenor_months ? 'completed' : 'active'

      const { error: updateError } = await supabase
        .from('installments')
        .update({
          paid_months: nextPaidMonths,
          status: nextStatus,
        })
        .eq('id', installment.id)

      if (updateError) throw updateError
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.installments })
      void qc.invalidateQueries({ queryKey: qk.installmentPayments })
      void qc.invalidateQueries({ queryKey: qk.transactions() })
      void qc.invalidateQueries({ queryKey: qk.accounts })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}

export interface EarlyPayoffInput {
  installment: Installment
  monthsToPay: number
  paid_at?: string
  account_id?: string | null
  category_id?: string | null
  note?: string | null
}

export function useEarlyPayoffInstallment() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()

  return useMutation({
    mutationFn: async ({
      installment,
      monthsToPay,
      paid_at,
      account_id,
      category_id,
      note,
    }: EarlyPayoffInput) => {
      const userId = await getAuthenticatedUserId()
      if (!activeBookId) throw new Error('No active book selected')

      const remainingMonths = installment.tenor_months - installment.paid_months
      const actualMonths = Math.min(remainingMonths, Math.max(1, monthsToPay))
      const totalAmount = installment.monthly_amount * actualMonths
      const payDate = paid_at || new Date().toISOString().slice(0, 10)
      const targetAccount = account_id || installment.account_id
      const targetCategory = category_id || installment.category_id

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        let txPayload: any = null
        if (targetAccount) {
          txPayload = {
            user_id: userId,
            book_id: activeBookId,
            account_id: targetAccount,
            category_id: targetCategory || null,
            type: 'expense' as const,
            amount: totalAmount,
            currency: 'IDR',
            occurred_at: payDate,
            note:
              note ||
              `${installment.name} (Pelunasan ${actualMonths} Bulan: #${installment.paid_months + 1}-${installment.paid_months + actualMonths}/${installment.tenor_months})`,
            status: 'cleared' as const,
          }
        }

        const paymentPayloads = []
        for (let i = 1; i <= actualMonths; i++) {
          paymentPayloads.push({
            user_id: userId,
            book_id: activeBookId,
            installment_id: installment.id,
            transaction_id: null,
            payment_number: installment.paid_months + i,
            amount: installment.monthly_amount,
            paid_at: payDate,
          })
        }

        const nextPaidMonths = installment.paid_months + actualMonths
        const nextStatus = nextPaidMonths >= installment.tenor_months ? 'completed' : 'active'

        enqueueOfflineMutation('EARLY_PAYOFF_INSTALLMENT', {
          installmentId: installment.id,
          txPayload,
          paymentPayloads,
          nextPaidMonths,
          nextStatus,
        })
        qc.setQueriesData(
          { queryKey: [...qk.installments, activeBookId] },
          (old: Installment[] | undefined) =>
            old
              ? old.map((inst) =>
                  inst.id === installment.id
                    ? { ...inst, paid_months: nextPaidMonths, status: nextStatus }
                    : inst,
                )
              : [],
        )
        return
      }

      let transactionId: string | null = null

      // 1. Create single expense transaction for the bulk amount
      if (targetAccount) {
        const txPayload = {
          user_id: userId,
          book_id: activeBookId,
          account_id: targetAccount,
          category_id: targetCategory || null,
          type: 'expense' as const,
          amount: totalAmount,
          currency: 'IDR',
          occurred_at: payDate,
          note:
            note ||
            `${installment.name} (Pelunasan ${actualMonths} Bulan: #${installment.paid_months + 1}-${installment.paid_months + actualMonths}/${installment.tenor_months})`,
          status: 'cleared' as const,
        }

        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .insert(txPayload)
          .select('id')
          .single()

        if (!txError && txData) {
          transactionId = txData.id
        }
      }

      // 2. Insert payment records for each paid month
      const paymentPayloads = []
      for (let i = 1; i <= actualMonths; i++) {
        paymentPayloads.push({
          user_id: userId,
          book_id: activeBookId,
          installment_id: installment.id,
          transaction_id: transactionId,
          payment_number: installment.paid_months + i,
          amount: installment.monthly_amount,
          paid_at: payDate,
        })
      }

      const { error: payError } = await supabase
        .from('installment_payments')
        .insert(paymentPayloads)

      if (payError) throw payError

      // 3. Update installment progress & status
      const nextPaidMonths = installment.paid_months + actualMonths
      const nextStatus = nextPaidMonths >= installment.tenor_months ? 'completed' : 'active'

      const { error: updateError } = await supabase
        .from('installments')
        .update({
          paid_months: nextPaidMonths,
          status: nextStatus,
        })
        .eq('id', installment.id)

      if (updateError) throw updateError
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.installments })
      void qc.invalidateQueries({ queryKey: qk.installmentPayments })
      void qc.invalidateQueries({ queryKey: qk.transactions() })
      void qc.invalidateQueries({ queryKey: qk.accounts })
      void qc.invalidateQueries({ queryKey: qk.balances })
    },
  })
}

export function useDeleteInstallment() {
  const qc = useQueryClient()
  const { activeBookId } = useActiveBook()

  return useMutation({
    mutationFn: async (id: string) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineMutation('DELETE_INSTALLMENT', { id })
        qc.setQueriesData(
          { queryKey: [...qk.installments, activeBookId] },
          (old: Installment[] | undefined) => (old ? old.filter((i) => i.id !== id) : []),
        )
        return
      }

      const { error } = await supabase.from('installments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.installments })
      void qc.invalidateQueries({ queryKey: qk.installmentPayments })
    },
  })
}
