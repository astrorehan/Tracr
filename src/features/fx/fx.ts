import { getCurrency } from '@/lib/currencies'
import type { FxRate } from '@/types/db'

/**
 * FX conversion is DISPLAY-ONLY. Stored native amounts are never rewritten — we
 * only compute an estimate in another currency for aggregate views (net worth,
 * "now"). Historical accuracy comes from the per-transaction `base_amount`
 * snapshot, not from this module.
 *
 * A rate row means: 1 unit of `base` = `rate` units of `quote`. We index the
 * latest rate per directed pair (as of an optional date) and triangulate
 * through the user's base currency when no direct pair exists.
 */

export interface RateTable {
  /** directed pair "FROM>TO" -> rate (FROM->TO). Includes inverses. */
  pairs: Map<string, number>
  base: string
}

const key = (from: string, to: string) => `${from}>${to}`

/**
 * Build a lookup from raw rate rows. For each directed pair we keep the row with
 * the greatest `as_of` that is still <= `asOf` (or the latest overall when
 * `asOf` is omitted). The inverse direction is derived automatically.
 */
export function buildRateTable(rates: FxRate[], baseCurrency: string, asOf?: string): RateTable {
  const best = new Map<string, FxRate>()
  for (const r of rates) {
    if (asOf && r.as_of > asOf) continue
    const k = key(r.base, r.quote)
    const cur = best.get(k)
    if (!cur || r.as_of > cur.as_of) best.set(k, r)
  }
  const pairs = new Map<string, number>()
  for (const r of best.values()) {
    pairs.set(key(r.base, r.quote), r.rate)
    // Only fill the inverse if it wasn't given explicitly.
    const inv = key(r.quote, r.base)
    if (!best.has(inv)) pairs.set(inv, 1 / r.rate)
  }
  return { pairs, base: baseCurrency }
}

/** Rate to convert one major unit of `from` into `to`, or null if unknown. */
export function rateBetween(from: string, to: string, table: RateTable): number | null {
  if (from === to) return 1
  const direct = table.pairs.get(key(from, to))
  if (direct != null) return direct
  // Triangulate through the base currency.
  const fromBase = from === table.base ? 1 : table.pairs.get(key(from, table.base))
  const baseTo = to === table.base ? 1 : table.pairs.get(key(table.base, to))
  if (fromBase != null && baseTo != null) return fromBase * baseTo
  return null
}

/**
 * Convert an integer minor-unit amount from one currency to another, accounting
 * for differing decimal places. Returns minor units of `to`, or null when no
 * rate is available (callers should fall back to the native amount + a hint,
 * never to a wrong/zero number).
 */
export function convertMinor(
  minor: number,
  from: string,
  to: string,
  table: RateTable,
): number | null {
  if (from === to) return minor
  const rate = rateBetween(from, to, table)
  if (rate == null) return null
  const major = minor / 10 ** getCurrency(from).decimals
  const converted = major * rate
  return Math.round(converted * 10 ** getCurrency(to).decimals)
}
