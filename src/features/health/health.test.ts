import { describe, it, expect } from 'vitest'
import {
  activeDays,
  billsAhead,
  burnRate,
  dailyAllowance,
  expenseBetween,
  flowBetween,
  forecastMonthEnd,
  gradeOf,
  historyDays,
  incomeAhead,
  runway,
  snapshotMoney,
  walletScore,
} from './health'
import { buildRateTable } from '@/features/fx/fx'
import type { Account, FxRate, RecurringTransaction, Transaction } from '@/types/db'

const NOW = new Date('2024-03-15T12:00:00')
const BASE = 'IDR'

/** 1 USD = 15,000 IDR. */
const RATES: FxRate[] = [
  { id: 'r1', user_id: 'u1', base: 'USD', quote: 'IDR', rate: 15_000, as_of: '2024-03-01', source: 'manual', created_at: '' } as FxRate,
]
const TABLE = buildRateTable(RATES, BASE)
const NO_RATES = buildRateTable([], BASE)

function tx(p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'occurred_at'>): Transaction {
  return {
    id: `${p.type}-${p.amount}-${p.occurred_at}`,
    user_id: 'u1',
    book_id: 'b1',
    account_id: 'a1',
    category_id: null,
    counter_account_id: null,
    currency: BASE,
    base_amount: null,
    fx_rate: null,
    counter_amount: null,
    counter_fx_rate: null,
    note: null,
    ...p,
  } as Transaction
}

function account(p: Partial<Account> & Pick<Account, 'id' | 'type'>): Account {
  return {
    user_id: 'u1',
    book_id: 'b1',
    name: p.id,
    currency: BASE,
    opening_balance: 0,
    icon: null,
    color: null,
    is_archived: false,
    is_liability: false,
    credit_limit: null,
    exclude_from_stats: false,
    sort_order: 0,
    created_at: '',
    ...p,
  } as Account
}

function bill(p: Partial<RecurringTransaction> & Pick<RecurringTransaction, 'id' | 'next_due'>): RecurringTransaction {
  return {
    user_id: 'u1',
    book_id: 'b1',
    name: p.id,
    type: 'expense',
    account_id: 'a1',
    category_id: null,
    amount: 100_000,
    currency: BASE,
    frequency: 'monthly',
    interval: 1,
    is_active: true,
    auto_post: false,
    note: null,
    last_paid_at: null,
    created_at: '',
    ...p,
  } as RecurringTransaction
}

describe('expenseBetween / flowBetween', () => {
  const txns = [
    tx({ type: 'expense', amount: 50_000, occurred_at: '2024-03-10T00:00:00' }),
    tx({ type: 'income', amount: 500_000, occurred_at: '2024-03-05T00:00:00' }),
    tx({ type: 'expense', amount: 20_000, occurred_at: '2024-02-20T00:00:00' }), // outside
  ]

  it('sums only expenses inside the range', () => {
    expect(expenseBetween(txns, BASE, TABLE, new Date('2024-03-01'), NOW)).toBe(50_000)
  })

  it('keeps foreign-currency rows by valuing them in base', () => {
    const withUsd = [
      ...txns,
      tx({ type: 'expense', amount: 1000, currency: 'USD', occurred_at: '2024-03-12T00:00:00' }), // $10 -> 150k
    ]
    expect(expenseBetween(withUsd, BASE, TABLE, new Date('2024-03-01'), NOW)).toBe(200_000)
  })

  it('prefers the frozen base_amount over the live rate', () => {
    const frozen = [
      tx({ type: 'expense', amount: 1000, currency: 'USD', base_amount: 999_999, occurred_at: '2024-03-12T00:00:00' }),
    ]
    expect(expenseBetween(frozen, BASE, TABLE, new Date('2024-03-01'), NOW)).toBe(999_999)
  })

  it('skips rows it cannot value rather than counting them as zero', () => {
    const unvaluable = [
      tx({ type: 'expense', amount: 1000, currency: 'EUR', occurred_at: '2024-03-12T00:00:00' }),
      tx({ type: 'expense', amount: 50_000, occurred_at: '2024-03-10T00:00:00' }),
    ]
    expect(expenseBetween(unvaluable, BASE, NO_RATES, new Date('2024-03-01'), NOW)).toBe(50_000)
  })

  it('reports income, expense and net over the range', () => {
    const f = flowBetween(txns, BASE, RATES, new Date('2024-03-01'), NOW)
    expect(f).toMatchObject({ income: 500_000, expense: 50_000, net: 450_000 })
  })
})

