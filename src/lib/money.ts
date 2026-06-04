import { getCurrency } from './currencies'
import { evalExpression, isExpression } from './calc'

/**
 * Money is represented as integer minor units (e.g. cents). All conversions go
 * through here so we never accumulate floating-point drift on balances.
 */

/** Parse a user-entered major-unit amount ("1.234,5" / "1234.5") to minor units. */
export function toMinorUnits(input: string | number, currencyCode: string): number {
  const { decimals } = getCurrency(currencyCode)
  let value: number
  if (typeof input === 'number') {
    value = input
  } else {
    // Normalize: strip currency symbols/spaces, treat last separator as decimal.
    const cleaned = input.trim().replace(/[^0-9.,-]/g, '')
    value = parseFlexibleNumber(cleaned)
  }
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10 ** decimals)
}

/**
 * Like {@link toMinorUnits}, but first evaluates arithmetic expressions
 * (`12000+3500`). Falls back to flexible number parsing for plain numbers, so
 * grouped values like "1.234,5" still parse correctly.
 */
export function amountToMinor(input: string, currencyCode: string): number {
  if (isExpression(input)) {
    const value = evalExpression(input.trim())
    if (value != null) {
      const { decimals } = getCurrency(currencyCode)
      return Math.round(value * 10 ** decimals)
    }
  }
  return toMinorUnits(input, currencyCode)
}

/** Convert integer minor units back to a major-unit float (for inputs/charts). */
export function fromMinorUnits(minor: number, currencyCode: string): number {
  const { decimals } = getCurrency(currencyCode)
  return minor / 10 ** decimals
}

/** Format minor units as a localized currency string. */
export function formatMoney(
  minor: number,
  currencyCode: string,
  opts: { locale?: string; signDisplay?: 'auto' | 'never' | 'always' } = {},
): string {
  const meta = getCurrency(currencyCode)
  const value = fromMinorUnits(minor, currencyCode)
  const locale = opts.locale ?? undefined

  if (!meta.crypto) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: meta.code,
        minimumFractionDigits: meta.decimals,
        maximumFractionDigits: meta.decimals,
        signDisplay: opts.signDisplay ?? 'auto',
      }).format(value)
    } catch {
      // Unknown ISO code — fall through to manual formatting.
    }
  }

  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: meta.decimals,
    signDisplay: opts.signDisplay ?? 'auto',
  }).format(value)
  return `${meta.symbol}${number}`
}

/** Signed delta a transaction applies to its account balance. */
export function signedAmount(type: 'income' | 'expense' | 'transfer', amountMinor: number): number {
  if (type === 'income') return amountMinor
  return -amountMinor
}

function parseFlexibleNumber(s: string): number {
  if (!s) return NaN
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // Last separator is the decimal one; the other is a grouping separator.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // Treat a lone comma as decimal separator.
    s = s.replace(',', '.')
  }
  return parseFloat(s)
}
