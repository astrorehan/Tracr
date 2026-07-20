import { describe, it, expect } from 'vitest'
import { billNotifications, budgetNotifications, sortNotifications } from './notifications'
import type { BudgetStatus } from '@/features/budgets/progress'
import type { Budget, RecurringTransaction } from '@/types/db'

function rec(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
  return {
    id: 'r1',
    user_id: 'u1',
    book_id: 'b1',
    name: 'Rent',
    type: 'expense',
    account_id: 'a1',
    category_id: null,
    amount: 100000,
    currency: 'USD',
    frequency: 'monthly',
    interval: 1,
    next_due: '2024-03-10',
    is_active: true,
    auto_post: false,
    note: null,
    last_paid_at: null,
    created_at: '',
    ...overrides,
  }
}

const TODAY = new Date('2024-03-10T12:00:00')

describe('billNotifications', () => {
  it('flags overdue and due-soon bills, skipping upcoming and inactive ones', () => {
    const notes = billNotifications(
      [
        rec({ id: 'overdue', next_due: '2024-03-05' }),
        rec({ id: 'soon', next_due: '2024-03-12' }),
        rec({ id: 'upcoming', next_due: '2024-03-25' }), // >7d → skipped
        rec({ id: 'paused', next_due: '2024-03-01', is_active: false }), // skipped
      ],
      TODAY,
    )
    expect(notes.map((n) => n.id)).toEqual(['bill:overdue:2024-03-05', 'bill:soon:2024-03-12'])
    expect(notes[0].severity).toBe('danger') // overdue
    expect(notes[1].severity).toBe('warning') // due soon
  })

  it('ranks the more-overdue bill higher', () => {
    // Input order is preserved: [0] = 1 day late, [1] = 9 days late.
    const notes = billNotifications(
      [rec({ id: 'a', next_due: '2024-03-09' }), rec({ id: 'b', next_due: '2024-03-01' })],
      TODAY,
    )
    expect(notes[1].priority).toBeGreaterThan(notes[0].priority)
  })
})

function status(over: Partial<BudgetStatus>): BudgetStatus {
  return { spent: 0, carry: 0, limit: 100000, remaining: 0, pct: 0, level: 'ok', projected: 0, paceFrac: 0, ...over }
}
function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    user_id: 'u1',
    book_id: 'bk1',
    category_id: null,
    period: 'monthly',
    amount: 100000,
    currency: 'USD',
    rollover: false,
    created_at: '',
    ...overrides,
  }
}

describe('budgetNotifications', () => {
  it('alerts on near and over budgets but not ok ones', () => {
    const notes = budgetNotifications([
      { budget: budget({ id: 'ok' }), status: status({ level: 'ok', pct: 40 }), name: 'Food', periodKey: '2024-03-01' },
      { budget: budget({ id: 'near' }), status: status({ level: 'near', pct: 85, spent: 85000 }), name: 'Food', periodKey: '2024-03-01' },
      { budget: budget({ id: 'over' }), status: status({ level: 'over', pct: 120, spent: 120000 }), name: 'Rent', periodKey: '2024-03-01' },
    ])
    expect(notes.map((n) => n.id)).toEqual([
      'budget:near:2024-03-01:near',
      'budget:over:2024-03-01:over',
    ])
    expect(notes.find((n) => n.id.includes('over'))!.severity).toBe('danger')
  })

  it('ids change with period and level so read-state resets appropriately', () => {
    const base = { budget: budget(), name: 'Food' }
    const near = budgetNotifications([{ ...base, status: status({ level: 'near', pct: 85 }), periodKey: '2024-03-01' }])
    const over = budgetNotifications([{ ...base, status: status({ level: 'over', pct: 105 }), periodKey: '2024-03-01' }])
    const nextPeriod = budgetNotifications([{ ...base, status: status({ level: 'near', pct: 85 }), periodKey: '2024-04-01' }])
    expect(near[0].id).not.toBe(over[0].id) // crossing into 'over' is a fresh alert
    expect(near[0].id).not.toBe(nextPeriod[0].id) // new period is a fresh alert
  })
})

describe('sortNotifications', () => {
  it('orders by priority descending (most urgent first)', () => {
    const merged = sortNotifications([
      ...billNotifications([rec({ id: 'soon', next_due: '2024-03-12' })], TODAY),
      ...budgetNotifications([
        { budget: budget({ id: 'over' }), status: status({ level: 'over', pct: 130 }), name: 'Rent', periodKey: 'p' },
      ]),
    ])
    // over-budget (priority ~930) should rank above a due-soon bill (~505)
    expect(merged[0].id).toContain('budget:over')
  })
})