describe('snapshotMoney', () => {
  it('splits assets, debts and net worth', () => {
    const accounts = [
      account({ id: 'cash', type: 'cash' }),
      account({ id: 'bank', type: 'bank_card' }),
      account({ id: 'stocks', type: 'stocks' }),
      account({ id: 'card', type: 'credit_card', is_liability: true }),
    ]
    const balances = { cash: 200_000, bank: 800_000, stocks: 5_000_000, card: -300_000 }
    const m = snapshotMoney(accounts, balances, BASE, TABLE)
    expect(m.assets).toBe(6_000_000)
    expect(m.debts).toBe(300_000)
    expect(m.total).toBe(5_700_000)
  })

  it('separates what can be spent today from the wider cushion', () => {
    const accounts = [
      account({ id: 'cash', type: 'cash' }),
      account({ id: 'wallet', type: 'e_wallet' }),
      account({ id: 'stocks', type: 'stocks' }),
      account({ id: 'coins', type: 'crypto' }),
      account({ id: 'iou', type: 'receivable' }),
    ]
    const balances = { cash: 200_000, wallet: 300_000, stocks: 5_000_000, coins: 1_000_000, iou: 400_000 }
    const m = snapshotMoney(accounts, balances, BASE, TABLE)
    expect(m.spendable).toBe(500_000) // cash + e-wallet only
    expect(m.reserves).toBe(6_500_000) // + stocks + crypto, but not the IOU
    expect(m.assets).toBe(6_900_000) // the IOU still counts as an asset
  })

  it('leaves excluded accounts out entirely', () => {
    const accounts = [
      account({ id: 'cash', type: 'cash' }),
      account({ id: 'ignored', type: 'cash', exclude_from_stats: true }),
    ]
    const m = snapshotMoney(accounts, { cash: 100_000, ignored: 900_000 }, BASE, TABLE)
    expect(m.spendable).toBe(100_000)
    expect(m.total).toBe(100_000)
  })

  it('treats an overdrawn asset account as zero spendable, not negative', () => {
    const m = snapshotMoney([account({ id: 'cash', type: 'cash' })], { cash: -50_000 }, BASE, TABLE)
    expect(m.spendable).toBe(0)
    expect(m.total).toBe(-50_000)
  })

  it('reports card usage only for cards that declare a limit', () => {
    const withLimit = snapshotMoney(
      [account({ id: 'card', type: 'credit_card', is_liability: true, credit_limit: 1_000_000 })],
      { card: -400_000 },
      BASE,
      TABLE,
    )
    expect(withLimit.cardUsage).toBeCloseTo(0.4)

    const noLimit = snapshotMoney(
      [account({ id: 'card', type: 'credit_card', is_liability: true })],
      { card: -400_000 },
      BASE,
      TABLE,
    )
    expect(noLimit.cardUsage).toBeNull()
  })

  it('flags currencies it cannot convert instead of guessing', () => {
    const m = snapshotMoney(
      [account({ id: 'eur', type: 'cash', currency: 'EUR' }), account({ id: 'cash', type: 'cash' })],
      { eur: 100_000, cash: 50_000 },
      BASE,
      NO_RATES,
    )
    expect(m.missing).toEqual(['EUR'])
    expect(m.total).toBe(50_000)
  })

  it('converts foreign balances and limits into base', () => {
    const m = snapshotMoney(
      [account({ id: 'usd', type: 'bank_card', currency: 'USD' })],
      { usd: 10_000 }, // $100 -> Rp 1,500,000
      BASE,
      TABLE,
    )
    expect(m.spendable).toBe(1_500_000)
  })
})

