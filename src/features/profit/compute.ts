/**
 * Laba-Rugi (profit & loss) — pure computation, no I/O, so it's trivially
 * testable. All money is integer minor units.
 *
 *   Penjualan (revenue)   = Σ (qty × unit_price) over sale line items
 *   Modal Terjual (COGS)  = Σ (qty × unit_cost)  over sale line items
 *   Laba Kotor (gross)    = Penjualan − COGS
 *   Biaya (operating)     = Σ expense transactions in the period
 *   Laba Bersih (net)     = Laba Kotor − Biaya
 *
 * COGS is derived from the line items ONLY — never from a separate expense
 * transaction — so it is never double-counted. Each line is rounded on its own
 * so revenue here matches the sum of the sale totals recorded at the till.
 */

/** A sale line item, as needed for the P&L (price/cost snapshots). */
export interface ProfitLine {
  product_id: string | null
  name: string
  qty: number
  unit_price: number
  unit_cost: number
}

/** One operating cost, already valued in the report currency (minor units). */
export interface ProfitExpense {
  amount: number
}

/** Per-product roll-up for the "top produk" breakdown. */
export interface ProductBreakdown {
  /** product_id when present, else the snapshot name — groups deleted products by name. */
  key: string
  name: string
  qty: number
  revenue: number
  profit: number
}

export interface ProfitSummary {
  penjualan: number
  cogs: number
  labaKotor: number
  biaya: number
  labaBersih: number
  /** Products sorted by revenue, highest first. */
  topProducts: ProductBreakdown[]
}

const lineRevenue = (l: ProfitLine) => Math.round(l.qty * l.unit_price)
const lineCost = (l: ProfitLine) => Math.round(l.qty * l.unit_cost)

export function computeProfit(lines: ProfitLine[], expenses: ProfitExpense[]): ProfitSummary {
  let penjualan = 0
  let cogs = 0
  const byProduct = new Map<string, ProductBreakdown>()

  for (const line of lines) {
    const revenue = lineRevenue(line)
    const cost = lineCost(line)
    penjualan += revenue
    cogs += cost

    const key = line.product_id ?? `name:${line.name}`
    const entry = byProduct.get(key)
    if (entry) {
      entry.qty += line.qty
      entry.revenue += revenue
      entry.profit += revenue - cost
    } else {
      byProduct.set(key, {
        key,
        name: line.name,
        qty: line.qty,
        revenue,
        profit: revenue - cost,
      })
    }
  }

  const biaya = expenses.reduce((sum, e) => sum + e.amount, 0)
  const labaKotor = penjualan - cogs
  const labaBersih = labaKotor - biaya

  const topProducts = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue)

  return { penjualan, cogs, labaKotor, biaya, labaBersih, topProducts }
}
