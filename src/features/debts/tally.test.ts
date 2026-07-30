import { describe, it, expect } from 'vitest'
import { tallyByContact } from './tally'
import type { Debt } from '@/types/db'

type Row = Parameters<typeof tallyByContact>[0][number]

function debt(overrides: Partial<Row> = {}): Row {
  return {
    contact_id: 'c1',
    direction: 'receivable' as Debt['direction'],
    status: 'open' as Debt['status'],
    amount: 100_000,
    paid: 0,
    due_date: null,
    currency: 'IDR',
    ...overrides,
  }
}

const NOW = new Date('2026-07-30T10:00:00.000Z')

describe('tallyByContact', () => {
  it('returns nothing for an empty ledger', () => {
    expect(tallyByContact([], NOW).size).toBe(0)
  })

  it('sums the remaining amount per direction, net of payments', () => {
    const t = tallyByContact(
      [
        debt({ amount: 100_000, paid: 40_000 }),
        debt({ amount: 50_000 }),
        debt({ direction: 'payable', amount: 30_000, paid: 10_000 }),
      ],
      NOW,
    ).get('c1')!

    expect(t.owesMe).toBe(110_000) // 60k left + 50k
    expect(t.iOwe).toBe(20_000)
    expect(t.records).toBe(3)
    expect(t.openRecords).toBe(3)
  })

  it('counts settled debts as history but not as money owed', () => {
    const t = tallyByContact([debt({ status: 'paid', paid: 100_000 })], NOW).get('c1')!
    expect(t.owesMe).toBe(0)
    expect(t.openRecords).toBe(0)
    expect(t.records).toBe(1)
  })

  it('reports the furthest-gone due date and ignores settled overdue rows', () => {
    const t = tallyByContact(
      [
        debt({ due_date: '2026-07-28' }), // 2 days late
        debt({ due_date: '2026-07-20' }), // 10 days late
        debt({ due_date: '2026-08-05' }), // not due yet
        debt({ due_date: '2026-01-01', status: 'paid', paid: 100_000 }), // settled, no longer late
      ],
      NOW,
    ).get('c1')!

    expect(t.overdueDays).toBe(10)
  })

  it('keeps people apart and skips debts whose contact was deleted', () => {
    const map = tallyByContact(
      [debt(), debt({ contact_id: 'c2', amount: 25_000 }), debt({ contact_id: null })],
      NOW,
    )
    expect(map.size).toBe(2)
    expect(map.get('c1')!.owesMe).toBe(100_000)
    expect(map.get('c2')!.owesMe).toBe(25_000)
  })
})