describe('burnRate', () => {
  it('divides by days observed, not the whole window', () => {
    // Two weeks of history, 700k spent -> 50k/day.
    const txns = [
      tx({ type: 'expense', amount: 700_000, occurred_at: '2024-03-15T00:00:00' }),
      tx({ type: 'income', amount: 1, occurred_at: '2024-03-02T00:00:00' }), // sets the span
    ]
    const b = burnRate(txns, BASE, TABLE, NOW)
    expect(b.observedDays).toBe(14)
    expect(b.monthly).toBe(1_500_000)
    expect(b.confident).toBe(true)
  })

  it('is not confident with under two weeks of history', () => {
    const b = burnRate(
      [tx({ type: 'expense', amount: 100_000, occurred_at: '2024-03-14T00:00:00' })],
      BASE,
      TABLE,
      NOW,
    )
    expect(b.confident).toBe(false)
  })

  it('returns zero burn for an empty book', () => {
    expect(burnRate([], BASE, TABLE, NOW)).toMatchObject({ daily: 0, monthly: 0, confident: false })
  })
})

describe('runway', () => {
  it('divides reserves by monthly burn', () => {
    const burn = { daily: 50_000, monthly: 1_500_000, observedDays: 90, confident: true }
    expect(runway(4_500_000, burn).months).toBeCloseTo(3)
  })

  it('withholds a figure when history is too thin to extrapolate', () => {
    const burn = { daily: 50_000, monthly: 1_500_000, observedDays: 3, confident: false }
    expect(runway(4_500_000, burn).months).toBeNull()
  })

  it('withholds a figure when nothing is being spent', () => {
    const burn = { daily: 0, monthly: 0, observedDays: 90, confident: true }
    expect(runway(4_500_000, burn).months).toBeNull()
  })
})

describe('dailyAllowance', () => {
  const spentTodayTx = tx({ type: 'expense', amount: 60_000, occurred_at: '2024-03-15T09:00:00' })

  it('spreads an unspent budget across the days left in the month', () => {
    // 15 Mar -> 17 days left (15..31).
    const a = dailyAllowance({
      txns: [],
      base: BASE,
      table: TABLE,
      budgetRemaining: 1_700_000,
      spendable: 0,
      billsAhead: 0,
      now: NOW,
    })
    expect(a.basis).toBe('budget')
    expect(a.daysLeft).toBe(17)
    expect(a.perDay).toBe(100_000)
  })

  it('falls back to cash minus upcoming bills when there is no budget', () => {
    const a = dailyAllowance({
      txns: [],
      base: BASE,
      table: TABLE,
      budgetRemaining: null,
      spendable: 2_000_000,
      billsAhead: 300_000,
      now: NOW,
    })
    expect(a.basis).toBe('cash')
    expect(a.available).toBe(1_700_000)
    expect(a.perDay).toBe(100_000)
  })

  it("holds today's share at its start-of-day value and subtracts what today cost", () => {
    // 1,640,000 left after today's 60k -> 1,700,000 this morning -> 100k/day.
    const a = dailyAllowance({
      txns: [spentTodayTx],
      base: BASE,
      table: TABLE,
      budgetRemaining: 1_640_000,
      spendable: 0,
      billsAhead: 0,
      now: NOW,
    })
    expect(a.perDay).toBe(100_000)
    expect(a.spentToday).toBe(60_000)
    expect(a.leftToday).toBe(40_000)
  })

  it('goes negative for today once the share is used up, but never below zero per day', () => {
    const a = dailyAllowance({
      txns: [tx({ type: 'expense', amount: 250_000, occurred_at: '2024-03-15T09:00:00' })],
      base: BASE,
      table: TABLE,
      budgetRemaining: -500_000, // budget already blown
      spendable: 0,
      billsAhead: 0,
      now: NOW,
    })
    expect(a.available).toBe(-500_000)
    expect(a.perDay).toBe(0)
    expect(a.leftToday).toBe(-250_000)
  })

  it('flags a cash allowance that is nowhere near the usual daily pace', () => {
    // Rp 15k spendable spread over 17 days is ~890/day against a 50k/day habit —
    // quoting that as a plan would look broken, so the card gets told.
    const a = dailyAllowance({
      txns: [tx({ type: 'expense', amount: 750_000, occurred_at: '2024-03-01T00:00:00' })],
      base: BASE,
      table: TABLE,
      budgetRemaining: null,
      spendable: 15_000,
      billsAhead: 0,
      now: NOW,
    })
    expect(a.avgPerDay).toBe(50_000)
    expect(a.tight).toBe(true)
  })

  it('does not flag a budget-based allowance as tight', () => {
    // A deliberately small limit is a choice, not a warning sign.
    const a = dailyAllowance({
      txns: [tx({ type: 'expense', amount: 750_000, occurred_at: '2024-03-01T00:00:00' })],
      base: BASE,
      table: TABLE,
      budgetRemaining: 15_000,
      spendable: 0,
      billsAhead: 0,
      now: NOW,
    })
    expect(a.tight).toBe(false)
  })

  it('averages this month spend per elapsed day', () => {
    const a = dailyAllowance({
      txns: [
        tx({ type: 'expense', amount: 150_000, occurred_at: '2024-03-01T00:00:00' }),
        tx({ type: 'expense', amount: 150_000, occurred_at: '2024-03-10T00:00:00' }),
        tx({ type: 'expense', amount: 900_000, occurred_at: '2024-02-10T00:00:00' }), // last month
      ],
      base: BASE,
      table: TABLE,
      budgetRemaining: 0,
      spendable: 0,
      billsAhead: 0,
      now: NOW,
    })
    expect(a.avgPerDay).toBe(20_000) // 300k over 15 elapsed days
  })
})

