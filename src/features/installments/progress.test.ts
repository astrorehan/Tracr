import { describe, expect, it } from 'vitest'
import {
  calculateProgress,
  calculateRemainingAmount,
  calculateMonthlyPayment,
  generateAmortizationSchedule,
} from './progress'

describe('Installments Progress & Math Logic', () => {
  it('calculates progress percentage correctly', () => {
    expect(calculateProgress(0, 12)).toBe(0)
    expect(calculateProgress(6, 12)).toBe(50)
    expect(calculateProgress(12, 12)).toBe(100)
    expect(calculateProgress(15, 12)).toBe(100)
  })

  it('calculates 0% interest monthly payment and amortization schedule', () => {
    const totalAmount = 12000000 // Rp 12.000.000
    const tenorMonths = 12
    const monthlyPmt = calculateMonthlyPayment(totalAmount, tenorMonths, 0, 'zero')
    expect(monthlyPmt).toBe(1000000)

    const schedule = generateAmortizationSchedule({
      start_date: '2026-01-01',
      due_day: 10,
      tenor_months: tenorMonths,
      total_amount: totalAmount,
      monthly_amount: monthlyPmt,
      paid_months: 3,
      interest_rate: 0,
      interest_type: 'zero',
    })

    expect(schedule).toHaveLength(12)
    expect(schedule[0].principalAmount).toBe(1000000)
    expect(schedule[0].interestAmount).toBe(0)
    expect(schedule[0].remainingPrincipal).toBe(11000000)
    expect(schedule[0].isPaid).toBe(true)
    expect(schedule[3].isNext).toBe(true)
    expect(schedule[11].remainingPrincipal).toBe(0)
  })

  it('calculates flat interest breakdown correctly', () => {
    const totalAmount = 12000000 // Rp 12.000.000
    const tenorMonths = 12
    const rate = 10 // 10% per annum flat
    // Total interest = 12M * 10% * 1 year = 1.200.000
    // Monthly interest = 100.000, Monthly principal = 1.000.000
    // Total monthly payment = 1.100.000

    const monthlyPmt = calculateMonthlyPayment(totalAmount, tenorMonths, rate, 'flat')
    expect(monthlyPmt).toBe(1100000)

    const schedule = generateAmortizationSchedule({
      start_date: '2026-01-01',
      due_day: 5,
      tenor_months: tenorMonths,
      total_amount: totalAmount,
      monthly_amount: monthlyPmt,
      paid_months: 0,
      interest_rate: rate,
      interest_type: 'flat',
    })

    expect(schedule[0].principalAmount).toBe(1000000)
    expect(schedule[0].interestAmount).toBe(100000)
    expect(schedule[0].amount).toBe(1100000)
    expect(schedule[11].remainingPrincipal).toBe(0)

    const totalInterestSum = schedule.reduce((sum, r) => sum + r.interestAmount, 0)
    expect(totalInterestSum).toBe(1200000)
  })

  it('calculates annuity/KPR interest schedule accurately', () => {
    const totalAmount = 100000000 // Rp 100.000.000
    const tenorMonths = 24
    const rate = 12 // 12% per annum effective

    const monthlyPmt = calculateMonthlyPayment(totalAmount, tenorMonths, rate, 'annuity')
    expect(monthlyPmt).toBeGreaterThan(0)

    const schedule = generateAmortizationSchedule({
      start_date: '2026-01-01',
      due_day: 15,
      tenor_months: tenorMonths,
      total_amount: totalAmount,
      monthly_amount: monthlyPmt,
      paid_months: 0,
      interest_rate: rate,
      interest_type: 'annuity',
    })

    expect(schedule).toHaveLength(24)
    // Month 1 interest should be 100M * (12%/12) = 1.000.000
    expect(schedule[0].interestAmount).toBe(1000000)
    // Remaining principal after last month should be 0
    expect(schedule[23].remainingPrincipal).toBe(0)
    // Principal portion should increase over time in annuity
    expect(schedule[23].principalAmount).toBeGreaterThan(schedule[0].principalAmount)
  })

  it('handles remaining balance for non-zero interest', () => {
    const rem = calculateRemainingAmount(12000000, 1100000, 3, 12, 10, 'flat')
    expect(rem).toBe(9000000) // 12M - 3M principal paid = 9M
  })
})
