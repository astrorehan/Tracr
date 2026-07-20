import { describe, it, expect } from 'vitest'
import { goalProgress, daysToTarget, goalHealth } from './progress'
import type { GoalContribution } from '@/types/db'

function contrib(amount: number, occurred_at: string): GoalContribution {
  return { id: `${amount}-${occurred_at}`, user_id: 'u1', book_id: 'b1', goal_id: 'g1', amount, note: null, occurred_at, created_at: '' }
}

const NOW = new Date('2024-03-15T12:00:00')

describe('goalProgress', () => {
  it('reports zeroes for a goal with no contributions', () => {
    const p = goalProgress(100000, [], NOW)
    expect(p).toMatchObject({ saved: 0, remaining: 100000, pct: 0, complete: false, monthlyRate: 0, etaDate: null })
  })

  it('tracks saved, remaining and percentage', () => {
    const p = goalProgress(100000, [contrib(30000, '2024-03-10T00:00:00')], NOW)
    expect(p.saved).toBe(30000)
    expect(p.remaining).toBe(70000)
    expect(p.pct).toBe(30)
    expect(p.savedThisMonth).toBe(30000)
    expect(p.etaDate).not.toBeNull()
  })

  it('nets withdrawals out of saved but not out of deposit pace', () => {
    const p = goalProgress(100000, [contrib(50000, '2024-03-01T00:00:00'), contrib(-20000, '2024-03-10T00:00:00')], NOW)
    expect(p.saved).toBe(30000)
    // monthlyRate is driven by deposits only (50000 over 1 month)
    expect(p.monthlyRate).toBe(50000)
  })

  it('clamps a completed goal to 100% with no ETA', () => {
    const p = goalProgress(50000, [contrib(60000, '2024-03-01T00:00:00')], NOW)
    expect(p.pct).toBe(100)
    expect(p.complete).toBe(true)
    expect(p.etaDate).toBeNull()
  })

  it('averages deposits across the elapsed month span and counts only this month', () => {
    const p = goalProgress(
      100000,
      [contrib(40000, '2024-01-10T00:00:00'), contrib(20000, '2024-03-05T00:00:00')],
      NOW,
    )
    expect(p.saved).toBe(60000)
    expect(p.savedThisMonth).toBe(20000) // only the March contribution
    expect(p.monthlyRate).toBe(20000) // 60000 over 3 calendar months (Jan..Mar)
  })
})

describe('daysToTarget', () => {
  it('returns calendar days to the target date, or null without one', () => {
    expect(daysToTarget('2024-03-20', NOW)).toBe(5)
    expect(daysToTarget('2024-03-10', NOW)).toBe(-5) // past
    expect(daysToTarget(null, NOW)).toBeNull()
  })
})

describe('goalHealth', () => {
  it('is never at risk without a target date', () => {
    const h = goalHealth(100000, null, [], NOW)
    expect(h.atRisk).toBe(false)
    expect(h.neededMonthlyRate).toBeNull()
  })

  it('is never at risk once the goal is complete, even past its date', () => {
    const h = goalHealth(50000, '2024-01-01', [contrib(60000, '2024-01-01T00:00:00')], NOW)
    expect(h.progress.complete).toBe(true)
    expect(h.atRisk).toBe(false)
  })

  it('flags a pace that will miss the target date', () => {
    // 30,000/month won't cover the 70,000 left with ~31 days (~1 month) to go.
    const h = goalHealth(
      100000,
      '2024-04-15', // 31 days out
      [contrib(30000, '2024-03-01T00:00:00')],
      NOW,
    )
    expect(h.progress.monthlyRate).toBe(30000)
    expect(h.neededMonthlyRate).toBeCloseTo(68735, 0)
    expect(h.atRisk).toBe(true)
  })

  it('is not at risk when the pace comfortably covers the target', () => {
    const h = goalHealth(
      100000,
      '2024-06-15', // 3 months out
      [contrib(60000, '2024-03-01T00:00:00')], // 60k/month pace, only ~13k/month needed
      NOW,
    )
    expect(h.atRisk).toBe(false)
  })

  it('treats an overdue, incomplete goal as needing the full remainder now', () => {
    const h = goalHealth(100000, '2024-03-01', [contrib(40000, '2024-02-01T00:00:00')], NOW)
    expect(h.atRisk).toBe(true)
    expect(h.neededMonthlyRate).toBe(60000)
  })
})