describe('billsAhead', () => {
  it('keeps overdue and soon-due expense bills, dropping far-off ones', () => {
    const b = billsAhead(
      [
        bill({ id: 'late', next_due: '2024-03-10', amount: 200_000 }),
        bill({ id: 'soon', next_due: '2024-03-20', amount: 300_000 }),
        bill({ id: 'far', next_due: '2024-04-20', amount: 900_000 }),
      ],
      BASE,
      TABLE,
      14,
      NOW,
    )
    expect(b.items.map((i) => i.rec.id)).toEqual(['late', 'soon'])
    expect(b.total).toBe(500_000)
    expect(b.overdueCount).toBe(1)
  })

  it('ignores paused schedules and income schedules', () => {
    const b = billsAhead(
      [
        bill({ id: 'paused', next_due: '2024-03-16', is_active: false }),
        bill({ id: 'salary', next_due: '2024-03-16', type: 'income', amount: 5_000_000 }),
        bill({ id: 'rent', next_due: '2024-03-16', amount: 400_000 }),
      ],
      BASE,
      TABLE,
      14,
      NOW,
    )
    expect(b.items.map((i) => i.rec.id)).toEqual(['rent'])
    expect(b.total).toBe(400_000)
  })

  it('lists an unvaluable bill but flags the total as partial', () => {
    const b = billsAhead(
      [bill({ id: 'eur', next_due: '2024-03-16', currency: 'EUR', amount: 5_000 })],
      BASE,
      NO_RATES,
      14,
      NOW,
    )
    expect(b.items).toHaveLength(1)
    expect(b.items[0].base).toBeNull()
    expect(b.total).toBe(0)
    expect(b.partial).toBe(true)
  })
})

describe('incomeAhead', () => {
  it('sums active income schedules due within the window, ignoring expenses', () => {
    const total = incomeAhead(
      [
        bill({ id: 'salary', next_due: '2024-03-25', type: 'income', amount: 5_000_000 }),
        bill({ id: 'rent', next_due: '2024-03-20', type: 'expense', amount: 400_000 }),
        bill({ id: 'far', next_due: '2024-05-01', type: 'income', amount: 5_000_000 }), // outside window
        bill({ id: 'paused', next_due: '2024-03-20', type: 'income', is_active: false, amount: 1 }),
      ],
      BASE,
      TABLE,
      14,
      NOW,
    )
    expect(total).toBe(5_000_000)
  })

  it('skips a schedule it cannot value rather than treating it as zero', () => {
    const total = incomeAhead(
      [bill({ id: 'eur', next_due: '2024-03-20', type: 'income', currency: 'EUR', amount: 1_000 })],
      BASE,
      NO_RATES,
      14,
      NOW,
    )
    expect(total).toBe(0)
  })
})

