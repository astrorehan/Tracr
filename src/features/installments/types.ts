import type { InstallmentStatus, Installment, InstallmentPayment, InterestType } from '@/types/db'

export type { InstallmentStatus, Installment, InstallmentPayment, InterestType }

export interface CreateInstallmentInput {
  name: string
  account_id?: string | null
  category_id?: string | null
  total_amount: number
  tenor_months: number
  monthly_amount: number
  interest_rate?: number | null
  interest_type?: InterestType | null
  start_date: string
  due_day: number
  paid_months?: number
  note?: string | null
}

export interface PayInstallmentInput {
  installment: Installment
  paid_at?: string
  account_id?: string | null
  category_id?: string | null
  note?: string | null
}
