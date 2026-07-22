import { describe, it, expect } from 'vitest'
import { computeProfit, type ProfitLine, type ProfitExpense } from './compute'

function line(overrides: Partial<ProfitLine> = {}): ProfitLine {
  return {
    product_id: 'p1',
    name: 'Nasi Goreng',
    qty: 1,
    unit_price: 15000,
    unit_cost: 9000,
    ...overrides,
  }
}

describe('computeProfit', () => {
  it('returns all zeros for an empty period', () => {
    const s = computeProfit([], [])
    expect(s).toEqual({
      penjualan: 0,
      cogs: 0,
      labaKotor: 0,
      biaya: 0,
      labaBersih: 0,
      topProducts: [],
    })
  })

  it('computes the five P&L numbers', () => {
    const lines = [
      line({ qty: 2, unit_price: 15000, unit_cost: 9000 }), // rev 30000, cost 18000
      line({ product_id: 'p2', name: 'Es Teh', qty: 3, unit_price: 5000, unit_cost: 2000 }), // rev 15000, cost 6000
    ]
    const expenses: ProfitExpense[] = [{ amount: 10000 }, { amount: 5000 }] // biaya 15000

    const s = computeProfit(lines, expenses)
    expect(s.penjualan).toBe(45000)
    expect(s.cogs).toBe(24000)
    expect(s.labaKotor).toBe(21000)
    expect(s.biaya).toBe(15000)
    expect(s.labaBersih).toBe(6000) // 21000 - 15000
  })

  it('does NOT double-count COGS from expenses (COGS is item-derived only)', () => {
    const lines = [line({ qty: 1, unit_price: 15000, unit_cost: 9000 })]
    // No expense row for the cost of goods — it must come from the line only.
    const s = computeProfit(lines, [])
    expect(s.cogs).toBe(9000)
    expect(s.biaya).toBe(0)
    expect(s.labaBersih).toBe(6000)
  })

  it('rolls up top products across sales, sorted by revenue', () => {
    const lines = [
      line({ product_id: 'p1', name: 'Nasi Goreng', qty: 1, unit_price: 15000, unit_cost: 9000 }),
      line({ product_id: 'p1', name: 'Nasi Goreng', qty: 2, unit_price: 15000, unit_cost: 9000 }),
      line({ product_id: 'p2', name: 'Es Teh', qty: 10, unit_price: 5000, unit_cost: 2000 }),
    ]
    const s = computeProfit(lines, [])
    expect(s.topProducts).toHaveLength(2)
    // Es Teh: 10 × 5000 = 50000 revenue; Nasi Goreng: 3 × 15000 = 45000.
    expect(s.topProducts[0]).toMatchObject({ key: 'p2', name: 'Es Teh', qty: 10, revenue: 50000, profit: 30000 })
    expect(s.topProducts[1]).toMatchObject({ key: 'p1', qty: 3, revenue: 45000, profit: 18000 })
  })

  it('groups deleted products (null product_id) by their snapshot name', () => {
    const lines = [
      line({ product_id: null, name: 'Kue Lama', qty: 1, unit_price: 3000, unit_cost: 1000 }),
      line({ product_id: null, name: 'Kue Lama', qty: 2, unit_price: 3000, unit_cost: 1000 }),
    ]
    const s = computeProfit(lines, [])
    expect(s.topProducts).toHaveLength(1)
    expect(s.topProducts[0]).toMatchObject({ name: 'Kue Lama', qty: 3, revenue: 9000 })
  })

  it('rounds each line independently (fractional qty)', () => {
    const lines = [line({ qty: 1.5, unit_price: 999, unit_cost: 0 })] // 1498.5 -> 1499
    const s = computeProfit(lines, [])
    expect(s.penjualan).toBe(1499)
  })
})