describe('forecastMonthEnd', () => {
  it('projects spendable cash forward using the steady burn rate', () => {
    // March 15 -> 16 days strictly after today remain in the month (16..31).
    const f = forecastMonthEnd({
      spendable: 1_000_000,
      scheduledIncome: 500_000,
      billsAhead: 200_000,
      dailyBurn: 20_000,
      now: NOW,
    })
    expect(f.current).toBe(1_000_000)
    expect(f.projected).toBe(1_000_000 + 500_000 - 200_000 - 20_000 * 16)
    expect(f.shortfall).toBe(false)
  })

  it('flags a projected shortfall before month end', () => {
    const f = forecastMonthEnd({
      spendable: 100_000,
      scheduledIncome: 0,
      billsAhead: 0,
      dailyBurn: 50_000,
      now: NOW,
    })
    expect(f.projected).toBeLessThan(0)
    expect(f.shortfall).toBe(true)
  })

  it('does not double-count today — the last day of the month projects zero days forward', () => {
    const lastDay = new Date('2024-03-31T12:00:00')
    const f = forecastMonthEnd({
      spendable: 100_000,
      scheduledIncome: 0,
      billsAhead: 0,
      dailyBurn: 999_999,
      now: lastDay,
    })
    expect(f.projected).toBe(100_000)
  })
})

describe('activeDays / historyDays', () => {
  it('counts distinct days with activity, not transactions', () => {
    const txns = [
      tx({ type: 'expense', amount: 1, occurred_at: '2024-03-14T08:00:00' }),
      tx({ type: 'expense', amount: 2, occurred_at: '2024-03-14T20:00:00' }),
      tx({ type: 'expense', amount: 3, occurred_at: '2024-03-13T08:00:00' }),
      tx({ type: 'expense', amount: 4, occurred_at: '2024-01-01T08:00:00' }), // outside window
    ]
    expect(activeDays(txns, 14, NOW)).toBe(2)
  })

  it('measures the age of the book from its oldest row', () => {
    expect(historyDays([tx({ type: 'expense', amount: 1, occurred_at: '2024-03-01T00:00:00' })], NOW)).toBe(15)
    expect(historyDays([], NOW)).toBe(0)
  })
})

describe('walletScore', () => {
  const healthy = {
    income: 10_000_000,
    net: 2_500_000, // 25% kept -> full marks
    runway: { reserves: 60_000_000, monthlyBurn: 7_500_000, months: 8, confident: true },
    assets: 60_000_000,
    debts: 0,
    cardUsage: 0.05,
    budgets: [{ over: false }, { over: false }],
    activeDaysLast14: 12,
    historyDays: 120,
  }

  it('scores a healthy picture near the top', () => {
    const s = walletScore(healthy)
    expect(s.score).toBeGreaterThanOrEqual(95)
    expect(s.grade).toBe('great')
    expect(s.measured).toBe(6)
  })

  it('drops the weight of signals it cannot measure instead of scoring them zero', () => {
    // No income, no budgets, no cards, brand-new book: only runway and debt count.
    const s = walletScore({
      ...healthy,
      income: 0,
      cardUsage: null,
      budgets: [],
      historyDays: 2,
    })
    expect(s.measured).toBe(2)
    expect(s.score).toBe(100)
  })

  it('punishes a thin runway and heavy debt', () => {
    const s = walletScore({
      ...healthy,
      net: 0,
      runway: { reserves: 1_000_000, monthlyBurn: 7_500_000, months: 0.13, confident: true },
      debts: 55_000_000,
      cardUsage: 0.9,
      budgets: [{ over: true }, { over: true }],
      activeDaysLast14: 1,
    })
    expect(s.score).toBeLessThan(20)
    expect(s.grade).toBe('weak')
  })

  it('points at the weakest measured signal', () => {
    const s = walletScore({ ...healthy, cardUsage: 0.79 }) // ~0, everything else full
    expect(s.weakest).toBe('card')
  })

  it('stays quiet when nothing is weak enough to act on', () => {
    // Card usage of 5% scores 94 — imperfect, but not worth nagging about.
    expect(walletScore(healthy).weakest).toBeNull()
  })

  it('scores an unspent-but-tracked book on runway alone as full', () => {
    const s = walletScore({
      ...healthy,
      income: 0,
      runway: { reserves: 5_000_000, monthlyBurn: 0, months: null, confident: true },
      cardUsage: null,
      budgets: [],
      historyDays: 2,
    })
    expect(s.parts.find((p) => p.key === 'runway')?.value).toBe(100)
  })
})

describe('gradeOf', () => {
  it('bands the score', () => {
    expect(gradeOf(90)).toBe('great')
    expect(gradeOf(80)).toBe('great')
    expect(gradeOf(65)).toBe('good')
    expect(gradeOf(45)).toBe('fair')
    expect(gradeOf(10)).toBe('weak')
  })
})
