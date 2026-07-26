import { addMonths, differenceInCalendarDays, parseISO, setDate, isAfter, startOfDay } from 'date-fns'
import type { InterestType } from './types'

/**
 * Calculates the progress percentage (0 - 100).
 */
export function calculateProgress(paidMonths: number, tenorMonths: number): number {
  if (tenorMonths <= 0) return 0
  const pct = (paidMonths / tenorMonths) * 100
  return Math.min(100, Math.max(0, pct))
}

/**
 * Calculates the remaining principal balance in minor units.
 */
export function calculateRemainingAmount(
  totalAmount: number,
  monthlyAmount: number,
  paidMonths: number,
  tenorMonths?: number,
  interestRate?: number | null,
  interestType?: InterestType | null,
): number {
  if (tenorMonths !== undefined && paidMonths >= tenorMonths) return 0

  // If schedule breakdown is available, use accurate schedule balance
  if (interestType && interestType !== 'zero' && tenorMonths) {
    const sched = generateAmortizationSchedule({
      start_date: '2000-01-01',
      due_day: 1,
      tenor_months: tenorMonths,
      total_amount: totalAmount,
      monthly_amount: monthlyAmount,
      paid_months: paidMonths,
      interest_rate: interestRate,
      interest_type: interestType,
    })
    const currentPaidRow = sched[paidMonths - 1]
    return currentPaidRow ? currentPaidRow.remainingPrincipal : totalAmount
  }

  const paidTotal = monthlyAmount * paidMonths
  return Math.max(0, totalAmount - paidTotal)
}

/**
 * Computes projected payoff date based on start_date + tenor_months.
 */
export function calculatePayoffDate(startDate: string, tenorMonths: number): Date {
  const start = parseISO(startDate)
  return addMonths(start, tenorMonths)
}

/**
 * Calculates the next due date based on monthly due_day.
 */
export function getNextDueDate(dueDay: number, referenceDate: Date = new Date()): Date {
  const today = startOfDay(referenceDate)
  // Clamp target day to valid day of current month
  const targetDay = Math.min(31, Math.max(1, dueDay))
  let candidate = setDate(today, targetDay)

  // If candidate is already in the past today, move to next month
  if (isAfter(today, candidate)) {
    candidate = setDate(addMonths(today, 1), targetDay)
  }

  return candidate
}

/**
 * Calculates days remaining until the next due date.
 * Returns negative numbers if overdue.
 */
export function getDaysUntilDue(dueDay: number, referenceDate: Date = new Date()): number {
  const nextDue = getNextDueDate(dueDay, referenceDate)
  const today = startOfDay(referenceDate)
  return differenceInCalendarDays(nextDue, today)
}

/**
 * Helper to calculate estimated monthly payment based on interest method.
 */
export function calculateMonthlyPayment(
  totalAmount: number,
  tenorMonths: number,
  interestRate: number = 0,
  interestType: InterestType = 'zero',
): number {
  if (tenorMonths <= 0 || totalAmount <= 0) return 0
  if (interestType === 'zero' || !interestRate || interestRate <= 0) {
    return Math.round(totalAmount / tenorMonths)
  }

  if (interestType === 'flat') {
    const totalInterest = Math.round(totalAmount * (interestRate / 100) * (tenorMonths / 12))
    const monthlyPrincipal = Math.round(totalAmount / tenorMonths)
    const monthlyInterest = Math.round(totalInterest / tenorMonths)
    return monthlyPrincipal + monthlyInterest
  }

  if (interestType === 'annuity') {
    const r = interestRate / 100 / 12
    if (r <= 0) return Math.round(totalAmount / tenorMonths)
    const factor = Math.pow(1 + r, tenorMonths)
    const pmt = totalAmount * ((r * factor) / (factor - 1))
    return Math.round(pmt)
  }

  return Math.round(totalAmount / tenorMonths)
}

export interface AmortizationRow {
  monthNumber: number
  dueDate: Date
  amount: number
  principalAmount: number
  interestAmount: number
  remainingPrincipal: number
  isPaid: boolean
  isNext: boolean
  paidAt?: string
}

/**
 * Generates full monthly amortization schedule table items from month 1 to tenorMonths.
 */
export function generateAmortizationSchedule(
  installment: {
    start_date: string
    due_day: number
    tenor_months: number
    total_amount: number
    monthly_amount: number
    paid_months: number
    interest_rate?: number | null
    interest_type?: InterestType | null
  },
  payments: { payment_number: number; paid_at: string }[] = [],
): AmortizationRow[] {
  const schedule: AmortizationRow[] = []
  const baseStart = parseISO(installment.start_date)
  const tenor = installment.tenor_months
  const type = installment.interest_type ?? 'zero'
  const rate = installment.interest_rate ?? 0

  let currentRemaining = installment.total_amount
  const r = rate > 0 ? rate / 100 / 12 : 0

  // Pre-calculate base values for Flat
  const flatTotalInterest =
    type === 'flat' && rate > 0
      ? Math.round(installment.total_amount * (rate / 100) * (tenor / 12))
      : 0
  const flatMonthlyPrincipal = type === 'flat' ? Math.round(installment.total_amount / tenor) : 0
  const flatMonthlyInterest = type === 'flat' ? Math.round(flatTotalInterest / tenor) : 0

  let accumulatedPrincipal = 0
  let accumulatedInterest = 0

  for (let m = 1; m <= tenor; m++) {
    const monthDate = addMonths(baseStart, m - 1)
    const targetDay = Math.min(31, Math.max(1, installment.due_day))
    const dueDate = setDate(monthDate, targetDay)

    let pAmount = 0
    let iAmount = 0
    let monthTotal = installment.monthly_amount

    if (type === 'zero' || rate <= 0) {
      if (m === tenor) {
        pAmount = Math.max(0, installment.total_amount - accumulatedPrincipal)
      } else {
        pAmount = Math.min(currentRemaining, Math.round(installment.total_amount / tenor))
      }
      iAmount = 0
      monthTotal = pAmount
    } else if (type === 'flat') {
      if (m === tenor) {
        pAmount = Math.max(0, installment.total_amount - accumulatedPrincipal)
        iAmount = Math.max(0, flatTotalInterest - accumulatedInterest)
      } else {
        pAmount = Math.min(currentRemaining, flatMonthlyPrincipal)
        iAmount = flatMonthlyInterest
      }
      monthTotal = pAmount + iAmount
    } else if (type === 'annuity') {
      if (m === tenor) {
        pAmount = Math.max(0, currentRemaining)
        iAmount = Math.round(currentRemaining * r)
        monthTotal = pAmount + iAmount
      } else {
        iAmount = Math.round(currentRemaining * r)
        pAmount = Math.min(currentRemaining, Math.max(0, installment.monthly_amount - iAmount))
        monthTotal = pAmount + iAmount
      }
    }

    accumulatedPrincipal += pAmount
    accumulatedInterest += iAmount
    currentRemaining = Math.max(0, installment.total_amount - accumulatedPrincipal)

    const isPaid = m <= installment.paid_months
    const isNext = !isPaid && m === installment.paid_months + 1
    const matchingPayment = payments.find((p) => p.payment_number === m)

    schedule.push({
      monthNumber: m,
      dueDate,
      amount: monthTotal,
      principalAmount: pAmount,
      interestAmount: iAmount,
      remainingPrincipal: currentRemaining,
      isPaid,
      isNext,
      paidAt: matchingPayment?.paid_at,
    })
  }

  return schedule
}


